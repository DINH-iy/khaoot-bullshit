import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { BRICK_COLUMNS, BRICK_ROWS } from '@party/contracts';
import { openPhoneMenu } from './helpers.js';

test('Brick Rally solo plays and remembers a custom map on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.addInitScript(() => {
    if (!localStorage.getItem('party-brick-rally-map')) {
      localStorage.setItem('party-brick-rally-map', JSON.stringify({ map: ['........', '........', '........', '........', '......#.'] }));
    }
  });
  await page.goto('/?arcade');
  const open = page.getByRole('button', { name: 'Play Brick Rally solo' });
  await open.click();
  const solo = page.getByRole('dialog', { name: 'Brick Rally' });
  await expect(solo.getByText('Custom map')).toBeVisible();
  await solo.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(solo.getByLabel(/Brick Rally board/)).toBeInViewport();
  await expect(solo.getByRole('status')).toHaveText('Cleared in 0.93 s');
  await solo.getByRole('button', { name: 'Map', exact: true }).click();
  await solo.getByRole('button', { name: 'Cascade', exact: true }).click();
  await solo.getByRole('button', { name: 'Edit map' }).click();
  const mapEditor = page.getByRole('dialog', { name: 'Edit map' });
  await mapEditor.getByRole('button', { name: 'Tough brick', exact: true }).click();
  await mapEditor.getByRole('button', { name: 'Row 1, column 1: Empty' }).click();
  await expect(mapEditor.getByRole('button', { name: /^Row 1, column 1: Tough brick/ })).toBeVisible();
  await mapEditor.getByRole('button', { name: 'Apply map' }).click();
  await solo.getByRole('button', { name: 'Close', exact: true }).click();
  await open.click();
  await solo.getByRole('button', { name: 'Edit map' }).click();
  await expect(mapEditor.getByRole('button', { name: /^Row 1, column 1: Tough brick/ })).toBeVisible();
});

