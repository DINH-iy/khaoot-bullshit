import { expect, type Page } from '@playwright/test';

/** For tests about closing rounds by hand: rounds no longer end 3 seconds after everyone answered. */
export async function closeRoundsByHand(host: Page) {
  const setting = host.getByLabel('End a round 3 seconds after everyone answered');
  await setting.uncheck(); await expect(setting).not.toBeChecked();
}
/** Phones keep the scoreboard behind the bottom bar: open it, check what it lists, close it again. */
export async function expectPhoneScores(page: Page, expected: string[] | string) {
  await page.getByRole('navigation', { name: 'More' }).getByRole('button', { name: 'Scoreboard' }).click();
  const sheet = page.getByRole('dialog', { name: 'Scoreboard' });
  if (Array.isArray(expected)) await expect(sheet.getByRole('listitem')).toContainText(expected); else await expect(sheet).toContainText(expected);
  await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0);
}
