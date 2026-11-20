import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { closeHostFold, closeRoundsByHand, openHostFold, openPhoneMenu } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Heads or Tails settles a solo stake and reveals one shared coin after private guesses', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The playing phone uses a separate narrow touch context.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'Coin night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = {
    formatVersion: 2, title: 'Coin night', startNodeKey: 'coin', edges: [], chips: true,
    nodes: [{ key: 'coin', stages: [{ key: 'main', kind: 'minigame', prompt: 'Pick a side', game: 'heads-or-tails',
      durationMs: 15_000, countdownSeconds: 1, placementMilli: ['7000'] }] }],
  };
  const saved = (await (await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await expect(host.getByLabel('Points per correct guess')).toHaveValue('7');
  expect((await host.request.post(`${games}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);
  await openHostFold(host, 'Shared screen');
  await host.getByRole('button', { name: 'Create display link' }).click();
  const href = (await host.getByRole('link', { name: 'Open shared display' }).getAttribute('href'))!;
  await closeHostFold(host);
  const display = await host.context().newPage();
  const mobile = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  try {
    await display.goto(href);
    await expect(display.getByRole('heading', { name: `Room ${code}` })).toBeVisible();
    const phone = await mobile.newPage();
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill('Ada');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(host.getByText('Ada', { exact: true }).first()).toBeVisible();

    await (await openPhoneMenu(phone)).getByRole('button', { name: 'Games', exact: true }).click();
    const sheet = phone.getByRole('dialog', { name: 'Side games' });
    await sheet.getByRole('button', { name: 'Heads or Tails', exact: true }).click();
    await expect(sheet.getByRole('radio', { name: 'Free' })).toBeChecked();
    const count = sheet.locator('.chip-pill strong');
    const before = Number((await count.textContent())!.replace(/\D/g, ''));
    await sheet.getByRole('radio', { name: '25', exact: true }).check();
    await sheet.getByRole('button', { name: 'Heads', exact: true }).tap();
    const solo = sheet.getByText(/^It landed on (Heads|Tails)$/);
    await expect(solo).toBeVisible();
    const won = (await solo.textContent())!.endsWith('Heads');
    await expect(count).toContainText(String(before + (won ? 25 : -25)));

    await host.getByRole('button', { name: 'Start the game' }).click();
    await expect(sheet).toHaveCount(0);
    await phone.getByRole('button', { name: 'Tails', exact: true }).tap();
    await expect(phone.locator('.mg-done')).toContainText('Tails');
    await expect(display.locator('.coin-reveal')).toHaveCount(0);
    await expect(display.locator('.mg-podium')).toHaveCount(0);
    await host.getByRole('button', { name: 'Close answers' }).click();
    const shared = display.getByText(/^It landed on (Heads|Tails)$/);
    await expect(shared).toBeVisible();
    await expect(display.locator('.coin-scene')).toHaveCount(1);
    await expect(phone.locator('.coin-scene')).toHaveCount(0);
    await expect(phone.getByText((await shared.textContent())!, { exact: true })).toBeVisible();
    const row = display.locator('.mg-podium li').filter({ hasText: 'Ada' });
    await expect(row).toContainText((await shared.textContent())!.endsWith('Tails') ? 'Correct guess' : 'Wrong guess');
  } finally {
    await mobile.close();
    await display.close();
  }
});
