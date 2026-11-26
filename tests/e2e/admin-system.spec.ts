import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the owner sees open rooms and closes one, checks storage, and finds it in the action log', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Admin is checked on the desktop.');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByRole('button', { name: 'Open room for Timed quiz' }).click();
  const code = (await page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);

  await page.goto(`${baseURL}/?admin=rooms`);
  await expect(page.getByRole('heading', { name: 'Live rooms', level: 1 })).toBeVisible();
  const room = page.locator('.admin-item').filter({ hasText: `Room ${code}` });
  await expect(room).toContainText('Waiting to start');
  expect((await new AxeBuilder({ page }).include('.admin-page').analyze()).violations).toEqual([]);
  if (process.env['TEAM_SHOTS']) await page.screenshot({ path: `${process.env['TEAM_SHOTS']}/admin-rooms.png` });
  await room.getByRole('button', { name: 'Close room' }).click();
  await room.getByRole('button', { name: `Yes, close room ${code}` }).click();
  await expect(page.locator('.admin-item').filter({ hasText: `Room ${code}` })).toHaveCount(0);

  await page.goto(`${baseURL}/?admin=storage`);
  await expect(page.getByText('Players\' uploads', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clean up now' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Removed|Nothing to clean up/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.admin-page').analyze()).violations).toEqual([]);
  if (process.env['TEAM_SHOTS']) await page.screenshot({ path: `${process.env['TEAM_SHOTS']}/admin-storage.png` });

  await page.goto(`${baseURL}/?admin=health`);
  await expect(page.getByRole('heading', { name: 'Database', level: 2 })).toContainText(/OK|Worth a look/);
  await expect(page.locator('.health-part').filter({ hasText: 'Database' })).toContainText('Reachableyes');
  expect((await new AxeBuilder({ page }).include('.admin-page').analyze()).violations).toEqual([]);
  if (process.env['TEAM_SHOTS']) await page.screenshot({ path: `${process.env['TEAM_SHOTS']}/admin-health.png`, fullPage: true });

  await page.goto(`${baseURL}/?admin=actions`);
  await page.getByLabel('Search').fill(code);
  await expect(page.locator('.action-log li').first()).toContainText('Closed a room');
  expect((await new AxeBuilder({ page }).include('.admin-page').analyze()).violations).toEqual([]);
  if (process.env['TEAM_SHOTS']) { await page.getByLabel('Search').fill(''); await page.screenshot({ path: `${process.env['TEAM_SHOTS']}/admin-actions.png` }); }
});
