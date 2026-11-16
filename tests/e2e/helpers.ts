import { expect, type Locator, type Page } from '@playwright/test';

/** The phone keeps everything else behind one Menu button: opens it (if it is not open yet) and returns its tiles. */
export async function openPhoneMenu(page: Page): Promise<Locator> {
  const menu = page.getByRole('navigation', { name: 'More' });
  if (!(await menu.isVisible())) await page.getByRole('button', { name: /^Menu/ }).click();
  return menu;
}

/** Opens a folded section of the host panel (Room settings, Shared screen & invite); leaves it open if it already is. */
export async function openHostFold(host: Page, name: string) {
  const fold = host.locator('details.control-fold').filter({ has: host.locator('summary', { hasText: name }) });
  if (await fold.getAttribute('open') === null) await fold.locator('summary').click();
}
/** For tests about closing rounds by hand: rounds no longer end 3 seconds after everyone answered. */
export async function closeRoundsByHand(host: Page) {
  await openHostFold(host, 'Room settings');
  const setting = host.getByLabel('End a round soon after everyone answered');
  await setting.uncheck(); await expect(setting).not.toBeChecked();
  // Saved on the server too (the room update confirms it).
  await host.waitForTimeout(400);
}
/** Phones keep the scoreboard behind the bottom bar: open it, check what it lists, close it again. */
export async function expectPhoneScores(page: Page, expected: string[] | string) {
  await (await openPhoneMenu(page)).getByRole('button', { name: 'Scoreboard' }).click();
  const sheet = page.getByRole('dialog', { name: 'Scoreboard' });
  if (Array.isArray(expected)) await expect(sheet.getByRole('listitem')).toContainText(expected); else await expect(sheet).toContainText(expected);
  await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0);
}
