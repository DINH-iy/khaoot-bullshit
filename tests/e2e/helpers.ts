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
  if (await tab.getAttribute('aria-expanded') === 'true') return;
  // Room settings, Shared screen & invite and (during the game) Players are popups over the screen: one at a time.
  await closeHostFold(host);
  await tab.click();
}
/** Closes the host's popup (room settings, invite, players), if one is open, so the rest of the screen can be used again. */
export async function closeHostFold(host: Page) {
  const dialog = host.locator('.host-dialog');
  if (await dialog.count()) { await host.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); }
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
  await closeHostFold(host);
}
/** Phones keep the scoreboard behind the bottom bar: open it, check what it lists, close it again. */
export async function expectPhoneScores(page: Page, expected: string[] | string) {
  await (await openPhoneMenu(page)).getByRole('button', { name: 'Scoreboard' }).click();
  const sheet = page.getByRole('dialog', { name: 'Scoreboard' });
  if (Array.isArray(expected)) await expect(sheet.getByRole('listitem')).toContainText(expected); else await expect(sheet).toContainText(expected);
  await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0);
}

/** Opens the shared dropdown and chooses a value from its portaled list. */
export async function chooseOption(control: Locator, option: string | { label: string }) {
  await control.click();
  const id = await control.getAttribute('aria-controls');
  expect(id).toBeTruthy();
  const list = control.page().locator(`[id=${JSON.stringify(id)}]`);
  const choice = typeof option === 'string' ? list.locator(`[data-value=${JSON.stringify(option)}]`) : list.getByRole('option', { name: option.label, exact: true });
  await choice.click();
}

/** Changing a built-in style makes a saved style (“My Neon night”, “My Neon night 2”…): tests remove theirs again. */
export async function removeForkedStyles(page: Page, baseURL: string, builtIn: string) {
  const headers = { 'x-party-request': '1', origin: baseURL };
  const styles = (await (await page.request.get(`${baseURL}/api/host/styles`, { headers })).json()).data as { id: string; name: string }[];
  for (const style of styles.filter(entry => entry.name === `My ${builtIn}` || entry.name.startsWith(`My ${builtIn} `)))
    await page.request.post(`${baseURL}/api/host/styles/${style.id}/delete`, { headers, data: {} });
}
