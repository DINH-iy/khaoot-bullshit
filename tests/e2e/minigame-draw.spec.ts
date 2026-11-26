import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { closeRoundsByHand } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
// Optional: a folder for screenshots of each moment, to review the look by eye.
const shots = process.env['DRAW_SHOTS'];
const shoot = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };

const games = [['tap', 'tap-race', 'Tap race'], ['react', 'reaction', 'Reaction'], ['relay', 'relay-drawing', 'Pass the pencil']] as const;
const definition = {
  formatVersion: 2, title: 'Draw night', startNodeKey: 'draw',
  nodes: [
    { key: 'draw', stages: [{ key: 'main', kind: 'route', prompt: 'Which minigame will it be?', durationMs: null, decide: { method: 'draw' },
      options: games.map(([key, , label]) => ({ key, label })) }] },
    ...games.map(([key, game, label]) => ({ key: `play-${key}`, stages: [{ key: 'main', kind: 'minigame', prompt: `${label}!`, game, durationMs: 30_000,
      // A team game in the draw gets teams for that round only.
      ...(game === 'relay-drawing' ? { play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'count', teams: 2 }, formation: 'random' } }, answers: 'everyone', points: 'members' } } : {}) }] })),
  ],
  edges: games.map(([key]) => ({ key: `to-${key}`, from: 'draw', to: `play-${key}`, option: key })),
};

test('a minigame draw: the author picks the games, the host draws, every screen lands on the same game, and it is played', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The phone uses a separate narrow touch context.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID(); const roomId = randomUUID();
  const api = `${baseURL}/api/host/games`; const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(api, { headers, data: { gameId, title: 'Draw night', startFrom: 'timed-quiz' } })).json()).data;
  expect((await host.request.put(`${api}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);

  // The editor: the draw's games, each a minigame (team games say they get teams for the round), with red remove buttons.
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  const list = host.getByRole('group', { name: 'Games in the draw' });
  await expect(list.getByRole('combobox', { name: /^Game \d/ })).toHaveCount(3);
  await expect(list.getByRole('button', { name: 'Remove game 1' })).toHaveClass(/danger-icon/);
  await shoot(host, '1-editor');
  // Trying the scene plays the same draw in the editor.
  await host.getByRole('button', { name: 'Try this scene' }).click();
  const practice = host.getByRole('dialog', { name: 'Preview' });
  await expect(practice.locator('.draw-card')).toHaveCount(3);
  await practice.getByRole('button', { name: 'Draw a game' }).click();
  await expect(practice.locator('.draw-card.is-drawn')).toHaveCount(1);
  await shoot(host, '1b-editor-try');
  await practice.getByRole('button', { name: 'Close', exact: true }).click();

  const saved = (await (await host.request.get(`${api}/${gameId}`, { headers })).json()).data;
  expect((await host.request.post(`${api}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);

  // One phone that asks for less motion (it shows the drawn game at once) and one that plays the shuffle.
  const calm = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  // Tests run with reduced motion (playwright.config.ts); this phone turns it back on.
  const lively = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference',
    ...(shots ? { recordVideo: { dir: shots, size: { width: 390, height: 844 } } } : {}) });
  try {
    const [ada, ben] = [await calm.newPage(), await lively.newPage()];
    for (const [phone, name] of [[ada, 'Ada'], [ben, 'Ben']] as const) {
      await phone.goto(`${baseURL}/?code=${code}`);
      await phone.getByLabel('Your name').fill(name);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(host.getByText(`${name} · connected`, { exact: false })).toBeVisible();
    }
    await host.getByRole('button', { name: 'Start the game' }).click();
    const cards = (page: Page) => page.getByRole('region', { name: 'The games in the draw' }).locator('.draw-card');
    for (const page of [host, ada, ben]) await expect(cards(page)).toHaveCount(3);
    await expect(ben.getByText('The host draws soon.')).toBeVisible();
    await expect(ben.getByRole('button', { name: 'Save vote' })).toHaveCount(0);
    await shoot(host, '2-host-before'); await shoot(ben, '3-phone-before');

    await host.getByRole('button', { name: 'Draw a game', exact: true }).click();
    // The shuffle: cards face down with one lit, then the drawn card face up.
    await expect(ben.locator('.draw-card.is-lit')).toHaveCount(1);
    await shoot(ben, '4-phone-cycling');
    const drawn = ben.locator('.draw-card.is-drawn');
    await expect(drawn).toHaveCount(1, { timeout: 8000 });
    const name = (await drawn.locator('strong').textContent())!;
    await expect(ada.locator('.draw-card.is-drawn strong')).toHaveText(name);
    await expect(host.locator('.draw-card.is-drawn strong')).toHaveText(name, { timeout: 8000 });
    for (const page of [host, ada, ben]) await expect(page.getByRole('status').filter({ hasText: `Next up: ${name}` })).toBeVisible();
    await shoot(ben, '5-phone-drawn'); await shoot(host, '6-host-drawn');

    // Drawn once: a reload shows the same game straight away, and the next scene is that game.
    await ben.reload();
    await expect(ben.locator('.draw-card.is-drawn strong')).toHaveText(name);
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    if (name === 'Pass the pencil') {
      await expect(ben.getByRole('region', { name: 'Team forming' })).toBeVisible();
      await host.getByRole('button', { name: 'Start round with these teams' }).click();
    }
    await expect(ben.getByRole('heading', { name: `${name}!` })).toBeVisible();
  } finally {
    await calm.close(); await lively.close();
  }
});
