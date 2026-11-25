import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { MINIGAME_KEYS, SAMPLE_GRAPH_QUESTION, TRYOUT_GAME_KEYS } from '@party/contracts';
import { openHostFold } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Tryout switches and replays minigames without rejoining the phones or replacing the original room', async ({ page, request, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The bench is exercised on the desktop.');
  await page.setViewportSize({ width: 1440, height: 900 });
  const denied = await request.post('/api/host/minigame-tryout', {
    headers: { 'x-party-request': '1', origin: baseURL! }, data: { sessionId: randomUUID(), commandId: randomUUID() },
  });
  expect(denied.status()).toBe(401);

  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByRole('radio', { name: /Timed quiz/ }).check();
  await page.getByRole('button', { name: 'Open room', exact: true }).click();
  const originalRoom = await page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent();
  await openHostFold(page, 'Shared screen & invite');
  const benchHref = await page.getByRole('link', { name: 'Open test bench ↗' }).getAttribute('href');
  await page.goto(benchHref!);

  await expect(page.getByRole('button', { name: 'Minigame Tryout', exact: true })).toHaveCount(0);
  await page.goto('/?host=1');
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Minigame Tryout', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Minigame Tryout' });
  const picker = panel.getByRole('combobox', { name: 'Minigame' });
  const play = panel.getByRole('button', { name: 'Play selected' });
  const replay = panel.getByRole('button', { name: 'Replay' });
  await expect(picker.getByRole('option')).toHaveCount(TRYOUT_GAME_KEYS.length);
  const host = page.frameLocator('iframe[title="Host screen"]');
  const phone = page.frameLocator('iframe[title="Phone of Player 1"]');
  const phoneFrame = page.locator('iframe[title="Phone of Player 1"]');
  const joinedUrl = await phoneFrame.getAttribute('src');

  await picker.selectOption('heads-or-tails');
  await play.click();
  await phone.getByRole('button', { name: 'Heads', exact: true }).click();
  await expect(phone.locator('.mg-done')).toBeVisible();
  await replay.click();
  await expect(phone.locator('.mg-done')).toHaveCount(0);
  await expect(phone.getByRole('button', { name: 'Heads', exact: true })).toBeEnabled();

  await picker.selectOption('relay-drawing');
  await play.click();
  await expect(host.getByRole('button', { name: /start.*teams/i })).toBeVisible();
  await expect(phoneFrame).toHaveAttribute('src', joinedUrl!);
  await expect(panel.getByText('Current round: Pass the pencil')).toBeVisible();
  await page.reload();
  await expect(panel.getByText('Current round: Pass the pencil')).toBeVisible();

  await page.goto(benchHref!);
  await expect(panel).toHaveCount(0);
  await expect(host.getByRole('heading', { name: originalRoom! })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Start the game' })).toBeEnabled();
});

