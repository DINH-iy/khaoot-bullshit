import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { closeRoundsByHand } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('players finish the same graph in their own colors and the host reveals all guesses together', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'One player uses a separate touch context.');
  await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'Graph night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = {
    formatVersion: 2, title: 'Graph night', startNodeKey: 'graph', edges: [],
    nodes: [{ key: 'graph', stages: [{ key: 'main', kind: 'minigame', prompt: 'Finish the chart', game: 'draw-the-graph',
      countdownSeconds: 0, durationMs: 60_000, settings: { graph: { visible: [16, 30, 50], hidden: [50, 50] } } }] }],
  };
  const saved = (await (await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await expect(host.getByRole('checkbox', { name: 'Use my own graph' })).toBeChecked();
  await expect(host.getByLabel('Hidden values')).toHaveValue('50, 50');
  expect((await host.request.post(`${games}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 720 }, isMobile: true, hasTouch: true });
  const keyboardContext = await browser.newContext({ viewport: { width: 400, height: 720 } });
  try {
    const touchPhone = await touchContext.newPage();
    const keyboardPhone = await keyboardContext.newPage();
    const phones = [[touchPhone, 'Ada'], [keyboardPhone, 'Sam']] as const;
    await Promise.all(phones.map(async ([phone, name]) => {
      await phone.goto(`${baseURL}/?code=${code}`);
      await phone.getByLabel('Your name').fill(name);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(phone.getByRole('heading', { name: 'You’re in!' })).toBeVisible();
    }));
    await host.getByRole('button', { name: 'Start the game' }).click();
    const drawing = (phone: typeof touchPhone) => phone.getByRole('group', { name: 'Partial line graph' });
    await expect(drawing(touchPhone)).toBeVisible();
    await expect(drawing(keyboardPhone)).toBeVisible();
    const path = (page: typeof host) => page.locator('.graph-past').getAttribute('points');
    expect(await path(touchPhone)).toBe(await path(keyboardPhone));
    expect(await path(host)).toBe(await path(touchPhone));
    await expect(host.locator('[data-graph-answer]')).toHaveCount(0);
    await expect(drawing(touchPhone).getByRole('button', { name: /colou?r/i })).toHaveCount(0);

    const lockTouch = touchPhone.getByRole('button', { name: 'Lock in line' });
    await expect(lockTouch).toBeDisabled();
    const area = (await touchPhone.locator('.graph-draw-area').boundingBox())!;
    const cd = await touchContext.newCDPSession(touchPhone);
    const start = { x: Math.round(area.x + area.width * .06), y: Math.round(area.y + area.height * .50) };
    await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (const fraction of [.25, .5, .75, 1]) {
      await cd.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(area.x + fraction * area.width), y: start.y }] });
    }
    await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cd.detach();
    await expect(lockTouch).toBeEnabled();
    await lockTouch.tap();
    await expect(touchPhone.getByText('Line saved')).toBeVisible();
    await expect(host.locator('[data-graph-trace]')).toHaveCount(0);
    await expect(keyboardPhone.locator('[data-graph-trace]')).toHaveCount(0);

    const keys = drawing(keyboardPhone);
    for (let i = 0; i < 4; i++) await keys.press('ArrowUp');
    for (let i = 0; i < 24; i++) await keys.press('ArrowRight');
    await keyboardPhone.getByRole('button', { name: 'Lock in line' }).click();
    await expect(keyboardPhone.getByText('Line saved')).toBeVisible();
    const adaColor = await touchPhone.locator('[data-graph-trace]').getAttribute('stroke');
    const samColor = await keyboardPhone.locator('[data-graph-trace]').getAttribute('stroke');
    expect(adaColor).not.toBe(samColor);

    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(host.getByRole('img', { name: 'Actual line and player guesses' })).toBeVisible();
    await expect(host.locator('[data-graph-answer]')).toHaveCount(1);
    await expect(host.locator('[data-graph-trace]')).toHaveCount(2);
    await expect(host.locator('.graph-label text')).toHaveText(['Sam', 'Ada']);
    await expect(host.locator('.mg-podium .first')).toContainText('Ada');
    expect(await host.locator('[data-graph-trace]').evaluateAll(lines => lines.map(line => line.getAttribute('stroke')))).toEqual([samColor, adaColor]);
  } finally {
    await Promise.all([touchContext.close(), keyboardContext.close()]);
  }
});
