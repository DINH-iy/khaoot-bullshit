import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('game cards show draft activity and an authored phone preview returns to editing', async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();

  const gameId = randomUUID();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const imported = await page.request.post(`${baseURL}/api/host/games/import`, {
    headers, data: { gameId, text: JSON.stringify({ title: 'Kerstquiz', scenes: [
      { id: 'welcome', type: 'cutscene', title: 'Welkom!', text: 'Pak je telefoon erbij.' },
      { id: 'rules', type: 'cutscene', title: 'Spelregels', text: 'Iedereen speelt mee.' },
    ] }) },
  });
  expect(imported.ok()).toBe(true);

  await page.reload();
  const card = page.locator('.my-game').filter({ has: page.getByRole('heading', { name: 'Kerstquiz', exact: true }) });
  const timestamp = card.locator('time');
  await expect(timestamp).toContainText('Last edited');
  const initial = await timestamp.getAttribute('datetime');
  await expect(card.getByText('Open in editor', { exact: true })).toHaveCount(0);

  const editor = await context.newPage();
  await editor.setViewportSize({ width: 1440, height: 900 });
  await editor.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await expect(editor.getByRole('tab', { name: 'Scene editor' })).toBeVisible();
  const notes = 'Welkom allemaal!\n\nWacht tot iedereen is verbonden.';
  await editor.locator('summary').getByText('Host notes', { exact: true }).click();
  await editor.getByRole('textbox', { name: 'Script or reminders' }).fill(notes);
  await expect(editor.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  await page.bringToFront();
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(card.getByText('Open in editor', { exact: true })).toBeVisible({ timeout: 1200 });
    await expect(timestamp).not.toHaveAttribute('datetime', initial ?? '', { timeout: 1200 });
  }).toPass();
  await page.screenshot({ path: testInfo.outputPath('game-activity.png') });

  await editor.bringToFront();
  const popup = editor.waitForEvent('popup');
  await editor.getByRole('button', { name: 'Play & publish' }).click();
  await editor.getByRole('menuitem', { name: /Test bench: play it with virtual phones/ }).click();
  const bench = await popup;
  await bench.setViewportSize({ width: 1440, height: 900 });
  const back = bench.getByRole('link', { name: 'Back to editor' });
  await expect(back).toHaveAttribute('href', `/?edit=${gameId}`);
  await expect(bench.getByRole('combobox', { name: 'Phone model' })).toBeVisible();

  const host = bench.frameLocator('.bench-host');
  await expect(host.getByText(/Player 1 · connected/)).toBeVisible();
  await host.getByRole('button', { name: 'Start the game' }).click();
  await expect(host.locator('.host-notes p')).toHaveJSProperty('textContent', notes);
  const phone = bench.frameLocator('iframe[title="Phone of Player 1"]');
  await expect(phone.getByText('Pak je telefoon erbij.', { exact: true })).toBeVisible();
  await expect(phone.getByText('Welkom allemaal!', { exact: false })).toHaveCount(0);
  await bench.screenshot({ path: testInfo.outputPath('phone-preview-host-notes.png') });

  await host.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(host.getByText('Iedereen speelt mee.', { exact: true })).toBeVisible();
  await expect(host.locator('.host-notes')).toHaveCount(0);
  const benchUrl = bench.url();
  const closed = bench.waitForEvent('close');
  await back.click();
  await closed;
  await expect(editor.getByRole('textbox', { name: 'Script or reminders' })).toHaveValue(notes);

  const standalone = await context.newPage();
  await standalone.goto(benchUrl);
  await standalone.getByRole('link', { name: 'Back to editor' }).click();
  await expect(standalone).toHaveURL(new RegExp(`[?&]edit=${gameId}`));
  await expect(standalone.getByRole('tab', { name: 'Scene editor' })).toBeVisible();
});