test('the Host menu bar can open a tryout bench directly', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The bench is exercised on the desktop.');
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('main').getByRole('button', { name: 'Minigame Tryout', exact: true })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Minigame Tryout', exact: true }).click();
  await expect(page).toHaveURL(/\?bench=/);
  await expect(page.getByRole('region', { name: 'Minigame Tryout' }).getByRole('button', { name: 'Play selected' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Back to host menu' })).toBeVisible();
  const host = page.frameLocator('iframe[title="Host screen"]');
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await host.getByRole('button', { name: 'Leave room', exact: true }).click();
  await host.getByRole('alertdialog', { name: 'Leave the room?' }).getByRole('link', { name: 'OK, leave' }).click();
  await expect(page).toHaveURL(/\?host=1$/);
  await expect(page.getByRole('button', { name: `Return to room ${code}` })).toBeVisible();
});

test('every hosted minigame opens and reveals a compact phone result in the bench', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The bench is exercised on the desktop.');
  test.setTimeout(120_000);
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Minigame Tryout', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Minigame Tryout' });
  const picker = panel.getByRole('combobox', { name: 'Minigame' });
  const host = page.frameLocator('iframe[title="Host screen"]');
  const phone = page.frameLocator('iframe[title="Phone of Player 1"]');
  await expect(picker).toBeVisible();
  await page.addStyleTag({ content: 'iframe[title="Phone of Player 1"] { width: 320px; height: 568px; }' });
  await expect.poll(() => phone.locator('body').evaluate(() => [innerWidth, innerHeight])).toEqual([320, 568]);
  const playSurface: Record<typeof MINIGAME_KEYS[number], string> = {
    reaction: '.reaction-pad', 'clap-beat': '.clap-pad', 'tap-race': '.mg-tap-race .mg-pad', 'speed-run': '.step-options',
    'stop-clock': '.mg-pad.stop', 'lucky-doors': '.step-options', 'perfect-circle': '.drawing-pad', 'cut-the-line': '.mg-cut-line',
    'match-the-angle': '.mg-match-angle', 'count-the-dots': '.mg-dot-form', 'draw-the-graph': '.graph-phone',
    'heads-or-tails': '.coin-choices', 'red-or-black-roulette': '.roulette-table',
    'relay-drawing': '.mg-relay', bus: '.step-options', majority: '.step-options', hangman: '.step-options',
    // Two bench phones are too few for Undercover: it says so (the three-phone game is tested below).
    undercover: '.uc-few',
  };
  const overflow = (node: Element) => ({
    horizontal: node.scrollWidth - node.clientWidth,
    underMenu: Math.max(0, Math.ceil(node.getBoundingClientRect().bottom - document.querySelector('.phone-dock-buttons')!.getBoundingClientRect().top)),
  });
  for (const game of MINIGAME_KEYS) {
    const name = await picker.locator(`option[value="${game}"]`).textContent();
    const selected = panel.getByText(`Current round: ${name}`, { exact: true });
    const stale = panel.getByRole('status').filter({ hasText: 'The room changed just before your action arrived' });
    const play = panel.getByRole('button', { name: 'Play selected' });
    await picker.selectOption(game);
    await play.click();
    // The embedded host and the outer picker receive the reveal update separately.
    await expect(selected.or(stale).first()).toBeVisible();
    if (!await selected.isVisible()) {
      await picker.selectOption(game);
      await play.click();
    }
    await expect(selected).toBeVisible();
    const title = game === 'draw-the-graph' ? SAMPLE_GRAPH_QUESTION : name!;
    for (const frame of [host, phone]) {
      const heading = frame.locator('#stage-heading');
      // Team games show a team setup title before the actual round starts.
      if (game === 'relay-drawing' || game === 'bus') await expect(heading).toBeVisible();
      else await expect(heading).toHaveText(title);
      const card = frame.locator('.kind-minigame');
      expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    if (game === 'relay-drawing' || game === 'bus') {
      await host.getByRole('button', { name: /start.*teams/i }).click();
    }
    const active = phone.locator(playSurface[game]).first();
    await expect(active).toBeVisible();
    expect(await active.evaluate(overflow), `${game} play controls`).toEqual({ horizontal: 0, underMenu: 0 });
    await host.getByRole('button', { name: 'Close answers', exact: true }).click();
    await expect(active).toHaveCount(0);
    const result = phone.locator('.mg-personal-result, .dot-result');
    await expect(result).toBeVisible();
    expect(await result.evaluate(overflow), `${game} result`).toEqual({ horizontal: 0, underMenu: 0 });
    await expect(phone.locator('.mg-podium')).toHaveCount(0);
    await expect(phone.getByText('Points this round', { exact: true })).toHaveCount(0);
  }
});

test('8-ball pool starts at the table and can be rotated and replayed in place', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The bench is exercised on the desktop.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Minigame Tryout', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Minigame Tryout' });
  const picker = panel.getByRole('combobox', { name: 'Minigame' });
  const play = panel.getByRole('button', { name: 'Play selected' });
  const host = page.frameLocator('iframe[title="Host screen"]');
  const first = page.frameLocator('iframe[title="Phone of Player 1"]');
  const second = page.frameLocator('iframe[title="Phone of Player 2"]');
  await picker.selectOption('eight-ball');
  await play.click();
  await expect(panel.getByText('Current round: 8-ball pool')).toBeVisible();
  const table = (frame: typeof host) => frame.getByRole('img', { name: 'Pool table' });
  for (const frame of [host, first, second]) await expect(table(frame)).toHaveAttribute('data-shot', '0');
  await expect(host.getByRole('button', { name: 'Close voting' })).toHaveCount(0);

  const firstFrame = page.locator('iframe[title="Phone of Player 1"]');
  const joinedUrl = await firstFrame.getAttribute('src');
  await page.getByRole('button', { name: 'Landscape for Player 1' }).click();
  await expect.poll(() => first.locator('body').evaluate(() => [innerWidth, innerHeight])).toEqual([844, 390]);
  const shoot = await first.getByRole('button', { name: 'Shoot', exact: true }).isEnabled()
    ? first.getByRole('button', { name: 'Shoot', exact: true }) : second.getByRole('button', { name: 'Shoot', exact: true });
  await shoot.click();
  await expect(table(host)).toHaveAttribute('data-shot', '1');
  await panel.getByRole('button', { name: 'Replay' }).click();
  for (const frame of [host, first, second]) await expect(table(frame)).toHaveAttribute('data-shot', '0');
  await expect(firstFrame).toHaveAttribute('src', joinedUrl!);
  await page.getByRole('button', { name: 'Landscape for Player 1' }).click();
  await expect.poll(() => first.locator('body').evaluate(() => [innerWidth, innerHeight])).toEqual([390, 844]);
});

