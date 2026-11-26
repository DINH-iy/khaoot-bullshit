import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { chooseOption, closeHostFold, closeRoundsByHand, openHostFold, openPhoneMenu } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Roulette works on the TV and in Games, with per-game icons and free pack previews', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The playing phone uses a separate narrow touch context.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'Roulette night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = {
    formatVersion: 2, title: 'Roulette night', startNodeKey: 'wheel', edges: [],
    nodes: [{ key: 'wheel', stages: [{ key: 'main', kind: 'minigame', prompt: 'Place your bets', game: 'red-or-black-roulette',
      durationMs: 30_000, countdownSeconds: 1 }] }],
  };
  expect((await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?edit=${gameId}&view=look`);
  await host.getByRole('tab', { name: 'Phone menu' }).click();
  await chooseOption(host.getByRole('combobox', { name: 'Games', exact: true }), 'wheel');
  await chooseOption(host.getByRole('combobox', { name: 'Packs', exact: true }), 'sparkles');
  const getDraft = async () => (await (await host.request.get(`${games}/${gameId}`, { headers })).json()).data;
  await expect.poll(async () => (await getDraft()).definition.presentation?.phoneMenuIcons?.games).toBe('wheel');
  await expect.poll(async () => (await getDraft()).definition.presentation?.phoneMenuIcons?.packs).toBe('sparkles');
  const saved = await getDraft();
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
    let releaseWallet!: () => void;
    const walletGate = new Promise<void>(resolve => { releaseWallet = resolve; });
    await phone.route(`**/api/rooms/${roomId}/side`, async route => {
      await walletGate;
      await route.continue();
    }, { times: 1 });
    const menu = await openPhoneMenu(phone);
    await expect(menu.getByRole('button', { name: /^Players/ }).locator('[data-menu-icon]')).toHaveAttribute('data-menu-icon', 'teams');
    const gamesTile = menu.getByRole('button', { name: 'Games', exact: true });
    await expect(gamesTile.locator('[data-menu-icon]')).toHaveAttribute('data-menu-icon', 'wheel');
    await gamesTile.click();
    const sheet = phone.getByRole('dialog', { name: 'Side games' });
    const pickSideGame = async (name: string) => {
      await sheet.getByRole('button', { name: /choose another game/ }).click();
      await sheet.getByRole('button', { name, exact: true }).click();
    };
    await expect(sheet.getByRole('list', { name: 'Side games' }).getByRole('button')).toHaveCount(5);
    await expect(sheet.getByRole('button', { name: 'Packs', exact: true }).locator('[data-menu-icon]')).toHaveAttribute('data-menu-icon', 'sparkles');
    await expect(sheet.getByRole('button', { name: 'Blackjack', exact: true }).locator('[data-menu-icon]')).toHaveAttribute('data-menu-icon', 'cards');
    await expect(sheet.getByRole('button', { name: 'Spin', exact: true })).toHaveCount(0);
    const header = sheet.locator('.sheet-head');
    const info = header.getByRole('button', { name: 'About the side games and chips' });
    const close = header.getByRole('button', { name: 'Close' });
    const infoBox = (await info.boundingBox())!;
    const closeBox = (await close.boundingBox())!;
    expect(infoBox.x + infoBox.width).toBeLessThan(closeBox.x);
    expect(Math.abs(infoBox.y + infoBox.height / 2 - closeBox.y - closeBox.height / 2)).toBeLessThan(1);
    await expect(sheet.locator('.side-top')).toHaveCount(0);
    const beforeDrag = (await sheet.boundingBox())!;
    const grip = (await sheet.getByRole('button', { name: 'Resize panel' }).boundingBox())!;
    const touch = await mobile.newCDPSession(phone);
    const point = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    for (const offset of [20, 50, 85, 130]) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: point.y - offset }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
    await expect.poll(async () => (await sheet.boundingBox())!.height).toBeGreaterThan(beforeDrag.height + 80);
    releaseWallet();
    await sheet.getByRole('button', { name: 'Packs', exact: true }).click();
    const freePack = sheet.getByRole('button', { name: 'Open a free pack' });
    await freePack.tap();
    await expect(freePack).toBeEnabled();
    await expect(sheet.locator('.pack-reveal li')).toHaveCount(0);
    const seal = (await freePack.boundingBox())!;
    const drag = await mobile.newCDPSession(phone);
    const start = { x: Math.round(seal.x + seal.width / 2), y: Math.round(seal.y + 21) };
    await drag.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (const offset of [20, 50, 80]) {
      await drag.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + offset, y: start.y - 8 }] });
    }
    await drag.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await drag.detach();
    await expect(sheet.locator('.pack-reveal li')).toHaveCount(4);
    await expect(sheet.locator('.pack-collection summary')).toContainText('0 of');
    await sheet.getByRole('button', { name: 'Close' }).click();

    await openHostFold(host, 'Room settings');
    await host.getByRole('switch', { name: 'Chips', exact: true }).click();
    await expect(host.getByRole('switch', { name: 'Chips', exact: true })).toHaveAttribute('aria-checked', 'true');
    await closeHostFold(host);
    await (await openPhoneMenu(phone)).getByRole('button', { name: 'Games', exact: true }).click();
    await expect(sheet.getByRole('button', { name: /Packs.*choose another game/ }).locator('[data-menu-icon]')).toHaveAttribute('data-menu-icon', 'sparkles');
    await expect(sheet.getByRole('list', { name: 'Side games' })).toHaveCount(0);
    await pickSideGame('Roulette');
    const balance = sheet.locator('.chip-pill strong');
    await expect(balance).toBeVisible();
    const before = Number((await balance.textContent())!.replace(/\D/g, ''));
    const numberBoard = sheet.getByRole('group', { name: 'Roulette table' });
    // 37 numbers (green zero too) and 12 outside bets.
    await expect(numberBoard.getByRole('button')).toHaveCount(49);
    await sheet.getByRole('radio', { name: '25', exact: true }).check();
    await numberBoard.getByRole('button', { name: /Green zero/ }).tap();
    await numberBoard.getByRole('button', { name: /^32 · Red/ }).tap();
    await numberBoard.getByRole('button', { name: /^Red, / }).tap();
    await expect(sheet.getByText(`Stake 75 of ${before}`)).toBeVisible();
    await sheet.getByRole('button', { name: 'Spin', exact: true }).tap();
    const solo = sheet.locator('.roulette-result');
    await expect(solo).toBeVisible();
    const result = (await solo.textContent())!;
    const payout = (/^(0|32) ·/.test(result) ? 25 * 36 : 0) + (/ · Red$/.test(result) ? 50 : 0);
    // Digits only: a balance of 1000 or more shows a thousands separator.
    await expect.poll(async () => Number((await balance.textContent())!.replace(/\D/g, ''))).toBe(before - 75 + payout);

    await host.getByRole('button', { name: 'Start the game' }).click();
    await expect(sheet).toHaveCount(0);
    // Ada has no points yet, so she may bet up to the minimum stake (100 by default).
    await expect(phone.getByText('Stake 0 of 100')).toBeVisible();
    await phone.getByRole('radio', { name: '10', exact: true }).check();
    await phone.getByRole('group', { name: 'Roulette table' }).getByRole('button', { name: /^Black, / }).tap();
    await phone.getByRole('button', { name: 'Lock in bets' }).tap();
    await expect(phone.locator('.mg-done')).toContainText('Black 10');
    await expect(display.locator('.roulette-result')).toHaveCount(0);
    await expect(display.locator('.mg-podium')).toHaveCount(0);
    await host.getByRole('button', { name: 'Close answers' }).click();
    const shared = display.locator('.roulette-result');
    await expect(shared).toBeVisible();
    await expect(display.locator('.roulette-wheel')).toHaveCount(1);
    await expect(phone.locator('.roulette-wheel')).toHaveCount(0);
    await expect(phone.locator('.mg-personal-result .mg-pocket')).toHaveText((await shared.textContent())!);
    const black = / · Black$/.test((await shared.textContent())!);
    const ada = display.locator('.mg-podium li').filter({ hasText: 'Ada' });
    await expect(ada).toContainText(black ? 'Correct guess' : 'Wrong guess');
    await expect(ada).toContainText('Bet 10');
    await expect(ada.locator('.mg-result-points')).toContainText(black ? '10' : '−10');
  } finally {
    await mobile.close();
    await display.close();
  }
});
