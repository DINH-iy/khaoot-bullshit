import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { closeRoundsByHand } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Cut the Line takes a whole-percent cut on a phone and reveals its error', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The phone uses a separate narrow touch context.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'Precision night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = {
    formatVersion: 2, title: 'Precision night', startNodeKey: 'cut', edges: [],
    nodes: [{ key: 'cut', stages: [{ key: 'main', kind: 'minigame', prompt: 'Make the cut', game: 'cut-the-line', durationMs: 20_000, countdownSeconds: 1 }] }],
  };
  const saved = (await (await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await host.getByRole('button', { name: 'Try minigame' }).click();
  const practice = host.getByRole('dialog', { name: 'Preview' });
  await practice.getByRole('button', { name: 'Start practice' }).click();
  const practiceMarker = practice.getByRole('slider', { name: 'Cut position' });
  await expect(practiceMarker).toHaveValue('50');
  const practiceTarget = Number((await practice.getByText(/^Cut at \d+%$/).textContent())!.match(/\d+/)![0]);
  await practice.getByRole('button', { name: 'Lock in cut' }).click();
  await expect(practice.getByRole('status')).toHaveText(`50% · ${Math.abs(50 - practiceTarget)} pp off`);
  expect((await host.request.post(`${games}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);

  const mobile = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  try {
    const phone = await mobile.newPage();
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill('Ada');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await host.getByRole('button', { name: 'Start the game' }).click();
    const marker = phone.getByRole('slider', { name: 'Cut position' });
    await expect(marker).toBeVisible();
    const targetLabel = phone.getByText(/^Cut at \d+%$/);
    const target = Number((await targetLabel.textContent())!.match(/\d+/)![0]);
    await expect(host.getByText(`Cut at ${target}%`, { exact: true })).toBeVisible();
    await marker.tap({ position: { x: 20, y: 24 } });
    const tapped = Number(await marker.inputValue());
    expect(tapped).toBeLessThan(50);
    await marker.press('ArrowRight');
    await expect(marker).toHaveValue(String(tapped + 1));
    const cut = tapped + 1;
    const result = `${cut}% · ${Math.abs(cut - target)} pp off`;
    await phone.getByRole('button', { name: 'Lock in cut' }).tap();
    await expect(phone.getByText(result, { exact: true })).toBeVisible();
    await expect(host.getByText(result, { exact: true })).toHaveCount(0);
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(host.locator('.mg-podium .first')).toContainText(result);
  } finally {
    await mobile.close();
  }
});
