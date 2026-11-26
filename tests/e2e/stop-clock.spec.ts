import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { closeHostFold, closeRoundsByHand, openHostFold } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Stop the Clock has no time-left display once the game clock is hidden', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'This flow opens the host, TV and phone together.');
  await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(host.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'No reference clock', startFrom: 'timed-quiz' } })).json()).data;
  const definition = {
    formatVersion: 2, title: 'No reference clock', startNodeKey: 'clock', edges: [],
    nodes: [{ key: 'clock', stages: [{ key: 'main', kind: 'minigame', prompt: 'Stop at the target', game: 'stop-clock',
      durationMs: 30_000, countdownSeconds: 1, settings: { targetMs: 8000, visibleMs: 0 } }] }],
  };
  const saved = (await (await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  expect((await host.request.post(`${games}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await openHostFold(host, 'Shared screen');
  await host.getByRole('button', { name: 'Create display link' }).click();
  const href = (await host.getByRole('link', { name: 'Open shared display' }).getAttribute('href'))!;
  await closeHostFold(host);
  await closeRoundsByHand(host);

  const phoneContext = await browser.newContext({ viewport: { width: 320, height: 568 } });
  const display = await host.context().newPage();
  try {
    await display.goto(href);
    const phone = await phoneContext.newPage();
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill('Ada');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(host.getByText('Ada · connected')).toBeVisible();
    await host.getByRole('button', { name: 'Start the game' }).click();
    const stop = phone.getByRole('button', { name: 'Stop', exact: true });
    await expect(stop).toBeVisible();
    await expect(phone.locator('.mg-clock')).toHaveText('??.??');
    for (const screen of [host, display, phone]) {
      await expect(screen.getByRole('group', { name: 'This round' })).toBeVisible();
      await expect(screen.getByRole('timer', { name: 'Time left' })).toHaveCount(0);
    }
    await expect(host.getByRole('button', { name: 'Set the time' })).toBeVisible();
    await stop.click();
    await expect(phone.locator('.mg-done')).toBeVisible();
    await host.getByRole('button', { name: 'Close answers', exact: true }).click();
    await host.getByRole('button', { name: 'Reveal results', exact: true }).click();
    const result = phone.getByRole('region', { name: 'Round results' });
    await expect(result.locator('dt')).toHaveText(['Target', 'You stopped at']);
    await expect(result.locator('dd').first()).toHaveText('8.00 s');
    await expect(result).toContainText(/\d+\.\d{2} s off/);
    await expect(result).toContainText('+10 pts');
    await expect(result.locator('.mg-podium')).toHaveCount(0);
    await expect(result.getByText('Points this round', { exact: true })).toHaveCount(0);
    for (const [width, height] of [[320, 568], [360, 640], [390, 844], [667, 375]] as const) {
      await phone.setViewportSize({ width, height });
      const fits = await result.evaluate(node => node.getBoundingClientRect().bottom <= document.querySelector('.phone-dock-buttons')!.getBoundingClientRect().top);
      expect(fits, `${width} × ${height}`).toBe(true);
    }
    await expect(display.locator('.mg-podium .first')).toContainText('10 pts');

  } finally {
    await display.close();
    await phoneContext.close();
  }
});