test('8-ball free play lets one phone shoot for both sides in landscape', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome' && test.info().project.name !== 'desktop-firefox', 'The bench is exercised on the desktop.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  // Start with one seat so a second phone cannot join while the bench opens.
  await page.evaluate(() => localStorage.setItem('party_bench_phones', '1'));
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Minigame Tryout', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Minigame Tryout' });
  await panel.getByRole('combobox', { name: 'Minigame' }).selectOption('eight-ball');
  await panel.getByRole('combobox', { name: 'Ball behavior' }).selectOption('custom');
  const resistance = panel.getByRole('spinbutton', { name: 'Rolling resistance' });
  await resistance.fill('0.025');
  await resistance.press('Tab');
  await expect(resistance).toHaveValue('0.025');
  await panel.getByRole('button', { name: 'Free play' }).click();
  const phone = page.frameLocator('iframe[title="Phone of Player 1"]');
  const host = page.frameLocator('iframe[title="Host screen"]');
  const hostTable = host.getByRole('img', { name: 'Pool table' });
  await phone.getByRole('button', { name: 'Rotate table', exact: true }).click();
  const landscape = phone.getByRole('dialog', { name: 'Pool table' });
  const shoot = landscape.getByRole('button', { name: 'Shoot', exact: true });
  const aim = landscape.getByRole('slider', { name: 'Aim' });
  await expect(landscape.getByRole('status').filter({ hasText: /Side A/ })).toBeVisible();
  await expect(landscape.getByText('Break shot', { exact: true })).toBeVisible();
  const assist = landscape.getByRole('button', { name: 'Aim assist' });
  await expect(assist).toHaveAttribute('aria-pressed', 'true');
  await assist.click();
  await expect(assist).toHaveAttribute('aria-pressed', 'false');
  // Aim away from the rack so the other side takes the next shot.
  for (let turn = 0; turn < 36; turn++) await aim.press('PageUp');
  await aim.press('ArrowRight');
  await expect(aim).toHaveAttribute('aria-valuenow', '180.25');
  const power = landscape.getByRole('slider', { name: 'Power' });
  for (let step = 0; step < 7; step++) await power.press('ArrowDown');
  await expect(power).toHaveAttribute('aria-valuenow', '40');
  await landscape.getByRole('button', { name: 'Spin', exact: true }).click();
  await landscape.getByRole('button', { name: 'Cue-ball contact' }).press('ArrowUp');
  await expect(landscape.locator('output')).toContainText('height 10');
  await landscape.getByRole('button', { name: 'Done', exact: true }).click();
  await shoot.click();
  await expect(hostTable).toHaveAttribute('data-shot', '1');
  await expect(landscape.getByRole('status').filter({ hasText: /Side B/ })).toBeVisible();
  await shoot.click();
  await expect(hostTable).toHaveAttribute('data-shot', '2');
  await landscape.getByRole('button', { name: 'Exit landscape' }).click();
  await panel.getByRole('button', { name: 'Replay' }).click();
  await expect(hostTable).toHaveAttribute('data-shot', '0');
  await expect(phone.getByRole('button', { name: 'Shoot', exact: true })).toBeEnabled();
  await expect(phone.getByRole('button', { name: 'Aim assist' })).toHaveAttribute('aria-pressed', 'false');
  await panel.getByLabel('Starting side').selectOption('right');
  await panel.getByRole('button', { name: 'Replay' }).click();
  await expect(phone.getByRole('slider', { name: 'Aim' })).toHaveAttribute('aria-valuenow', '180');
});

test('Galgje: the phone guesses letters of a hidden word; the host screen sees only the gallows and how many letters were found', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The bench is exercised on the desktop.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Minigame Tryout', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Minigame Tryout' });
  await panel.getByRole('combobox', { name: 'Minigame' }).selectOption('hangman');
  await panel.getByRole('button', { name: 'Play selected' }).click();
  const phone = page.frameLocator('iframe[title="Phone of Player 1"]');
  const host = page.frameLocator('iframe[title="Host screen"]');
  await expect(phone.getByText('Pick a letter.')).toBeVisible({ timeout: 15_000 });
  for (const letter of ['E', 'A', 'Q']) await phone.getByRole('button', { name: `Letter ${letter}`, exact: true }).click();
  // A guessed letter is no longer offered; the phone shows its word tiles and the gallows.
  await expect(phone.getByRole('button', { name: 'Letter E', exact: true })).toHaveCount(0);
  await expect(phone.getByRole('img', { name: /^Gallows: \d of 7 wrong$/ })).toBeVisible();
  await expect(phone.locator('.hangman-word')).toBeVisible();
  await expect(host.getByText(/of \d+ letters found/).first()).toBeVisible();
  await expect(host.locator('.hangman-word')).toHaveCount(0);
  await expect(host.getByText(/^[1-9]\d* of \d+ letters found$/).or(host.getByText(/^0 of \d+ letters found$/)).first()).toBeVisible();
  if (process.env['TEAM_SHOTS']) { await page.waitForTimeout(800); await page.screenshot({ path: `${process.env['TEAM_SHOTS']}/hangman-bench.png` }); }
});

