import { expect, test } from '@playwright/test';
import { chooseOption } from './helpers.js';

test('the join screen shows the English patch history at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await chooseOption(page.getByRole('combobox', { name: 'Language' }), 'nl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');

  const trigger = page.getByRole('button', { name: 'Patch notes' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const notes = page.getByRole('dialog', { name: 'Patch notes' });
  const close = notes.getByRole('button', { name: 'Close', exact: true });
  await expect(notes).toHaveAttribute('lang', 'en');
  await expect(close).toBeFocused();

  const dates = await notes.locator('time').evaluateAll(items => items.map(item => (item as HTMLTimeElement).dateTime));
  expect(dates[0]).toBeTruthy();
  expect(dates.at(-1)).toBe('2026-11-09');
  expect(dates).toEqual([...new Set(dates)].sort().reverse());

  const history = notes.getByRole('region', { name: 'Update history' });
  await history.focus();
  await page.keyboard.press('End');
  await expect(notes.getByRole('heading', { name: '9 November 2026', exact: true })).toBeInViewport();
  await expect(close).toBeInViewport();
  expect(await notes.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(notes).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('the host can open and close patch notes from the host menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as owner' }).click();
  await expect(page).toHaveURL(/\?host=1$/);

  const trigger = page.getByRole('button', { name: 'Patch notes' });
  await trigger.click();
  const notes = page.getByRole('dialog', { name: 'Patch notes' });
  await expect(notes.getByText(/Added Hangman/)).toBeVisible();
  await notes.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(notes).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('new commits appear on reopen and join the matching historical day', async ({ page }) => {
  let commits = [{ date: '2026-11-26', changes: ['Updated Arcade.'] }];
  await page.route('**/patch-notes/commits.json', route => route.fulfill({ json: commits }));
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Patch notes' });
  await trigger.click();
  const notes = page.getByRole('dialog', { name: 'Patch notes' });
  const sameDay = notes.getByRole('article').filter({ has: page.getByRole('heading', { name: '26 November 2026', exact: true }) });
  await expect(sameDay).toHaveCount(1);
  await expect(sameDay).toContainText('Updated Arcade.');
  await expect(sameDay).toContainText('Hangman players');
  await notes.getByRole('button', { name: 'Close' }).click();

  commits = [{ date: '2026-11-27', changes: ['Add an invitation button'] }, ...commits];
  await trigger.click();
  await expect(notes.getByRole('article').first()).toContainText('Add an invitation button');
});
