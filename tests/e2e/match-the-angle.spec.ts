import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { closeRoundsByHand } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Match the Angle works in editor practice and in a live room with a touch controller', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The playing phone uses a separate narrow touch context.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'Angle night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = {
    formatVersion: 2, title: 'Angle night', startNodeKey: 'angle', edges: [],
    nodes: [{ key: 'angle', stages: [{ key: 'main', kind: 'minigame', prompt: 'Aim your ray', game: 'match-the-angle', durationMs: 20_000, countdownSeconds: 1 }] }],
  };
  const saved = (await (await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await host.getByRole('button', { name: 'Try minigame' }).click();
  const practice = host.getByRole('dialog', { name: 'Preview' });
  await practice.getByRole('button', { name: 'Start practice' }).click();
  const practiceDial = practice.getByRole('slider', { name: 'Ray angle' });
  await expect(practiceDial).toHaveAttribute('aria-valuenow', '0');
  await practiceDial.press('ArrowLeft');
  await expect(practiceDial).toHaveAttribute('aria-valuenow', '359');
  await practiceDial.press('ArrowRight');
  await expect(practiceDial).toHaveAttribute('aria-valuenow', '0');
  await practice.getByRole('button', { name: 'Lock in angle' }).click();
  await expect(practice.getByRole('status')).toHaveText(/^0° · \d+° off$/);

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
    await expect(host.getByText('Ada', { exact: true }).first()).toBeVisible();
    await host.getByRole('button', { name: 'Start the game' }).click();
    const dial = phone.getByRole('slider', { name: 'Ray angle' });
    await dial.scrollIntoViewIfNeeded();
    const target = Number((await phone.getByText(/^Aim for \d+°$/).textContent())!.match(/\d+/)![0]);
    await expect(host.getByText(`Aim for ${target}°`, { exact: true })).toBeVisible();

    const box = (await dial.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const touch = await mobile.newCDPSession(phone);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x + 70, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 70 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(dial).toHaveAttribute('aria-valuenow', '90');
    await dial.press('ArrowUp');
    await expect(dial).toHaveAttribute('aria-valuenow', '91');

    const difference = Math.abs(target - 91);
    const result = `91° · ${Math.min(difference, 360 - difference)}° off`;
    await phone.getByRole('button', { name: 'Lock in angle' }).tap();
    await expect(phone.getByText(result, { exact: true })).toBeVisible();
    await expect(host.getByText(result, { exact: true })).toHaveCount(0);
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(host.locator('.mg-podium .first')).toContainText(result);
  } finally {
    await mobile.close();
  }
});
