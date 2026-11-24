import { expect, test } from '@playwright/test';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

// Save points: a copy of the whole game kept on the server, made on purpose, to go back to after a mistake.
test('a save point brings the game back after a change, keeps what it was, and can be deleted', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor flow uses the desktop project.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Save points ${Date.now()}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();
  const tour = page.getByRole('region', { name: 'Editor tour' });
  if (await tour.isVisible().catch(() => false)) await tour.getByRole('button', { name: 'Skip tour' }).click();
  const saved = page.getByRole('status').filter({ hasText: 'All changes saved' });
  await expect(saved).toBeVisible({ timeout: 10_000 });

  // Ctrl/⌘ + S opens Save points instead of the browser's "save page".
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('ControlOrMeta+s');
  const panel = page.getByRole('region', { name: 'Save points' });
  await expect(panel).toContainText('No save points yet');
  await panel.getByLabel('Name of the save point').fill('Before renaming');
  await panel.getByRole('button', { name: 'Make a save point' }).click();
  await expect(panel.getByText('Save point “Before renaming” made.')).toBeVisible();
  await expect(panel.getByRole('listitem')).toHaveCount(1);

  // A change after the save point…
  const title = page.getByLabel('Game name');
  await title.fill(`${name} (broken)`);
  await expect(saved).toBeVisible({ timeout: 10_000 });

  // …is taken back by going back, which first keeps what the game was as an automatic save point.
  await panel.getByRole('button', { name: 'Go back to “Before renaming”' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Go back to “Before renaming”?' });
  await confirm.getByRole('button', { name: 'Go back' }).click();
  await expect(title).toHaveValue(name);
  await expect(panel.getByText(/^Back at save point “Before renaming”/)).toBeVisible();
  await expect(panel.getByRole('listitem')).toHaveCount(2);
  await expect(panel.getByRole('listitem').first()).toContainText('made automatically');
  await expect(saved).toBeVisible({ timeout: 10_000 });

  // It is an ordinary edit: Undo takes it back, and the result is saved on the server.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(title).toHaveValue(`${name} (broken)`);
  await expect(saved).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel('Game name')).toHaveValue(`${name} (broken)`);

  // The save points survive a reload (the panel stays open) and are deleted after a confirmation.
  const reopened = page.getByRole('region', { name: 'Save points' });
  await reopened.getByRole('button', { name: 'Delete save point “Before renaming”' }).click();
  await page.getByRole('alertdialog', { name: 'Delete “Before renaming”?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(reopened.getByRole('listitem')).toHaveCount(1);
  await expect(reopened.getByRole('listitem')).toContainText('Before going back to “Before renaming”');
  await page.screenshot({ path: test.info().outputPath('save-points.png') });
});
