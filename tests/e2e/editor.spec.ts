import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
const center = async (locator: Locator) => { const box = (await locator.boundingBox())!; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 }); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
}
const card = (page: Page, title: RegExp) => page.locator('.scene-card').filter({ has: page.locator('.card-title', { hasText: title }) });
const saved = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });
/** Shows the whole game, from the zoom menu (its button shows the zoom, such as "100%"). */
async function fit(page: Page) {
  await page.getByRole('button', { name: /^\d+%$/ }).click();
  await page.getByRole('menu', { name: 'Zoom' }).getByRole('menuitem', { name: 'Show the whole game' }).click();
}

test('the Flow editor moves, connects, adds and edits scenes, snapping everything into place, and saves', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The Flow editor is desktop first; phones are checked for not breaking only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Editor test ${Date.now()}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByLabel('Start from').selectOption({ label: 'A copy of Friday Night Chaos' });
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();

  await expect(page.getByRole('application', { name: 'Game flow' })).toBeVisible();
  await expect(page.locator('.scene-card')).toHaveCount(5);
  await expect(card(page, /Choose your challenge/)).toContainText('Party choice');
  await expect(card(page, /Music Mayhem/)).toContainText('Music route');
  await expect(card(page, /Shared finale/)).toContainText('Rejoin');
  await expect(page.locator('.edge-line')).toHaveCount(5);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Moving a card: it lands on the 24-unit grid (or level with the port feeding it), never on another card.
  const finale = card(page, /Shared finale/);
  const start = await center(finale.locator('.card-title'));
  await drag(page, start, { x: start.x + 37, y: start.y + 53 });
  const style = await finale.evaluate(element => ({ left: parseFloat((element as HTMLElement).style.left), top: parseFloat((element as HTMLElement).style.top) }));
  expect(style.left % 24).toBe(0);
  await saved(page);

  // Dragging a connection from an output port snaps onto a scene card when released near it.
  await fit(page);
  await page.getByRole('button', { name: 'Add a scene', exact: true }).click();
  // The add menu has tabs; arrow keys move between them. A scoreboard is under Between rounds.
  const tabs = page.getByRole('tablist', { name: 'Sorts of scenes' });
  await expect(tabs.getByRole('tab')).toHaveText(['Rounds', 'Games', 'Between rounds', 'Prefabs']);
  await tabs.getByRole('tab', { name: 'Rounds', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Add a scene' }).getByRole('menuitem')).toHaveCount(7);
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab', { name: 'Games' })).toBeFocused();
  await expect(page.getByRole('menu', { name: 'Add a scene' }).getByRole('menuitem', { name: /^Minigame/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.add-menu').analyze()).violations).toEqual([]);
  // A scoreboard is added straight away (no second menu); what it shows is a setting in its panel.
  await tabs.getByRole('tab', { name: 'Between rounds' }).click();
  await page.getByRole('menu', { name: 'Add a scene' }).getByRole('menuitem', { name: /^Scoreboard/ }).click();
  // The Flow editor's panel is about the flow: a summary and a way into the Scene editor, not the scene's settings.
  await expect(page.getByRole('complementary').getByRole('button', { name: 'Edit this scene →' })).toBeVisible();
  await expect(page.getByRole('complementary').getByRole('group', { name: 'Show' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await fit(page);
  const board = card(page, /^Standings$/);
  await expect(board).toBeVisible();
  await expect(board.locator('.card-problems')).toContainText('1 problem');
  // The finale already ends in "Results"; connect Results → Standings by dragging from its output.
  const results = card(page, /Shared finale/);
  const boardBox = (await board.boundingBox())!;
  await drag(page, await center(results.locator('.port-out')), { x: boardBox.x + 30, y: boardBox.y + 20 });
  await expect(page.locator('.edge-line')).toHaveCount(6);
  await saved(page);
  await expect(board.locator('.card-problems')).toHaveCount(0);

  // A connection dropped on empty canvas offers to add a connected scene right there.
  await fit(page);
  const boardOut = await center(board.locator('.port-out'));
  // The bottom-left corner of the canvas is empty: cards are centred by Fit.
  const area = (await page.locator('.flow-canvas').boundingBox())!;
  await drag(page, boardOut, { x: area.x + 40, y: area.y + area.height - 40 });
  const menu = page.getByRole('menu', { name: 'Add a connected scene' });
  await expect(menu).toBeVisible();
  // The menu opens on the tab used last (Between rounds, for the scoreboard).
  await expect(page.getByRole('tab', { name: 'Between rounds' })).toHaveAttribute('aria-selected', 'true');
  await menu.getByRole('menuitem', { name: /^Cutscene or info/ }).click();
  await expect(page.locator('.edge-line')).toHaveCount(7);
  const inspector = page.getByRole('complementary');
  // Its text is content: written in the Scene editor (opened from the panel), then back to the map.
  await inspector.getByRole('button', { name: 'Edit this scene →' }).click();
  await expect(page.getByRole('tab', { name: 'Scene editor' })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Text on every screen').fill('Thanks for playing!');
  await saved(page);
  await page.getByRole('tab', { name: 'Flow editor' }).click();
  await expect(card(page, /Thanks for playing!/)).toBeVisible();
  await saved(page);

  // Tap-to-connect without dragging, and a circle is refused.
  await page.getByRole('button', { name: 'Close' }).click();
  await fit(page);
  const thanks = card(page, /Thanks for playing!/);
  await thanks.locator('.port-out').click();
  await expect(page.getByText('Now tap the scene to connect to.')).toBeVisible();
  await card(page, /Choose your challenge/).locator('.card-title').click();
  await expect(page.getByText('That would make the game go round in a circle.')).toBeVisible();
  await expect(page.locator('.edge-line')).toHaveCount(7);

  // Removing a connection, then putting it back with the keyboard-friendly "Next scene" list.
  await page.locator('.edge-hit').last().dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Remove this connection' }).click();
  await expect(page.locator('.edge-line')).toHaveCount(6);
  await card(page, /^Standings$/).focus(); await page.keyboard.press('Enter');
  // The editor's own dropdown works with the keyboard: open it, type to find, Enter chooses.
  const next = inspector.getByRole('combobox', { name: 'Next scene' });
  await next.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: 'Nothing: the game ends here' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.type('Thanks');
  await expect(next).toHaveAttribute('aria-activedescendant', (await page.getByRole('option', { name: 'Thanks for playing!' }).getAttribute('id'))!);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(next).toHaveText('Thanks for playing!');
  await expect(page.locator('.edge-line')).toHaveCount(7);
  await saved(page);

  // Double-clicking a card opens it in the Scene editor, where its settings are; the host deciding hides the vote settings.
  await card(page, /Choose your challenge/).locator('.card-title').dblclick();
  await expect(page.getByRole('tab', { name: 'Scene editor' })).toHaveAttribute('aria-selected', 'true');
  const props = page.getByRole('complementary');
  const decides = props.getByRole('group', { name: 'Who decides' });
  await expect(props.getByRole('group', { name: 'On a tie' })).toBeVisible();
  await decides.getByRole('button', { name: 'The host' }).click();
  await expect(decides.getByRole('button', { name: 'The host' })).toHaveAttribute('aria-pressed', 'true');
  await expect(props.getByRole('group', { name: 'On a tie' })).toHaveCount(0);
  // Where it leads: a button per route goes to that scene; changing it is in the ☰ menu, which opens the Flow editor on the same scene.
  const leads = props.getByRole('group', { name: 'Next' });
  await expect(leads.getByRole('button')).toHaveText([/Music.*Music Mayhem/, /Physical.*Living Sculpture/]);
  await leads.getByRole('button', { name: /Music Mayhem/ }).click();
  await expect(props.getByRole('heading', { name: 'Music route' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Scenes in play order' }).getByRole('button', { name: /Choose your challenge/ }).click();
  await props.getByRole('button', { name: 'Scene actions' }).click();
  await page.getByRole('menuitem', { name: 'Change where it leads (Flow editor)' }).click();
  await expect(page.getByRole('tab', { name: 'Flow editor' })).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, /Choose your challenge/)).toContainText('Host decides');
  await expect(inspector.getByRole('heading', { name: 'Party choice' })).toBeVisible();
  await saved(page);
  await card(page, /^Standings$/).focus(); await page.keyboard.press('Enter');

  // The scene's actions are in the ☰ menu next to Close; deleting asks first.
  await inspector.getByRole('button', { name: 'Scene actions' }).click();
  await expect(page.getByRole('menu', { name: 'Scene actions' }).getByRole('menuitem')).toHaveText(['Start the game here', 'Duplicate', 'Save as prefab…', 'Delete scene…']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Scene actions' })).toHaveCount(0);
  await inspector.getByRole('button', { name: 'Scene actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete scene…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Keep' }).click();
  await expect(card(page, /^Standings$/)).toBeVisible();

  // Tidy up (from its menu, then with its shortcut), publish, and the published game matches the draft.
  await page.getByRole('button', { name: 'Tidy up' }).click();
  await page.getByRole('menu', { name: 'Tidy up' }).getByRole('menuitem', { name: /Tidy up into rows/ }).click();
  const layout = () => page.locator('.scene-card').evaluateAll(cards => cards.map(element => `${(element as HTMLElement).style.left},${(element as HTMLElement).style.top}`).join(' '));
  const tidy = await layout();
  // Moved out of place with the keyboard, then Ctrl+Shift+L tidies it back.
  await card(page, /^Standings$/).focus(); await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(layout).not.toBe(tidy);
  await page.keyboard.press('Control+Shift+L');
  await expect.poll(layout).toBe(tidy);
  await saved(page);
  await page.getByRole('button', { name: 'Play & publish' }).click(); await page.getByRole('menuitem', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Published as version 1.')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A reload restores the saved layout and connections.
  const before = await finale.evaluate(element => (element as HTMLElement).style.cssText);
  await page.reload();
  await expect(page.locator('.edge-line')).toHaveCount(7);
  expect(await card(page, /Shared finale/).evaluate(element => (element as HTMLElement).style.cssText)).toBe(before);
});

async function openCopy(page: Page, baseURL: string, name: string, desktop = true) {
  if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByLabel('Name of your new game').fill(name);
  await page.getByLabel('Start from').selectOption({ label: 'A copy of Friday Night Chaos' });
  await page.getByRole('button', { name: 'Create game' }).click();
  await page.getByRole('link', { name: `Edit ${name}` }).click();
  await expect(page.locator('.scene-card')).toHaveCount(5);
}

test('choices that need a description open a popup with cards: a duel’s game and an award', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Cards test ${Date.now()}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();
  await page.getByRole('button', { name: 'Add a scene', exact: true }).click();
  await page.getByRole('tab', { name: 'Games' }).click();
  await page.getByRole('menuitem', { name: /^Head-to-head duel/ }).click();
  await page.getByRole('menuitem', { name: /^Any contest/ }).click();
  const inspector = page.getByRole('complementary');
  await inspector.getByRole('button', { name: 'Edit this scene →' }).click();
  await expect(inspector.getByText('Any contest in the room')).toBeVisible();
  await inspector.getByRole('button', { name: 'Change how it is won…' }).click();
  const dialog = page.getByRole('dialog', { name: 'How is the duel won?' });
  await expect(dialog.getByRole('button', { name: /^Any contest/ })).toHaveAttribute('aria-pressed', 'true');
  expect((await new AxeBuilder({ page }).include('.choice-dialog').analyze()).violations).toEqual([]);
  // Escape keeps everything as it was.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await inspector.getByRole('button', { name: 'Change how it is won…' }).click();
  await dialog.getByRole('button', { name: /^Chess/ }).click();
  await expect(inspector.getByText('Chess on the two phones')).toBeVisible();
  await expect(inspector.getByLabel('Question or instruction')).toHaveValue('Chess duel! Who wins?');
  await saved(page);
  // An award is added from cards that say how it is decided.
  await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: 'Game settings' }).click();
  const settings = page.locator('.game-settings-panel');
  await settings.locator('summary', { hasText: 'End-of-game awards' }).click();
  await settings.getByRole('button', { name: 'Remove Luckiest' }).click();
  await settings.getByRole('button', { name: 'Add an award…' }).click();
  const awards = page.getByRole('dialog', { name: 'Add an award' });
  // Each statistic once; "best in one scene" can be added more than once; the wooden spoon is new.
  await expect(awards.getByRole('button')).toHaveText([/^Luckiest.*Lucky doors/, /^Best in one scene/, /^Wooden spoon.*fewest points/, 'Cancel']);
  await awards.getByRole('button', { name: /^Luckiest/ }).click();
  await expect(settings.getByLabel('Title of award 9')).toHaveAttribute('placeholder', 'Luckiest');
  // An award can have its own title; "best in one scene" asks which scene.
  await settings.getByLabel('Title of award 1').fill('Champion of the night');
  await settings.getByRole('button', { name: 'Add an award…' }).click();
  await page.getByRole('dialog', { name: 'Add an award' }).getByRole('button', { name: /^Best in one scene/ }).click();
  await expect(settings.getByRole('combobox', { name: 'Scene of award 10' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Remove Champion of the night' })).toBeVisible();
  await saved(page);
});

test('open sections follow you from scene to scene, also past a scene that does not have them', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Sections test ${Date.now()}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();
  const inspector = page.getByRole('complementary');
  const section = (title: string) => inspector.locator('details', { has: page.locator('summary', { hasText: title }) });
  const add = async (tab: string, item: RegExp, kind?: RegExp) => {
    await page.getByRole('button', { name: 'Add a scene', exact: true }).click();
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.getByRole('menuitem', { name: item }).click();
    if (kind) await page.getByRole('menuitem', { name: kind }).click();
  };
  const open = async () => { await inspector.getByRole('button', { name: 'Edit this scene →' }).click(); await expect(page.getByRole('tab', { name: 'Scene editor' })).toHaveAttribute('aria-selected', 'true'); };
  const back = () => page.getByRole('tab', { name: 'Flow editor' }).click();
  // A quiz (Content, Points, Who plays): open Points and Who plays, close Content.
  await add('Rounds', /^Quiz question/); await open();
  await inspector.locator('summary', { hasText: 'Points' }).click();
  await inspector.locator('summary', { hasText: 'Who plays' }).click();
  await inspector.locator('summary', { hasText: 'Content' }).click();
  // A cutscene has only Content: it stays closed; Points and Who plays are not there.
  await back(); await add('Between rounds', /^Cutscene or info/); await open();
  await expect(section('Content')).not.toHaveAttribute('open', '');
  await expect(section('Points')).toHaveCount(0);
  // A minigame has them again: Points and Who plays are open, Content still closed.
  await back(); await add('Games', /^Minigame/, /^Tap race/); await open();
  await expect(section('Points')).toHaveAttribute('open', '');
  await expect(section('Who plays')).toHaveAttribute('open', '');
  await expect(section('Content')).not.toHaveAttribute('open', '');
});

test('View mode: look through a game without changing it by accident; Edit changes it again', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `View test ${Date.now()}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByLabel('Start from').selectOption({ label: 'A copy of Friday Night Chaos' });
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();
  // One button switches between Editing and Viewing.
  await page.getByRole('button', { name: /^Editing/ }).click();
  await expect(page.getByRole('button', { name: /^Viewing/ })).toBeVisible();
  // On the map: a card can be selected but not moved, deleted or connected; nothing can be added.
  const finale = card(page, /Shared finale/);
  const before = await finale.evaluate(element => (element as HTMLElement).style.cssText);
  const start = await center(finale.locator('.card-title'));
  await drag(page, start, { x: start.x + 120, y: start.y + 80 });
  expect(await finale.evaluate(element => (element as HTMLElement).style.cssText)).toBe(before);
  await expect(finale).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a scene', exact: true })).toBeDisabled();
  await expect(finale.locator('.port-out')).toBeHidden();
  const inspector = page.getByRole('complementary');
  await expect(inspector.getByRole('button', { name: 'Scene actions' })).toHaveCount(0);
  await expect(inspector.getByRole('combobox', { name: 'Next scene' })).toBeDisabled();
  // Opening the scene still works; its fields are locked.
  await inspector.getByRole('button', { name: 'Open this scene →' }).click();
  await expect(page.getByLabel('Question or instruction')).toBeDisabled();
  await expect(page.getByLabel('Game name')).toHaveAttribute('readonly', '');
  // Remembered on this browser after a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: /^Viewing/ })).toBeVisible();
  // Back to Editing: the same fields can be changed again.
  await page.getByRole('button', { name: /^Viewing/ }).click();
  await page.getByRole('tab', { name: 'Flow editor' }).click();
  await expect(page.getByRole('button', { name: /^Editing/ })).toBeVisible();
  await fit(page);
  const again = await center(card(page, /Shared finale/).locator('.card-title'));
  await drag(page, again, { x: again.x - 150, y: again.y + 150 });
  expect(await card(page, /Shared finale/).evaluate(element => (element as HTMLElement).style.cssText)).not.toBe(before);
  await saved(page);
});

test('the scroll wheel zooms (Shift + scroll moves), and Help & shortcuts opens with ?, the ☰ menu or the map’s Tips', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await openCopy(page, baseURL!, `Zoom ${Date.now()}`);
  const surface = page.locator('.flow-surface');
  const zoom = async () => Number(/scale\(([\d.]+)\)/.exec((await surface.getAttribute('style'))!)![1]);
  const area = (await page.locator('.flow-canvas').boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  const before = await zoom();
  await page.mouse.wheel(0, -300);
  await expect.poll(zoom).toBeGreaterThan(before);
  const zoomed = await zoom(); const moved = (await surface.getAttribute('style'))!;
  await page.keyboard.down('Shift'); await page.mouse.wheel(0, 200); await page.keyboard.up('Shift');
  await expect.poll(async () => (await surface.getAttribute('style'))!).not.toBe(moved);
  expect(await zoom()).toBe(zoomed);
  // The zoom menu shows the zoom and changes it.
  const level = page.getByRole('button', { name: /^\d+%$/ });
  await expect(level).toHaveText(new RegExp(`^${Math.round(zoomed * 100)}%`));
  await level.click(); await page.getByRole('menuitem', { name: 'Zoom to 100%' }).click();
  await expect.poll(zoom).toBe(1);
  // Help & shortcuts: the ? key, the ☰ menu, and the map's Tips (which list the gestures).
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Help & shortcuts' });
  await expect(help.getByRole('row').filter({ hasText: 'Undo' })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.help-panel').analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: /Help & shortcuts/ }).click();
  await expect(help).toBeVisible();
  await help.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Tips' }).click();
  await expect(page.getByText('Right-click the background to add a scene there.')).toBeVisible();
  await page.getByRole('button', { name: 'All shortcuts (?)' }).click();
  await expect(help).toBeVisible();
  await help.getByRole('button', { name: 'Close' }).click();
  // Light or dark, from the ☰ menu, remembered in this browser.
  const scheme = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: 'Dark mode' }).click();
  await expect.poll(scheme).toBe('dark');
  await page.reload();
  await expect.poll(scheme).toBe('dark');
  await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: 'Light mode' }).click();
  await expect.poll(scheme).toBe('light');
});

test('the editor works on a phone: compact top bar, the scene panel and menus as sheets on screen', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Checked here with a phone-sized window.');
  await page.setViewportSize({ width: 390, height: 844 });
  await openCopy(page, baseURL!, `Phone ${Date.now()}`, false);
  // The whole top bar fits in the first quarter of the screen.
  expect((await page.locator('.editor-header').boundingBox())!.height).toBeLessThan(220);
  await card(page, /Choose your challenge/).locator('.card-title').click();
  const panel = page.getByRole('complementary');
  const inView = async (locator: Locator) => { const box = (await locator.boundingBox())!; return box.y >= 0 && box.y + 40 <= 844 && box.x >= 0 && box.x + box.width <= 391; };
  expect(await inView(panel.getByRole('button', { name: 'Edit this scene →' }))).toBe(true);
  await panel.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Play & publish' }).click();
  expect(await inView(page.getByRole('menuitem', { name: 'Publish', exact: true }))).toBe(true);
});

test('an arrow gets bend points to lead it around something, while the scenes stay put', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await openCopy(page, baseURL!, `Bends ${Date.now()}`);
  const edge = page.locator('.edge').first(); const key = (await edge.getAttribute('data-edge'))!;
  const arrow = page.locator(`.edge[data-edge="${key}"]`);
  const cards = async () => page.locator('.scene-card').evaluateAll(all => all.map(card => (card as HTMLElement).style.cssText).join('|'));
  const before = await cards(); const line = await arrow.locator('.edge-line').getAttribute('d');
  await arrow.locator('.edge-hit').dispatchEvent('pointerdown');
  await expect(arrow.locator('.edge-bend-add')).toHaveCount(1);
  // Drag the + handle down: a bend point there; the arrow passes through it; no scene moves.
  const handle = await center(arrow.locator('.edge-bend-add'));
  await drag(page, handle, { x: handle.x, y: handle.y + 160 });
  await expect(arrow.locator('.edge-bend')).toHaveCount(1);
  expect(await arrow.locator('.edge-line').getAttribute('d')).not.toBe(line);
  expect(await cards()).toBe(before);
  await saved(page);
  // Kept after a reload.
  await page.reload();
  await page.locator(`.edge[data-edge="${key}"] .edge-hit`).dispatchEvent('pointerdown');
  await expect(page.locator(`.edge[data-edge="${key}"] .edge-bend`)).toHaveCount(1);
  // Straighten takes the bends away again.
  await page.locator('.edge-actions').getByRole('button', { name: 'Straighten' }).click();
  await expect(page.locator(`.edge[data-edge="${key}"] .edge-bend`)).toHaveCount(0);
  expect(await page.locator(`.edge[data-edge="${key}"] .edge-line`).getAttribute('d')).toBe(line);
});

test('an arrow can be picked up by its end and moved to another scene; several scenes move together and undo restores them', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await openCopy(page, baseURL!, `Arrows ${Date.now()}`);
  // The arrow from Music Mayhem goes to the finale. Grab its end and drop it on Living Sculpture instead.
  const music = card(page, /Music Mayhem/); const sculpture = card(page, /Living Sculpture/); const finale = card(page, /Shared finale/);
  const handle = page.locator('[data-edge="music-to-finale"] .edge-end');
  await page.locator('[data-edge="music-to-finale"] .edge-hit').dispatchEvent('pointerdown');
  const target = (await sculpture.boundingBox())!;
  await drag(page, await center(handle), { x: target.x + 30, y: target.y + 20 });
  await saved(page);
  await expect(page.locator('.edge-line')).toHaveCount(5);
  await expect(page.locator('[data-edge="music-to-finale"]')).toHaveCount(0);
  // Music → Sculpture now exists; the finale is still reached from Sculpture only.
  await expect(finale).not.toContainText('Rejoin');
  await expect(page.getByText('Connection removed')).toHaveCount(0);
  // Dropping a picked-up arrow on empty canvas removes it; Undo brings it back.
  const sculptureIn = await center(sculpture.locator('.port-in'));
  const area = (await page.locator('.flow-canvas').boundingBox())!;
  await drag(page, { x: sculptureIn.x - 2, y: sculptureIn.y }, { x: area.x + 40, y: area.y + area.height - 40 });
  await expect(page.getByText('Connection removed. Undo brings it back.')).toBeVisible();
  expect(await page.locator('.edge-line').count()).toBe(4);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.edge-line')).toHaveCount(5);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('.edge-line')).toHaveCount(4);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(page.locator('.edge-line')).toHaveCount(5);

  // Shift-click two scenes, drag one: both move by the same amount. Undo puts both back.
  const before = await Promise.all([music, sculpture].map(item => item.evaluate(element => [parseFloat((element as HTMLElement).style.left), parseFloat((element as HTMLElement).style.top)])));
  await music.locator('.card-title').click();
  await sculpture.locator('.card-title').click({ modifiers: ['Shift'] });
  await expect(page.getByRole('heading', { name: '2 scenes selected' })).toBeVisible();
  const grip = await center(music.locator('.card-title'));
  await drag(page, grip, { x: grip.x + 96, y: grip.y + 48 });
  const after = await Promise.all([music, sculpture].map(item => item.evaluate(element => [parseFloat((element as HTMLElement).style.left), parseFloat((element as HTMLElement).style.top)])));
  const moved = (index: number) => [after[index]![0]! - before[index]![0]!, after[index]![1]! - before[index]![1]!];
  expect(moved(0)).toEqual(moved(1)); expect(moved(0)[0]).not.toBe(0);
  await saved(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  const undone = await Promise.all([music, sculpture].map(item => item.evaluate(element => [parseFloat((element as HTMLElement).style.left), parseFloat((element as HTMLElement).style.top)])));
  expect(undone).toEqual(before);
  // Shift-drag a box: every scene inside it is added to the selection; Ctrl/Cmd+A selects all.
  const frame = (await page.locator('.flow-canvas').boundingBox())!;
  await page.keyboard.down('Shift');
  await drag(page, { x: frame.x + 8, y: frame.y + 8 }, { x: frame.x + frame.width - 8, y: frame.y + frame.height - 8 });
  await page.keyboard.up('Shift');
  await expect(page.getByRole('heading', { name: /^[345] scenes selected$/ })).toBeVisible();
  await page.locator('.flow-canvas').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await expect(page.getByRole('heading', { name: '5 scenes selected' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('coming back to a game opens the same place: editor, scene, panel and part of Look & feel', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await openCopy(page, baseURL!, `Memory ${Date.now()}`);
  // The plain link to this game, without the view in it.
  const plain = () => { const url = new URL(page.url()); url.searchParams.delete('view'); return url.toString(); };
  await card(page, /Music Mayhem/).locator('.card-title').dblclick();
  await expect(page.getByRole('complementary', { name: 'Music route' })).toBeVisible();
  await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: 'Game settings' }).click();
  await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
  await page.goto(plain());
  await expect(page.getByRole('tab', { name: 'Scene editor' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('complementary', { name: 'Music route' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
  await page.locator('.game-settings-panel').getByRole('button', { name: 'Close' }).click();
  // Look & feel opens on the part last used.
  await page.getByRole('tab', { name: 'Look & feel' }).click();
  await page.getByRole('tab', { name: 'Texts' }).click();
  await page.goto(plain());
  await expect(page.getByRole('tab', { name: 'Look & feel' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Texts' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Game settings' })).toHaveCount(0);
});

test('the Scene editor lists scenes in play order, previews them, and edits parts and game settings on the same draft', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await openCopy(page, baseURL!, `Scenes ${Date.now()}`);
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  const list = page.getByRole('navigation', { name: 'Scenes in play order' });
  await expect(list.locator('.scene-row')).toContainText(['FRIDAY NIGHT.', 'Choose your challenge!', /Music Mayhem/, /Living Sculpture/, /Shared finale/]);
  await expect(list.getByRole('button', { name: /Music route/ })).toBeVisible();
  // A party choice's routes fold: closing one hides its scenes, the other route stays; selecting a scene on it opens it again.
  const musicRoute = list.getByRole('button', { name: /^Route: Music/ });
  await expect(musicRoute).toHaveAttribute('aria-expanded', 'true');
  await musicRoute.click();
  await expect(musicRoute).toHaveAttribute('aria-expanded', 'false');
  await expect(list.getByRole('button', { name: /Music Mayhem/ })).toHaveCount(0);
  await expect(list.getByRole('button', { name: /Living Sculpture/ })).toBeVisible();
  await musicRoute.click();
  await expect(list.getByRole('button', { name: /Music Mayhem/ })).toBeVisible();
  // All routes fold and unfold at once.
  await list.getByRole('button', { name: 'Fold all routes' }).click();
  await expect(list.getByRole('button', { name: /^Route:/ })).toHaveCount(2);
  await expect(list.locator('.scene-row')).toHaveCount(3);
  await list.getByRole('button', { name: 'Unfold all routes' }).click();
  await expect(list.locator('.scene-row')).toHaveCount(5);
  // The opening scene has two parts: a cutscene and a warm-up question.
  await list.getByRole('button', { name: /FRIDAY NIGHT/ }).click();
  const props = page.getByRole('complementary', { name: 'Cutscene' });
  await expect(page.getByRole('tab', { name: /Part 2 · Quiz/ })).toBeVisible();
  await props.getByLabel('Title').fill('FRIDAY NIGHT LIVE');
  await expect(page.locator('.tv-banner')).toHaveText('FRIDAY NIGHT LIVE');
  // Add a scoreboard part, which becomes part 3, and see its preview. Parts are a small group, closed until opened.
  await expect(props.locator('summary', { hasText: 'Parts' })).toContainText('2 parts');
  await props.locator('summary', { hasText: 'Parts' }).click();
  await props.getByRole('button', { name: 'Add a part' }).click();
  await props.getByRole('tab', { name: 'Between rounds' }).click();
  await props.getByRole('menuitem', { name: /^Scoreboard/ }).click();
  await expect(page.getByRole('tab', { name: /Part 3 · Results/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tv-scores')).toBeVisible();
  // Insert a quiz question right after the party choice's Music route scene.
  await list.getByRole('button', { name: /Music Mayhem/ }).click();
  // Its menu floats over the preview, on top of everything.
  await list.getByRole('button', { name: 'Add after this' }).click();
  const adding = page.locator('.floating-menu');
  await adding.getByRole('tab', { name: 'Rounds', exact: true }).click();
  const quiz = adding.getByRole('menuitem', { name: /^Quiz question/ });
  const spot = await center(quiz);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.floating-menu') !== null, spot)).toBe(true);
  await quiz.click();
  await expect(list.locator('.scene-row')).toHaveCount(6);
  // A solo game: its rounds offer no team play, and Game settings says how to make it a team game.
  await expect(page.getByLabel('Players')).not.toContainText('In the teams');
  await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: 'Game settings' }).click();
  await page.getByText('Teams', { exact: true }).click();
  await expect(page.getByText('Everyone plays for themselves. For a team game, add a Pick teams scene', { exact: false })).toBeVisible();
  await saved(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // The Flow editor shows the same draft.
  await page.getByRole('tab', { name: 'Flow editor' }).click();
  await expect(page.locator('.scene-card')).toHaveCount(6);
  await expect(card(page, /^Your question\?$/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Flow editor' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.scene-card')).toHaveCount(6);
});

test('scenes can be duplicated, copied into another game, found on the minimap, and rehearsed without publishing', async ({ page, baseURL, context }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  const stamp = Date.now();
  await openCopy(page, baseURL!, `Copy source ${stamp}`);
  const sourceUrl = page.url();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  // Duplicate the two routes' scenes together.
  await card(page, /Music Mayhem/).locator('.card-title').click();
  await card(page, /Living Sculpture/).locator('.card-title').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Duplicate 2 scenes' }).click();
  await expect(page.locator('.scene-card')).toHaveCount(7);
  await expect(page.getByRole('heading', { name: '2 scenes selected' })).toBeVisible();
  await saved(page);
  await page.keyboard.press(`${modifier}+c`);
  await expect(page.getByText('Copied 2 scenes.')).toBeVisible();
  // The minimap moves the view.
  const surface = page.locator('.flow-surface');
  const before = await surface.evaluate(element => (element as HTMLElement).style.transform);
  const mini = (await page.getByRole('img', { name: /Overview of the whole game/ }).boundingBox())!;
  await page.mouse.click(mini.x + 8, mini.y + 8);
  expect(await surface.evaluate(element => (element as HTMLElement).style.transform)).not.toBe(before);

  // Rehearse from the start: a practice room opens in a new tab, and nothing is published.
  const [practice] = await Promise.all([context.waitForEvent('page'), (async () => { await page.getByRole('button', { name: 'Play & publish' }).click(); await page.getByRole('menuitem', { name: 'Rehearse from the start' }).click(); })()]);
  await expect(practice.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ })).toBeVisible();
  await expect(practice.getByText(/^Copy source \d+ · waiting to start$/)).toBeVisible();
  await practice.close();
  await expect(page.locator('.crumb')).not.toContainText('published');
  // Rehearse from a scene that votes on nothing earlier: fine; the room starts there.
  await card(page, /Shared finale/).locator('.card-title').click();
  await page.getByRole('button', { name: 'Close' }).click().catch(() => undefined);
  await card(page, /Shared finale/).locator('.card-title').click();
  const [fromFinale] = await Promise.all([context.waitForEvent('page'), (async () => { await page.getByRole('button', { name: 'Play & publish' }).click(); await page.getByRole('menuitem', { name: 'Rehearse from the selected scene' }).click(); })()]);
  await expect(fromFinale.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ })).toBeVisible();
  await fromFinale.getByRole('button', { name: 'Start the game' }).click();
  await expect(fromFinale.getByRole('heading', { name: /^Shared finale/ })).toBeVisible();
  await fromFinale.close();
  // Try this scene (Scene editor): a practice room with only this scene, to try a minigame or round without the rest.
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  await page.getByRole('navigation', { name: 'Scenes in play order' }).getByRole('button', { name: /Music Mayhem/ }).first().click();
  const [tryIt] = await Promise.all([context.waitForEvent('page'), page.getByRole('complementary').getByRole('button', { name: 'Try this scene' }).click()]);
  await tryIt.getByRole('button', { name: 'Start the game' }).click();
  await expect(tryIt.getByRole('heading', { name: /^Music Mayhem/ })).toBeVisible();
  await tryIt.close();
  await page.getByRole('tab', { name: 'Flow editor' }).click();

  // Paste the copied scenes into another game.
  await openCopy(page, baseURL!, `Paste target ${stamp}`);
  await page.keyboard.press(`${modifier}+v`);
  await expect(page.getByText('Pasted 2 scenes.', { exact: false })).toBeVisible();
  await expect(page.locator('.scene-card')).toHaveCount(7);
  await saved(page);
  await page.goto(sourceUrl);
  await expect(page.locator('.scene-card')).toHaveCount(7);
});

test('a game written by an AI is imported from text, opens in the editor, and can be exported again', async ({ page, baseURL, context }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const section = page.getByRole('region', { name: 'Import a game from text' });
  await section.getByRole('button', { name: 'Copy instructions for an AI' }).click();
  await expect(section.getByRole('button', { name: 'Instructions copied ✓' })).toBeVisible();
  const instructions = await page.evaluate(() => navigator.clipboard.readText());
  // The AI asks its questions first, then answers with only the game.
  expect(instructions).toContain('First, ask before you write.');
  expect(instructions).toContain('reply with ONLY one JSON object');
  expect(instructions).not.toContain('ai-instructions');
  // What an AI might answer: chatter around a fenced JSON block.
  const answer = 'Here is your game!\n```json\n' + JSON.stringify({ title: `AI quiz ${Date.now()}`, scenes: [
    { id: 'welcome', type: 'cutscene', title: 'QUIZ TIME', text: 'Phones out!' },
    { id: 'q1', type: 'quiz', question: 'Capital of France?', answers: ['Paris', 'Lyon'], correct: 'Paris', seconds: 20 },
    { id: 'joke', type: 'writing', question: 'Finish the joke: a cat walks into a bar…' },
    { id: 'joke-vote', type: 'vote', question: 'Funniest?', votesOn: 'joke' },
    { id: 'end', type: 'scoreboard', title: 'Final scores' },
  ] }) + '\n```\nEnjoy!';
  await section.getByLabel('Game text').fill('this is not json');
  await section.getByRole('button', { name: 'Import' }).click();
  await expect(section.getByRole('alert')).toContainText('This is not a game in JSON');
  await section.getByLabel('Game text').fill(answer);
  await section.getByRole('button', { name: 'Import' }).click();
  await expect(page.locator('.scene-card')).toHaveCount(5);
  await expect(page.getByText('no problems')).toBeVisible();
  await expect(card(page, /^Funniest\?$/)).toContainText('Vote');
  await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: 'Export as text' }).click();
  const exported = await page.getByLabel('The game as text').inputValue();
  expect(JSON.parse(exported)).toMatchObject({ formatVersion: 2, nodes: expect.any(Array), edges: expect.any(Array), editor: { positions: expect.any(Object) } });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
