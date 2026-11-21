import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { chooseOption, closeRoundsByHand } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

async function createGame(page: Page, baseURL: string, definition: object & { title: string }) {
  await page.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const headers = { 'x-party-request': '1', origin: baseURL };
  const url = `${baseURL}/api/host/games`;
  const draft = (await (await page.request.post(url, { headers, data: { gameId, title: definition.title, startFrom: 'timed-quiz' } })).json()).data;
  const save = await page.request.put(`${url}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } });
  expect(save.ok()).toBe(true);
  const revision = (await save.json()).data.revision as number;
  return { gameId, headers, url, revision };
}

test('Clap the beat scores synthetic microphone input and taps, then releases the microphone', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The player uses a separate mobile context.');
  await host.emulateMedia({ reducedMotion: 'no-preference' });
  await host.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (Array.isArray(frames) && frames.some(frame => (frame as Keyframe).filter === 'blur(16px)') && this.querySelector('.mg-screen')) {
        document.documentElement.dataset['testMinigameAnimation'] = 'blur';
      }
      return animate.call(this, frames, options);
    };
  });
  const definition = {
    presentation: { animations: { minigameEnter: { preset: 'blur' } } },
    formatVersion: 2, title: 'Rhythm', startNodeKey: 'rhythm', edges: [],
    nodes: [{ key: 'rhythm', stages: [{ key: 'main', kind: 'minigame', prompt: 'Rhythm test', game: 'clap-beat', durationMs: 12_000, countdownSeconds: 5 }] }],
  };
  const { gameId, headers, url, revision } = await createGame(host, baseURL!, definition);
  expect((await host.request.post(`${url}/${gameId}/publish`, { headers, data: { expectedRevision: revision } })).ok()).toBe(true);
  const roomId = randomUUID();
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  await closeRoundsByHand(host);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);

  const mobile = await browser.newContext({ viewport: { width: 390, height: 820 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  try {
    await mobile.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const volume = audio.createGain();
        volume.gain.value = 0;
        const output = audio.createMediaStreamDestination();
        oscillator.connect(volume).connect(output);
        oscillator.start();
        const track = output.stream.getAudioTracks()[0]!;
        document.documentElement.dataset['testMic'] = 'live';
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); void audio.close(); document.documentElement.dataset['testMic'] = 'stopped'; };
        window.addEventListener('test-clap', () => {
          volume.gain.setValueAtTime(0.35, audio.currentTime);
          volume.gain.setValueAtTime(0, audio.currentTime + 0.08);
        });
        await audio.resume();
        return output.stream;
      } });
    });
    const phone = await mobile.newPage();
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill('Ada');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(phone.getByRole('button', { name: 'Change my look' })).toBeVisible();
    await host.getByRole('button', { name: 'Start the game' }).click();
    await expect(host.locator('html')).toHaveAttribute('data-test-minigame-animation', 'blur');
    await phone.getByRole('button', { name: 'Use microphone', exact: true }).click();
    await expect(phone.locator('html')).toHaveAttribute('data-test-mic', 'live');
    const now = phone.getByText('Clap or tap now!', { exact: true });
    await expect(now).toBeVisible();
    await phone.evaluate(() => window.dispatchEvent(new Event('test-clap')));
    await expect(phone.getByText('1 of 6 beats')).toBeVisible();
    await expect(now).toBeHidden();
    await expect(now).toBeVisible();
    await phone.getByRole('button', { name: 'Tap beat', exact: true }).click();
    await expect(phone.getByText('2 of 6 beats')).toBeVisible();
    await expect(phone.getByText('2 / 6', { exact: true })).toBeVisible();
    await expect(phone.locator('html')).toHaveAttribute('data-test-mic', 'stopped');
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(host.getByRole('region', { name: 'Round results' })).toContainText('2 / 6');
  } finally { await mobile.close().catch(() => undefined); }
});

test('saved editor history and a remapped Undo survive a reload', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Desktop editor keyboard shortcuts.');
  await page.setViewportSize({ width: 1440, height: 900 });
  const quiz = (key: string, prompt: string) => ({
    key, stages: [{ key: 'main', kind: 'collect', prompt, durationMs: 20_000,
      input: { kind: 'choice', options: [{ key: 'a', label: 'One' }, { key: 'b', label: 'Two' }] },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '1000' } }],
  });
  const definition = { formatVersion: 2, title: 'Saved edits', startNodeKey: 'one',
    nodes: [quiz('one', 'First question'), quiz('two', 'Second question')], edges: [{ key: 'next', from: 'one', to: 'two' }] };
  const { gameId, headers, url } = await createGame(page, baseURL!, definition);
  const editorUrl = `${baseURL}/?edit=${gameId}&view=scene`;
  await page.goto(editorUrl);
  const prompt = page.locator('.scene-canvas').getByRole('textbox', { name: 'Question or instruction', exact: true });
  await expect(prompt).toHaveValue('First question');
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Help & shortcuts' });
  await chooseOption(help.getByLabel('Undo (only your own changes).'), '1');
  await help.getByRole('button', { name: 'Close', exact: true }).click();
  await prompt.fill('Edited question');
  const path = `${url}/${gameId}`;
  const read = async () => (await (await page.request.get(path, { headers })).json()).data;
  await expect.poll(async () => (await read()).definition.nodes[0].stages[0].prompt).toBe('Edited question');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('party.editor.history.v1:')))).toBe(true);

  // A newer draft version keeps an independent edit while our earlier change is undone.
  const latest = await read();
  latest.definition.nodes[1].stages[0].prompt = 'Collaborator question';
  expect((await page.request.put(`${path}/draft`, { headers, data: { expectedRevision: latest.revision, definition: latest.definition } })).ok()).toBe(true);
  await page.reload();
  await expect(prompt).toHaveValue('Edited question');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.keyboard.press('Alt+Shift+Digit1');
  await expect(prompt).toHaveValue('First question');
  await expect.poll(async () => (await read()).definition.nodes.map((node: { stages: { prompt: string }[] }) => node.stages[0]?.prompt)).toEqual(['First question', 'Collaborator question']);
});

test('editor practice plays a draft quiz and minigame without opening a room', async ({ page, context, baseURL }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const audio = new AudioContext();
      const stream = audio.createMediaStreamDestination().stream;
      const track = stream.getAudioTracks()[0]!;
      const stop = track.stop.bind(track);
      track.stop = () => { stop(); void audio.close(); document.documentElement.dataset['practiceMic'] = 'stopped'; };
      document.documentElement.dataset['practiceMic'] = 'live';
      return stream;
    } });
  });
  const definition = {
    formatVersion: 2, title: 'Local scene practice', startNodeKey: 'quiz',
    edges: [{ key: 'next', from: 'quiz', to: 'doors' }, { key: 'rhythm', from: 'doors', to: 'clap' }],
    nodes: [{
      key: 'quiz', stages: [
        { key: 'main', kind: 'collect', prompt: 'Choose an answer', durationMs: 20_000,
          input: { kind: 'choice', options: [{ key: 'a', label: 'Correct option' }, { key: 'b', label: 'Other option' }] },
          scoring: { kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '10000' } },
        { key: 'writing', kind: 'collect', prompt: 'Write a line', durationMs: null,
          input: { kind: 'text', maxLength: 140 }, scoring: { kind: 'none' } },
      ],
    }, {
      key: 'doors', stages: [{ key: 'main', kind: 'minigame', prompt: 'Pick a prize', game: 'lucky-doors', durationMs: 12_000,
        countdownSeconds: 1, settings: { doorsMilli: ['3000', '7000'], order: 'fixed' } }],
    }, {
      key: 'clap', stages: [{ key: 'main', kind: 'minigame', prompt: 'Play along', game: 'clap-beat', durationMs: 12_000 }],
    }],
  };
  const { gameId, headers, url, revision } = await createGame(page, baseURL!, definition);
  const editorUrl = `${baseURL}/?edit=${gameId}&view=scene`;
  await page.goto(editorUrl);
  const roomWrites: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/(host\/rooms|rooms\/)|\/rehearse$/.test(request.url())) roomWrites.push(request.url());
  });
  await page.getByRole('button', { name: 'Try this scene' }).click();
  const practice = page.getByRole('dialog', { name: 'Preview' });
  await practice.getByRole('button', { name: 'Start practice' }).click();
  await practice.getByRole('radio', { name: 'Correct option' }).check();
  await practice.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(practice.getByRole('status')).toContainText('Correct · 10 points');
  await practice.getByRole('button', { name: 'Next part' }).click();
  await practice.getByRole('button', { name: 'Start practice' }).click();
  await practice.getByRole('textbox').fill('A test answer');
  await practice.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(practice.getByRole('status')).toContainText('Practice answer submitted');
  await practice.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Minigame Pick a prize', exact: true }).click();
  const tryMinigame = page.getByRole('button', { name: 'Try this scene', exact: true });
  await tryMinigame.click();
  await expect(practice.locator('.phone-screen')).toBeVisible();
  await practice.getByRole('button', { name: 'Start practice' }).click();
  await practice.getByRole('button', { name: 'Door 2', exact: true }).click();
  await expect(practice.getByRole('status')).toHaveText('7 points');
  await practice.getByRole('button', { name: 'Restart' }).click();
  await practice.getByRole('button', { name: 'Door 1', exact: true }).click();
  await expect(practice.getByRole('status')).toHaveText('3 points');
  await page.keyboard.press('Escape');
  await expect(practice).toBeHidden();
  await expect(tryMinigame).toBeFocused();

  await page.getByRole('button', { name: 'Minigame Play along', exact: true }).click();
  await tryMinigame.click();
  await practice.getByRole('button', { name: 'Start practice' }).click();
  await practice.getByRole('button', { name: 'Use microphone' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-practice-mic', 'live');
  await practice.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-practice-mic', 'stopped');

  expect(context.pages()).toHaveLength(1);
  expect(roomWrites).toEqual([]);
  await expect(page).toHaveURL(editorUrl);
  const latest = await (await page.request.get(`${url}/${gameId}`, { headers })).json();
  expect(latest.data.revision).toBe(revision);
});
