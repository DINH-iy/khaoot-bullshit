import { expect, test, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
const card = (page: Page, title: RegExp) => page.locator('.scene-card').filter({ has: page.locator('.card-title', { hasText: title }) });
const saved = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });
const peers = (page: Page) => page.getByRole('list', { name: 'Also editing this game' });
const nameField = (page: Page) => page.getByLabel('Your name, as others editing this game see it');

/** Two people, each in their own browser, with the same game open in the editor. */
async function twoEditors(browser: Browser, baseURL: string, startFrom: string, benHearsNothing = false) {
  const pages: Page[] = [];
  for (const who of ['Ada', 'Ben']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await expect(page.getByRole('region', { name: 'Your games' })).toBeVisible();
    await page.evaluate(name => localStorage.setItem('party-editor-name', name), who); pages.push(page);
    // The live channel is cut for Ben (not the server itself): he never hears about Ada's saves.
    if (benHearsNothing && who === 'Ben') await context.route('**/socket.io/**', route => route.abort());
  }
  const [ada, ben] = pages as [Page, Page];
  const mine = ada.getByRole('region', { name: 'Your games' }); const name = `Together ${Date.now()}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByLabel('Start from').selectOption({ label: startFrom });
  await mine.getByRole('button', { name: 'Create game' }).click();
  const href = await mine.getByRole('link', { name: `Edit ${name}` }).getAttribute('href');
  for (const page of pages) { await page.goto(`${baseURL}${href}`); await expect(page.getByRole('application', { name: 'Game flow' })).toBeVisible(); }
  if (!benHearsNothing) { await expect(peers(ada)).toContainText('Ben'); await expect(peers(ben)).toContainText('Ada'); }
  return { ada, ben, name, href: href! };
}

test('two people edit one game at once: each sees the other’s work, selection and pointer, and undo is their own', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  const { ada, ben } = await twoEditors(browser, baseURL!, 'A copy of Friday Night Chaos');

  // Ada selects a scene: Ben sees which one, and where her pointer is.
  await card(ada, /Music Mayhem/).locator('.card-title').click();
  const adasCard = card(ben, /Music Mayhem/);
  await expect(adasCard).toHaveClass(/peer-selected/); await expect(adasCard.locator('.peer-tag')).toHaveText('Ada');
  await expect(card(ben, /Shared finale/)).not.toHaveClass(/peer-selected/);
  await expect(ben.locator('.peer-cursor')).toContainText('Ada');
  expect((await new AxeBuilder({ page: ben }).analyze()).violations).toEqual([]);

  // Both change something different at the same time; nobody reloads, nobody loses anything.
  await card(ben, /Shared finale/).locator('.card-title').click();
  await ada.locator('.inspector textarea').first().fill('Ada wrote this');
  await ben.locator('.inspector textarea').first().fill('Ben wrote this');
  await ben.getByLabel('Game name').fill('Named by Ben');
  for (const page of [ada, ben]) {
    await expect(page.locator('.card-title', { hasText: 'Ada wrote this' })).toBeVisible();
    await expect(page.locator('.card-title', { hasText: 'Ben wrote this' })).toBeVisible();
    await expect(page.getByLabel('Game name')).toHaveValue('Named by Ben');
  }
  await saved(ada); await saved(ben);

  // Ben adds a scene while Ada moves one: both arrive on both screens.
  await ben.getByRole('button', { name: 'Add a scene', exact: true }).click();
  await ben.getByRole('menu', { name: 'Add a scene' }).getByRole('menuitem', { name: /^Scoreboard/ }).click();
  await expect(ada.locator('.scene-card')).toHaveCount(6);
  await expect(card(ada, /^Standings$/)).toHaveClass(/peer-selected/);

  // Ada's undo takes back her own text only: Ben's text, name and new scene stay.
  await ada.getByRole('button', { name: 'Close' }).click();
  await ada.getByRole('button', { name: 'Undo' }).click();
  for (const page of [ada, ben]) {
    await expect(page.locator('.card-title', { hasText: 'Ada wrote this' })).toHaveCount(0);
    await expect(page.locator('.card-title', { hasText: 'Ben wrote this' })).toBeVisible();
    await expect(page.locator('.scene-card')).toHaveCount(6);
    await expect(page.getByLabel('Game name')).toHaveValue('Named by Ben');
  }
  await ada.getByRole('button', { name: 'Redo' }).click();
  await expect(ben.locator('.card-title', { hasText: 'Ada wrote this' })).toBeVisible();
  await saved(ada); await saved(ben);

  // What is saved is the combined game.
  await ada.reload();
  await expect(ada.locator('.scene-card')).toHaveCount(6);
  await expect(ada.locator('.card-title', { hasText: 'Ada wrote this' })).toBeVisible(); await expect(ada.locator('.card-title', { hasText: 'Ben wrote this' })).toBeVisible();

  // In the Scene editor the list shows where the other person is; leaving removes them.
  await ben.getByRole('tab', { name: 'Scene editor' }).click();
  await ada.getByRole('tab', { name: 'Scene editor' }).click();
  await expect(ada.getByRole('navigation', { name: 'Scenes in play order' }).locator('.scene-row', { hasText: 'Standings' }).locator('.peer-tag')).toHaveText('Ben');
  await nameField(ben).fill('Benjamin'); await expect(peers(ada)).toContainText('Benjamin');
  await ben.context().close();
  await expect(peers(ada)).toHaveCount(0);
  await ada.context().close();
});

test('edits made while the live connection is down are merged when saving', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  const { ada, ben } = await twoEditors(browser, baseURL!, 'A blank game', true);
  await expect(peers(ada)).toHaveCount(0);
  await ada.getByRole('button', { name: 'Add a scene', exact: true }).click();
  await ada.getByRole('menu', { name: 'Add a scene' }).getByRole('menuitem', { name: /^Quiz question/ }).click();
  await saved(ada);
  await ben.getByLabel('Game name').fill('Ben kept working');
  await saved(ben);
  await ben.reload();
  await expect(ben.locator('.scene-card')).toHaveCount(2); await expect(ben.getByLabel('Game name')).toHaveValue('Ben kept working');
  await ada.context().close(); await ben.context().close();
});
