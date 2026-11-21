import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { chooseOption, closeHostFold, closeRoundsByHand, openHostFold, openPhoneMenu } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test.use({ actionTimeout: 10_000 });

test('8-ball plays as a phone challenge and a hosted round with a live TV table', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Uses CDP for the cue gesture.');
  test.setTimeout(70_000);
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const url = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(url, { headers, data: { gameId, title: 'Pool night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = { formatVersion: 2, title: 'Pool night', startNodeKey: 'pool', edges: [],
    nodes: [{ key: 'pool', stages: [{ key: 'main', kind: 'duel', prompt: '8-ball pool', durationMs: 30_000,
      pick: 'host', betMilli: '2000', contest: { kind: 'game', game: 'eight-ball' } }] }] };
  const saved = (await (await host.request.put(`${url}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await expect(host.getByRole('button', { name: 'Team vs team' })).toBeVisible();
  expect((await host.request.post(`${url}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);
  await openHostFold(host, 'Shared screen');
  await host.getByRole('button', { name: 'Create display link' }).click();
  const link = (await host.getByRole('link', { name: 'Open shared display' }).getAttribute('href'))!;
  await closeHostFold(host);
  const tv = await host.context().newPage();
  await tv.setViewportSize({ width: 960, height: 540 });
  await tv.emulateMedia({ reducedMotion: 'no-preference' });
  await tv.goto(link);
  await expect(tv.getByRole('heading', { name: `Room ${code}` })).toBeVisible();
  const join = async (name: string) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await page.goto(`${baseURL}/?code=${code}`);
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Menu/ })).toBeVisible();
    return page;
  };
  const ada = await join('Ada'), bo = await join('Bo'), cy = await join('Cy');
  try {
    const challenges = async (page: typeof ada) => {
      await (await openPhoneMenu(page)).getByRole('button', { name: /^Challenge/ }).click();
      return page.getByRole('dialog', { name: 'Challenges' });
    };
    const outgoing = await challenges(ada);
    await outgoing.getByRole('button', { name: 'Challenge someone' }).click();
    await chooseOption(outgoing.locator('.challenge-form label').nth(0).getByRole('combobox'), { label: 'Bo' });
    await chooseOption(outgoing.locator('.challenge-form label').nth(1).getByRole('combobox'), 'eight-ball');
    await outgoing.getByRole('button', { name: 'Send challenge' }).click();
    const incoming = await challenges(bo);
    await incoming.getByRole('button', { name: 'Accept' }).click();
    await outgoing.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(outgoing.getByRole('img', { name: 'Pool table' })).toBeVisible();
    await ada.evaluate(() => Object.defineProperty(screen.orientation, 'lock', { configurable: true, value: undefined }));
    await outgoing.getByRole('button', { name: 'Landscape mode' }).click();
    const landscape = ada.getByRole('dialog', { name: 'Pool table' });
    const sidewaysTable = landscape.getByRole('img', { name: 'Pool table' });
    await expect(sidewaysTable).toBeInViewport({ ratio: 1 });
    await expect(landscape.locator('.pool-landscape-frame')).toHaveCSS('transform', /^matrix\(0, 1, -1, 0,/);
    const rotated = (await sidewaysTable.boundingBox())!;
    const rotatedX = rotated.x + rotated.width / 2;
    const rotatedY = rotated.y + 6 + (rotated.height - 12) / 4;
    const touch = await ada.context().newCDPSession(ada);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rotatedX, y: rotatedY }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rotatedX, y: rotatedY - (rotated.height - 12) * .18 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(incoming.getByRole('img', { name: 'Pool table' })).toHaveAttribute('data-shot', '1');
    await landscape.getByRole('button', { name: 'Exit landscape' }).click();
    await ada.setViewportSize({ width: 667, height: 375 });
    await expect(outgoing.getByRole('button', { name: 'Shoot' })).toBeInViewport({ ratio: 1 });
    await incoming.getByRole('button', { name: 'Give up', exact: true }).click();
    await incoming.getByRole('button', { name: 'Yes, give up' }).click();
    await expect(outgoing.locator('.h2h-result')).toContainText('Ada');
    for (const sheet of [outgoing, incoming]) await sheet.getByRole('button', { name: 'Close', exact: true }).click();

    await host.getByRole('button', { name: 'Start the game' }).click();
    const pair = host.locator('.duel-pick-row label');
    await chooseOption(pair.nth(0).getByRole('combobox'), { label: 'Ada' });
    await chooseOption(pair.nth(1).getByRole('combobox'), { label: 'Bo' });
    await host.getByRole('button', { name: 'Open voting' }).click();
    await cy.getByRole('button', { name: 'Pick Ada' }).click();
    await host.getByRole('button', { name: 'Close voting' }).click();
    const table = (page: typeof ada) => page.getByRole('img', { name: 'Pool table' });
    await expect(table(tv)).toBeInViewport({ ratio: 1 });
    await expect(table(ada)).toBeInViewport({ ratio: 1 });
    await expect(ada.getByRole('button', { name: 'Shoot' })).toBeInViewport({ ratio: 1 });
    await expect(table(bo)).toBeVisible();
    await expect(cy.getByText('Watch the shared screen', { exact: true })).toBeVisible();
    await expect(table(cy)).toHaveCount(0);

    // Pull straight back from the cue ball to shoot toward the rack.
    const box = (await table(ada).boundingBox())!;
    const x = box.x + 6 + (box.width - 12) / 4;
    const y = box.y + box.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - (box.width - 12) * .18, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(table(tv)).toHaveAttribute('data-rolling', 'true');
    for (const page of [host, tv, ada, bo]) await expect(table(page)).toHaveAttribute('data-shot', '1');
    await ada.setViewportSize({ width: 390, height: 667 });
    await expect(table(ada)).toHaveAttribute('data-shot', '1');
    await bo.getByRole('button', { name: 'Give up', exact: true }).click();
    await bo.getByRole('button', { name: 'Yes, give up' }).click();
    await expect(tv.locator('.duel-result')).toContainText('Ada');
    await expect(cy.locator('.duel-result')).toContainText('2');
  } finally {
    await Promise.all([ada.close(), bo.close(), cy.close(), tv.close()]);
  }
});
