import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { closeRoundsByHand } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
const shots = process.env['DRAW_SHOTS'];
const shoot = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };

const quiz = (key: string, prompt: string, extra: object = {}) => ({ key, stages: [{ key: 'main', kind: 'collect', prompt, durationMs: 7000,
  input: { kind: 'choice', layout: 'tiles', options: [{ key: 'a', label: 'Yes' }, { key: 'b', label: 'No' }] }, scoring: { kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '1000' }, ...extra }] });
// The game shows time as a clock; the second scene keeps the numbers (a scene's own look).
const definition = {
  formatVersion: 1, title: 'Clock night', startNodeKey: 'one', presentation: { theme: { timerStyle: 'clock' } },
  nodes: [quiz('one', 'Is this a clock?'), quiz('two', 'And now numbers?', { presentation: { theme: { timerStyle: 'digits' } } })],
  edges: [{ key: 'one-two', from: 'one', to: 'two' }],
};

test('the timer can be a round clock that empties and turns red at the end, per game and per scene', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The phone uses a separate narrow context.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID(); const roomId = randomUUID();
  const api = `${baseURL}/api/host/games`; const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(api, { headers, data: { gameId, title: 'Clock night', startFrom: 'timed-quiz' } })).json()).data;
  expect((await host.request.put(`${api}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  const saved = (await (await host.request.get(`${api}/${gameId}`, { headers })).json()).data;
  expect((await host.request.post(`${api}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' });
  try {
    const phone = await context.newPage();
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill('Ada');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(host.getByText('Ada · connected', { exact: false })).toBeVisible();
    await host.getByRole('button', { name: 'Start the game' }).click();

    // A clock instead of “0:07 left”; the time is still read out (and shown on hover).
    const clock = phone.locator('.chip-timer .timer-clock');
    await expect(clock).toBeVisible();
    await expect(phone.getByRole('timer')).toHaveText(/left/);
    await expect(phone.locator('.chip-timer .timer')).toHaveAttribute('title', /left/);
    await shoot(phone, 'clock-1-running');
    // The last seconds: red; then time is up: it flashes.
    await expect(phone.locator('.timer-clock.ending')).toBeVisible({ timeout: 5000 });
    await shoot(phone, 'clock-2-ending');
    await expect(phone.locator('.timer-clock.up')).toBeVisible({ timeout: 8000 });
    await shoot(phone, 'clock-3-time-up');
    await shoot(host, 'clock-4-host');

    // The next scene keeps the numbers.
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(phone.getByRole('heading', { name: 'And now numbers?' })).toBeVisible();
    await expect(phone.locator('.chip-timer')).toContainText(/left/);
    await expect(phone.locator('.timer-clock')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