test('Undercover: three phones each see their own word, give clues in turn and vote; the host can always move on', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The bench is exercised on the desktop.');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Minigame Tryout', exact: true }).click();
  await page.getByRole('button', { name: 'One phone more' }).click();
  await expect(page.locator('iframe[title="Phone of Player 3"]')).toBeVisible();
  // The third phone joins by itself before the game is dealt.
  await expect(page.frameLocator('iframe[title="Host screen"]').getByText('3 players', { exact: false }).first()).toBeVisible({ timeout: 15_000 }).catch(() => page.waitForTimeout(3000));
  const panel = page.getByRole('region', { name: 'Minigame Tryout' });
  await panel.getByRole('combobox', { name: 'Minigame' }).selectOption('undercover');
  await panel.getByRole('button', { name: 'Play selected' }).click();
  const phones = [1, 2, 3].map(number => page.frameLocator(`iframe[title="Phone of Player ${number}"]`));
  const host = page.frameLocator('iframe[title="Host screen"]');
  // Each phone hides its word until tapped; the host screen never has one.
  for (const phone of phones) {
    await phone.getByRole('button', { name: 'Show my word' }).click({ timeout: 15_000 });
    await expect(phone.locator('.uc-word-text strong')).toHaveText(/\S/);
  }
  await expect(host.locator('.uc-word')).toHaveCount(0);
  await expect(host.getByRole('button', { name: 'Skip' })).toBeVisible();
  // Clues in turn: whoever's turn it is taps that they gave theirs.
  for (let tries = 0; tries < 40 && !await phones[0]!.getByText(/Vote someone out/).count(); tries++) {
    for (const phone of phones) {
      const button = phone.getByRole('button', { name: 'I gave my clue' });
      if (await button.count()) { await button.click(); await expect(button).toHaveCount(0); break; }
    }
    await page.waitForTimeout(250);
  }
  await expect(phones[0]!.getByText(/Vote someone out/)).toBeVisible();
  await phones[0]!.getByRole('button', { name: /^Player 2/ }).click();
  await expect(phones[0]!.getByText('You voted for Player 2.', { exact: false })).toBeVisible();
  await expect(host.getByText('1 of 3 voted', { exact: false })).toBeVisible();
  if (process.env['TEAM_SHOTS']) { await page.waitForTimeout(500); await page.screenshot({ path: `${process.env['TEAM_SHOTS']}/undercover-bench.png` }); }
  // The host counts the votes now: Player 2 is out and their role shows to everyone. With three players that decides the game.
  await host.getByRole('button', { name: 'Skip' }).click();
  await expect(phones[2]!.getByText(/Player 2 is out: (Civilian|Undercover)/)).toBeVisible();
  await expect(phones[2]!.getByText(/The (civilians|impostors) win!/)).toBeVisible();
});

test('the host types their own Galgje words and Undercover pairs in Room settings; lines that cannot be played are left out and said so', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The bench is exercised on the desktop.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByRole('radio', { name: /Timed quiz/ }).check();
  await page.getByRole('button', { name: 'Open room', exact: true }).click();
  await openHostFold(page, 'Room settings');
  await page.getByText('Your words (Galgje, Undercover)').click();
  await page.getByLabel('Galgje: one word or short phrase per line').fill('q\nquiz');
  await page.getByLabel(/^Undercover: one pair per line/).fill('zon, maan\nonly one');
  await page.getByRole('button', { name: 'Save my words' }).click();
  // "q" is too short to play and "only one" has no second word: both are left out, and said so.
  await expect(page.getByText('Saved. The next round uses your words. Left out: 2', { exact: false })).toBeVisible();
  await expect(page.getByText('Galgje 1 · Undercover 1', { exact: false })).toBeVisible();
  if (process.env['TEAM_SHOTS']) await page.screenshot({ path: `${process.env['TEAM_SHOTS']}/room-words.png` });
  await expect(page.getByRole('button', { name: 'Use the game’s words again' })).toBeVisible();
});