test('Arcade players get the same custom Brick Rally map and verified times', async ({ page, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Two phone contexts are created for this race.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?arcade');
  await page.getByLabel('Your name').fill('Paddle one');
  await page.getByRole('button', { name: 'Open a lobby' }).click();
  await page.getByRole('button', { name: /Change$/ }).click();
  await page.getByRole('dialog', { name: 'Choose a game' }).getByRole('button', { name: 'Brick Rally', exact: true }).click();
  await page.getByRole('button', { name: /^Game settings .*Brick Rally$/ }).click();
  const settings = page.getByRole('dialog', { name: 'Brick Rally settings' });
  await settings.getByRole('button', { name: 'Edit map' }).click();
  const mapEditor = page.getByRole('dialog', { name: 'Edit map' });
  await mapEditor.getByRole('button', { name: 'Blank map' }).click();
  await expect(mapEditor.getByRole('button', { name: 'Apply map' })).toBeDisabled();
  await mapEditor.getByRole('button', { name: 'Row 24, column 21: Empty' }).click();
  await mapEditor.getByRole('button', { name: 'Apply map' }).click();
  await settings.getByRole('button', { name: 'Close' }).click();

  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const friend = await context.newPage();
  try {
    await friend.goto(page.url());
    await friend.getByLabel('Your name').fill('Paddle two');
    await friend.getByRole('button', { name: 'Join the lobby' }).click();
    await expect(page.getByRole('button', { name: 'Players 2' })).toBeVisible();
    await page.getByRole('button', { name: 'Play Brick Rally', exact: true }).click();
    await Promise.all([page, friend].map(phone => phone.getByRole('button', { name: 'Got it!' }).click()));
    await page.getByRole('button', { name: 'Start (2 of 2 ready)' }).click();
    await Promise.all([page, friend].map(phone => expect(phone.locator('.mg-done')).toContainText('0.58 s')));
    await page.getByRole('button', { name: 'Show the results' }).click();
    for (const name of ['Paddle one', 'Paddle two']) {
      await expect(friend.getByRole('region', { name: 'Round results' }).getByRole('listitem').filter({ hasText: name })).toContainText('0.58 s');
    }
  } finally { await context.close(); }
});

test('a hosted Brick Rally scene saves its own painted map', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Desktop scene editor.');
  const token = process.env['LOCAL_OWNER_TOKEN'];
  if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
  await page.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = crypto.randomUUID();
  const api = `${baseURL}/api/host/games`;
  const headers = { origin: baseURL!, 'x-party-request': '1' };
  const imported = await page.request.post(`${api}/import`, { headers, data: { gameId, text: JSON.stringify({
    title: 'Brick scene', scenes: [{ id: 'rally', type: 'minigame', game: 'brick-rally', question: 'Clear the board!' }],
  }) } });
  expect(imported.ok()).toBe(true);
  await page.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' });
  await page.setViewportSize({ width: 1280, height: 850 });
  await expect(page.getByRole('button', { name: 'Configure minigame', exact: true })).toBeVisible();
  // Sample every visible frame, including the configuration dialog's opening animation.
  const phoneSizes = await page.evaluate(() => new Promise<{ width: number; height: number; x: number; y: number }[]>(resolve => {
    const samples: { width: number; height: number; x: number; y: number }[] = [];
    const started = performance.now();
    const sample = () => {
      const phone = document.querySelector<HTMLElement>('.minigame-configuration[open] .phone-device');
      if (phone?.offsetWidth) {
        const { x, y } = phone.getBoundingClientRect();
        samples.push({ width: phone.clientWidth, height: phone.clientHeight, x, y });
      }
      if (performance.now() - started < 350) requestAnimationFrame(sample);
      else resolve(samples);
    };
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === 'Configure minigame')!.click();
    sample();
  }));
  expect(phoneSizes.length).toBeGreaterThan(1);
  expect(phoneSizes.every(size => size.width === phoneSizes[0]!.width && size.height === phoneSizes[0]!.height && size.x === phoneSizes[0]!.x && size.y === phoneSizes[0]!.y)).toBe(true);
  expect(phoneSizes[0]!.width / phoneSizes[0]!.height).toBeCloseTo(390 / 844, 2);
  const dialog = page.getByRole('dialog', { name: 'Configure minigame' });
  const captures = process.env['BRICK_EDITOR_SCREENSHOTS'];
  await expect(dialog.getByRole('combobox', { name: 'Phone model' })).toBeVisible();
  await expect(dialog.locator('.phone-device')).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole('button', { name: 'Start practice' })).toBeInViewport();
  if (captures) await page.screenshot({ path: join(captures, 'brick-rally-phone-preview.png'), animations: 'disabled' });
  const phone = dialog.locator('.phone-device');
  const openedAt = await phone.boundingBox();
  await dialog.getByRole('button', { name: 'oudje', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'oudje', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: 'Start practice' })).toBeInViewport();
  expect(await phone.boundingBox()).toEqual(openedAt);
  if (captures) await page.screenshot({ path: join(captures, 'brick-rally-oudje.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Start practice' }).click();
  await expect(dialog.getByLabel(/Brick Rally board/)).toBeVisible();
  expect(await phone.boundingBox()).toEqual(openedAt);
  await dialog.getByRole('button', { name: 'Circuit', exact: true }).click();
  await dialog.getByRole('button', { name: 'Edit map' }).click();
  const mapEditor = page.getByRole('dialog', { name: 'Edit map' });
  await expect(mapEditor.getByRole('button', { name: /^Row 24, column 32:/ })).toBeInViewport();
  if (captures) await page.screenshot({ path: join(captures, 'brick-rally-map-editor.png'), animations: 'disabled' });
  await mapEditor.getByRole('button', { name: 'Blank map' }).click();
  const from = await mapEditor.getByRole('button', { name: /^Row 1, column 1:/ }).boundingBox();
  const to = await mapEditor.getByRole('button', { name: /^Row 1, column 8:/ }).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2);
  await page.mouse.up();
  await expect(mapEditor.getByRole('button', { name: /^Row 1, column [1-8]: Brick$/ })).toHaveCount(8);
  await mapEditor.getByRole('button', { name: 'Blank map' }).click();
  await mapEditor.getByRole('combobox', { name: 'Hits to break' }).selectOption('5');
  await mapEditor.getByRole('button', { name: 'Row 1, column 1: Empty' }).click();
  await expect(mapEditor.getByRole('button', { name: 'Row 1, column 1: Tough brick (5 hits)' })).toBeVisible();
  await mapEditor.getByRole('button', { name: 'Split ball', exact: true }).click();
  await mapEditor.getByRole('button', { name: /^Row 1, column 1: Tough brick/ }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(mapEditor.getByRole('button', { name: 'Row 1, column 2: Split ball' })).toBeFocused();
  await mapEditor.getByRole('button', { name: 'Apply map' }).click();
  await expect(dialog.locator('.phone-device')).toHaveJSProperty('clientWidth', phoneSizes[0]!.width);
  await dialog.getByRole('button', { name: 'Apply changes' }).click();
  await expect.poll(async () => {
    const saved = (await (await page.request.get(`${api}/${gameId}`, { headers })).json()).data;
    return saved.definition.nodes[0].stages[0].settings;
  }).toEqual({ map: ['5S'.padEnd(BRICK_COLUMNS, '.'), ...Array<string>(BRICK_ROWS - 1).fill('.'.repeat(BRICK_COLUMNS))] });
});

