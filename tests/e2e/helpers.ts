import { expect, type Locator, type Page } from '@playwright/test';

/** The phone keeps everything else behind one Menu button: opens it (if it is not open yet) and returns its tiles. */
export async function openPhoneMenu(page: Page): Promise<Locator> {
  const menu = page.getByRole('navigation', { name: 'More' });
  if (!(await menu.isVisible())) await page.getByRole('button', { name: /^Menu/ }).click();
  return menu;
}

/** Opens a sheet of the host panel by its icon (Room settings, Shared screen & invite, Players, Back to lobby); leaves it open if it already is. */
export async function openHostFold(host: Page, name: string) {
  const tab = host.getByRole('group', { name: 'More' }).getByRole('button', { name });
  if (await tab.getAttribute('aria-expanded') !== 'true') await tab.click();
}
/** Opens one of the host's round tools that keep their choices in a small panel (Set the time, Reopen answers). */
export async function openHostTool(host: Page, name: string) {
  const tool = host.getByRole('toolbar', { name: 'Round tools' }).getByRole('button', { name, exact: true });
  if (await tool.getAttribute('aria-expanded') !== 'true') await tool.click();
}
/** The connection lives behind a dot in the top bar: opens its menu and returns the status line. */
export async function connectionStatus(page: Page): Promise<Locator> {
  const dot = page.getByRole('region', { name: 'Connection', exact: true }).getByRole('button', { name: /^Connection:/ });
  if (await dot.getAttribute('aria-expanded') !== 'true') await dot.click();
  return page.getByRole('dialog', { name: /^Connection:/ }).getByRole('status', { name: 'Connection status' });
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
