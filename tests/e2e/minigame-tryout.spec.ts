import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { MINIGAME_KEYS, SAMPLE_GRAPH_QUESTION } from '@party/contracts';
import { openHostFold } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the bench switches and replays minigames without rejoining the phones or replacing the original room', async ({ page, request, baseURL }) => {
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

  await page.getByRole('button', { name: 'Minigame Tryout', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Minigame Tryout' });
  const picker = panel.getByRole('combobox', { name: 'Minigame' });
  const play = panel.getByRole('button', { name: 'Play selected' });
  const replay = panel.getByRole('button', { name: 'Replay' });
  await expect(picker.getByRole('option')).toHaveCount(MINIGAME_KEYS.length);
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

  await page.getByRole('button', { name: 'Back to test bench' }).click();
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
    'heads-or-tails': '.coin-choices', 'red-or-black-roulette': '.roulette-choices',
    'relay-drawing': '.mg-relay', bus: '.step-options', majority: '.step-options',
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