test('two phones can invite each other to Brick Rally and finish a shared race', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'This test creates two mobile Chrome contexts.');
  const token = process.env['LOCAL_OWNER_TOKEN'];
  if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
  const host = await browser.newPage();
  const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' } as const;
  const ada = await browser.newPage(mobile);
  const bo = await browser.newPage(mobile);
  const cy = await browser.newPage(mobile);
  const captures = process.env['BRICK_CHALLENGE_SCREENSHOTS'];
  const screenshot = async (page: Page, name: string) => {
    if (captures) await page.screenshot({ path: join(captures, name) });
  };
  try {
    await host.goto(`${baseURL}/?host=1#owner=${token}`);
    await host.getByRole('button', { name: 'Open room for Timed quiz' }).click();
    const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    await Promise.all(([[ada, 'Ada'], [bo, 'Bo'], [cy, 'Cy']] as const).map(async ([phone, name]) => {
      await phone.goto(`${baseURL}/?code=${code}`);
      await phone.getByLabel('Your name').fill(name);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(phone.getByRole('button', { name: /^Menu/ })).toBeVisible();
    }));
    const challenges = async (page: Page) => {
      await (await openPhoneMenu(page)).getByRole('button', { name: /^Challenge/ }).click();
      return page.getByRole('dialog', { name: 'Challenges' });
    };
    const outgoing = await challenges(ada);
    const incoming = await challenges(bo);
    await expect(outgoing.getByText(/^None yet/)).toBeVisible();
    const back = outgoing.getByRole('button', { name: 'All challenges', exact: true });
    await expect(back).toHaveCount(0);
    await outgoing.getByRole('button', { name: 'Challenge someone' }).click();
    await expect(outgoing.locator('.sheet-head-title').getByRole('button', { name: 'All challenges', exact: true })).toHaveText('');
    await expect(outgoing.locator('.sheet-head-title button + h2')).toHaveText('Challenges');
    await expect(outgoing.locator('.sheet-head-actions').getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await back.click();
    await expect(outgoing.getByRole('region', { name: 'Your challenges' })).toBeVisible();
    await screenshot(ada, 'brick-rally-challenges.png');
    const board = (page: Page) => page.getByLabel(/Brick Rally board/);
    const send = async (custom: boolean) => {
      await outgoing.getByRole('button', { name: 'Challenge someone' }).click();
      await outgoing.getByRole('button', { name: 'Brick Rally', exact: true }).click();
      const opponent = outgoing.getByRole('button', { name: /^Change player/ });
      await expect(opponent.locator('.avatar')).toBeVisible();
      await opponent.click();
      const people = ada.getByRole('dialog', { name: 'Choose player' });
      await expect(people.getByRole('button', { name: 'Cy', exact: true }).locator('.avatar')).toBeVisible();
      if (!custom) await screenshot(ada, 'brick-rally-players.png');
      await people.getByRole('button', { name: 'Bo', exact: true }).click();
      await expect(outgoing.getByRole('button', { name: 'Change player, Bo' })).toBeFocused();

      const browse = outgoing.getByRole('button', { name: 'Browse maps, Steps' });
      const maps = ada.getByRole('dialog', { name: 'Choose map' });
      await browse.click();
      await expect(maps.locator('canvas')).toHaveCount(4);
      await expect(maps.getByRole('button', { name: 'oudje', exact: true })).toBeVisible();
      if (!custom) {
        await screenshot(ada, 'brick-rally-map-library.png');
        await ada.keyboard.press('Escape');
        await expect(maps).toHaveCount(0);
        await expect(browse).toBeFocused();
        await browse.click();
      }
      await maps.getByRole('button', { name: 'Circuit', exact: true }).click();
      await expect(outgoing.getByRole('button', { name: 'Browse maps, Circuit' })).toBeFocused();
      expect((await outgoing.boundingBox())!.height).toBeLessThan(800);
      if (custom) {
        // Use a short fixture through the same endpoint so both browsers can clear it with real gameplay.
        await ada.route('**/api/rooms/*/side/challenges', route => {
          const body = route.request().postDataJSON();
          return route.continue({ postData: { ...body, settings: { map: ['........', '........', '........', '........', '......S.'] } } });
        }, { times: 1 });
      } else await screenshot(ada, 'brick-rally-invite.png');
      await outgoing.getByRole('button', { name: 'Send challenge' }).click();
      await expect(incoming.getByText(/Ada challenges you to Brick Rally/)).toBeVisible();
      await expect(incoming.locator('dl.challenge-invite-settings dd')).toHaveText(custom ? 'Custom map' : 'Circuit');
      await incoming.getByRole('button', { name: 'Accept' }).click();
      await outgoing.getByRole('button', { name: 'Open', exact: true }).click();
      const canvas = (page: Page) => page.getByRole('img', { name: 'Map', exact: true });
      await expect(canvas(ada)).toBeInViewport();
      await expect(canvas(bo)).toBeInViewport();
      expect(await canvas(ada).evaluate(node => (node as HTMLCanvasElement).toDataURL()))
        .toBe(await canvas(bo).evaluate(node => (node as HTMLCanvasElement).toDataURL()));
      await outgoing.getByRole('button', { name: 'Ready to race' }).click();
      await expect(outgoing.getByText('Waiting for the other player to get ready.')).toBeVisible();
      await expect(outgoing.getByRole('button', { name: /All challenges/ })).toBeInViewport({ ratio: 1 });
      if (!custom) await screenshot(ada, 'brick-rally-ready.png');
      await incoming.getByRole('button', { name: 'Ready to race' }).click();
      const timer = (page: Page) => page.getByRole('timer');
      await Promise.all([ada, bo].map(page => expect(timer(page)).toBeVisible()));
      await Promise.all([ada, bo].map(page => expect(board(page)).toBeInViewport({ ratio: 1 })));
    };

    await send(false);
    await expect(outgoing.getByRole('button', { name: 'Give up', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(outgoing.getByText(/Bricks left: [4-6][0-9][0-9]/)).toBeVisible();
    await screenshot(ada, 'brick-rally-race.png');
    await ada.setViewportSize({ width: 360, height: 640 });
    await expect(board(ada)).toBeInViewport({ ratio: 1 });
    await ada.setViewportSize(mobile.viewport);
    await incoming.getByRole('button', { name: 'Give up', exact: true }).click();
    await incoming.getByRole('button', { name: 'Yes, give up' }).click();
    await expect(outgoing.getByText('Ada wins (Bo gave up)!')).toBeVisible();
    await outgoing.getByRole('button', { name: /All challenges/ }).click();
    await incoming.getByRole('button', { name: /All challenges/ }).click();

    await send(true);
    for (const dialog of [outgoing, incoming]) {
      await expect(dialog.getByText('A draw!')).toBeVisible();
      await expect(dialog.getByText('0.933 s', { exact: true })).toHaveCount(2);
    }
    await screenshot(ada, 'brick-rally-result.png');
  } finally { await Promise.all([host.close(), ada.close(), bo.close(), cy.close()]); }
});
