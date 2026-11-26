import { chooseOption } from './helpers.js';
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

test('Group 4 authoring offers prompt starters, an Intro, a Space preset, and undoable scene replacement', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Keyboard and canvas gestures use the desktop project.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Space writing ${Date.now()}`;
  await mine.getByRole('button', { name: 'New game', exact: true }).click();
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();

  // No tour: the editor opens straight on the game flow.
  await expect(page.getByRole('application', { name: 'Game flow' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Editor tour' })).toHaveCount(0);
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Help & shortcuts' });
  await chooseOption(help.getByLabel('Show the whole game.'), '3');
  await chooseOption(help.getByLabel('Tidy into rows'), 'J');
  await expect(help.getByRole('row', { name: /Shift \+ J Tidy up into rows/ })).toBeVisible();
  await help.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /^\d+%$/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Show the whole game' })).toHaveAttribute('aria-keyshortcuts', 'Shift+3');
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Scene editor' }).click();
  await page.getByRole('button', { name: 'Add after this' }).click();
  await page.getByRole('tab', { name: 'Rounds', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Writing round/ }).click();
  const props = page.locator('.scene-props');
  await expect(props.getByLabel('Question or instruction')).toHaveValue('Write your answer.');
  await props.getByText('Prompt starters', { exact: true }).click();
  await props.getByRole('button', { name: 'Finish the joke' }).click();
  await expect(props.getByLabel('Question or instruction')).not.toHaveValue('Write your answer.');

  await page.getByRole('button', { name: 'Add after this' }).click();
  await page.getByRole('tab', { name: 'Between rounds' }).click();
  await page.getByRole('menuitem', { name: /^Intro/ }).click();
  await expect(props.getByLabel('Text on every screen')).toHaveValue('Welcome! Get ready to play.');
  await props.getByRole('button', { name: 'Scene actions' }).click();
  await props.getByRole('menuitem', { name: 'Replace scene type' }).click();
  const replacement = page.getByRole('dialog', { name: 'Replace scene type' });
  await replacement.getByRole('menuitem', { name: /^Scoreboard/ }).click();
  await replacement.getByRole('button', { name: 'Replace scene', exact: true }).click();
  await expect(props.getByRole('heading', { name: 'Results' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(props.getByLabel('Text on every screen')).toHaveValue('Welcome! Get ready to play.');
  await saved(page);

  await props.getByRole('button', { name: 'Scene actions' }).click();
  await props.getByRole('menuitem', { name: 'Change where it leads (Flow editor)' }).click();
  await expect(page.locator('.edge-line')).toHaveCount(2);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.keyboard.press('Shift+Digit3');
  const boxes = await page.locator('.scene-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON() as DOMRect));
  const top = Math.min(...boxes.map(box => box.top)) - 7;
  const bottom = Math.max(...boxes.map(box => box.bottom)) + 7;
  const left = Math.min(...boxes.map(box => box.left)) - 7;
  const right = Math.max(...boxes.map(box => box.right)) + 7;
  await page.keyboard.down('Control');
  try { await drag(page, { x: left, y: top }, { x: right, y: bottom }); } finally { await page.keyboard.up('Control'); }
  await expect(page.getByText('3 scenes selected')).toBeVisible();

  await card(page, /Welcome! Get ready to play/).dblclick();
  await page.getByRole('button', { name: 'Add after this' }).click();
  await page.getByRole('tab', { name: 'Games' }).click();
  await page.getByRole('menuitem', { name: /^Minigame(?! draw)/ }).click();
  await page.getByRole('menuitem', { name: /^Stop the clock/ }).click();
  const previewArea = page.getByRole('region', { name: 'Preview' });
  await expect(previewArea.locator('.minigame-preview')).toContainText('A clock starts counting');
  await previewArea.getByRole('button', { name: 'Phone', exact: true }).click();
  await expect(previewArea.locator('.phone-screen .minigame-preview-target')).toContainText('10 sec');
  await props.getByRole('button', { name: 'Try this scene' }).click();
  const popup = page.getByRole('dialog', { name: 'Preview' });
  await expect(popup.locator('.phone-screen .minigame-preview')).toBeVisible();
  await popup.getByRole('button', { name: 'Start practice' }).click();
  await popup.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(popup.getByRole('status')).toContainText('off');
  await popup.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('tab', { name: 'Look & feel' }).click();
  await page.getByLabel('Change the look of').click();
  await page.getByRole('option', { name: 'The whole game' }).click();
  await page.getByRole('group', { name: 'Style groups' }).getByRole('button', { name: 'Space & sea', exact: true }).click();
  await page.getByRole('button', { name: 'Neptune', exact: true }).click();
  await page.getByRole('group', { name: 'Show this moment' }).getByRole('button', { name: 'Question', exact: true }).click();
  const planetPreview = page.locator('.room-preview.motion-starlight').first();
  await expect(planetPreview).toBeVisible();
  await expect(planetPreview).toHaveCSS('--r-accent', '#91d8ff');
  await saved(page);

  await page.goto('/?admin=look');
  await page.getByRole('group', { name: 'Style groups' }).getByRole('button', { name: 'Space & sea', exact: true }).click();
  await page.getByRole('button', { name: 'Space', exact: true }).click();
  await expect(page.locator('.join-look-preview .room.motion-starlight')).toBeVisible();
});

test('the Flow editor moves, connects, adds and edits scenes, snapping everything into place, and saves', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The Flow editor is desktop first; phones are checked for not breaking only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Editor test ${Date.now()}`;
  await mine.getByRole('button', { name: 'New game', exact: true }).click();
  await mine.getByLabel('Name of your new game').fill(name);
  await chooseOption(mine.getByLabel('Start from'), { label: 'A copy of Friday Night Chaos' });
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
  await expect(page.getByRole('menu', { name: 'Add a scene' }).getByRole('menuitem', { name: /^Minigame(?! draw)/ })).toBeVisible();
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
  await page.locator('.scene-canvas').getByLabel('Text on every screen').fill('Thanks for playing!');
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
  await expect(props.getByRole('group', { name: 'Next', exact: true })).toHaveCount(0);
  await props.getByRole('button', { name: 'Scene actions' }).click();
  await page.getByRole('menuitem', { name: 'Change where it leads (Flow editor)' }).click();
  await expect(page.getByRole('tab', { name: 'Flow editor' })).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, /Choose your challenge/)).toContainText('Host decides');
  await expect(inspector.getByRole('heading', { name: 'Party choice' })).toBeVisible();
  await saved(page);
  await card(page, /^Standings$/).focus(); await page.keyboard.press('Enter');

  // The scene's actions are in the ☰ menu next to Close; deleting asks first.
  await inspector.getByRole('button', { name: 'Scene actions' }).click();
  await expect(page.getByRole('menu', { name: 'Scene actions' }).getByRole('menuitem')).toHaveText(['Start the game here', 'Duplicate', 'Save as prefab…', 'Replace scene type', 'Delete scene…']);
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
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Name of your new game').fill(name);
  await chooseOption(page.getByLabel('Start from'), { label: 'A copy of Friday Night Chaos' });
  await page.getByRole('button', { name: 'Create game' }).click();
  await page.getByRole('link', { name: `Edit ${name}` }).click();
  await expect(page.locator('.scene-card')).toHaveCount(5);
}

test('the categorized minigame picker stays above the editor dock on a short screen', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Exercises a short desktop viewport.');
  await page.setViewportSize({ width: 1100, height: 580 });
  await openCopy(page, baseURL!, 'Short-screen palette', false);
  await page.getByRole('button', { name: 'Add a scene', exact: true }).click();
  await page.getByRole('tab', { name: 'Games', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Minigame(?! draw)/ }).click();
  const categories = page.getByRole('tablist', { name: 'Minigame categories' });
  await expect(categories.getByRole('tab')).toHaveText(['Speed', 'Precision', 'Drawing', 'Luck & choices', 'Words', 'Drinking']);
  await categories.getByRole('tab', { name: 'Speed', exact: true }).press('ArrowRight');
  await expect(categories.getByRole('tab', { name: 'Precision', exact: true })).toBeFocused();
  await expect(page.getByRole('menuitem', { name: /^Count the Dots/ })).toBeVisible();
  const dock = page.getByRole('tablist', { name: 'Editor view' });
  const palette = page.locator('.add-menu-anchor .add-menu');
  await page.setViewportSize({ width: 580, height: 490 });
  await expect.poll(async () => {
    const bounds = (await palette.boundingBox())!;
    return bounds.y + bounds.height <= (await dock.boundingBox())!.y;
  }).toBe(true);
  await categories.getByRole('tab', { name: 'Drinking', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Drive the bus/ }).click();
  await expect(page.locator('.scene-card')).toHaveCount(6);
});

test('choices that need a description open a popup with cards: a duel’s game and an award', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Cards test ${Date.now()}`;
  await mine.getByRole('button', { name: 'New game', exact: true }).click();
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
  await expect(settings.getByLabel('Title of award 10')).toHaveAttribute('placeholder', 'Luckiest');
  // An award can have its own title; "best in one scene" asks which scene.
  await settings.getByLabel('Title of award 1', { exact: true }).fill('Champion of the night');
  await settings.getByRole('button', { name: 'Add an award…' }).click();
  await page.getByRole('dialog', { name: 'Add an award' }).getByRole('button', { name: /^Best in one scene/ }).click();
  await expect(settings.getByRole('combobox', { name: 'Scene of award 11' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Remove Champion of the night' })).toBeVisible();
  await saved(page);
});

test('open sections follow you from scene to scene, also past a scene that does not have them', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Sections test ${Date.now()}`;
  await mine.getByRole('button', { name: 'New game', exact: true }).click();
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
  await back(); await add('Games', /^Minigame(?! draw)/, /^Tap race/); await open();
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
  await mine.getByRole('button', { name: 'New game', exact: true }).click();
  await mine.getByLabel('Name of your new game').fill(name);
  await chooseOption(mine.getByLabel('Start from'), { label: 'A copy of Friday Night Chaos' });
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
  await expect(page.locator('.scene-props').getByLabel('Question or instruction')).toBeDisabled();
  await expect(page.locator('.scene-canvas').getByLabel('Question or instruction')).toHaveJSProperty('readOnly', true);
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
  await expect(help.getByRole('row').filter({ hasText: 'Undo (only your own' })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.help-panel').analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: /Help & shortcuts/ }).click();
  await expect(help).toBeVisible();
  await help.getByRole('button', { name: 'Close' }).click();
  const tips = page.getByRole('button', { name: 'Tips' });
  const tip = page.getByText(/the background to add a scene there/);
  await tips.hover();
  await expect(tip).toBeHidden();
  await tips.click();
  await expect(tip).toBeVisible();
  await tips.click();
  await expect(tip).toBeHidden();
  await tips.click();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await tips.click();
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
  await page.setViewportSize({ width: 390, height: 844 });
  await openCopy(page, baseURL!, `Phone ${Date.now()}`, false);
  // The whole top bar fits in the first quarter of the screen.
  expect((await page.locator('.editor-header').boundingBox())!.height).toBeLessThan(220);
  const tabs = page.getByRole('tablist', { name: 'Editor view' });
  const dock = (await tabs.boundingBox())!;
  expect(dock.x).toBeGreaterThanOrEqual(0);
  expect(dock.x + dock.width).toBeLessThanOrEqual(390);
  expect(dock.y + dock.height).toBeCloseTo(836, 0);
  const history = (await page.getByRole('button', { name: 'History', exact: true }).boundingBox())!;
  expect(history.y + history.height / 2).toBeCloseTo(dock.y + dock.height / 2, 0);
  expect(history.x + history.width).toBeLessThan(dock.x);
  await tabs.getByRole('tab', { name: 'Scene editor' }).click();
  await expect(tabs.getByRole('tab', { name: 'Scene editor' })).toHaveAttribute('aria-selected', 'true');
  const timeline = page.getByRole('navigation', { name: 'Scenes in play order' });
  const track = timeline.locator('.scene-track');
  const detail = page.locator('.scene-timeline-detail');
  const choice = track.getByRole('button', { name: /Choose your challenge/ });
  await expect(track).toHaveCSS('display', 'flex');
  expect(await track.evaluate(element => element.scrollWidth)).toBeGreaterThan((await track.boundingBox())!.width);
  if (test.info().project.name === 'android-chrome') {
    await choice.tap();
  } else {
    await choice.hover();
    await expect(detail).toContainText('Choose your challenge');
    await expect(choice).not.toHaveAttribute('aria-current', 'true');
    await track.getByRole('button', { name: /FRIDAY NIGHT/ }).press('Tab');
    await expect(choice).toBeFocused();
    await expect(detail).toContainText('Choose your challenge');
    await choice.press('Enter');
  }
  await expect(choice).toHaveAttribute('aria-current', 'true');
  await expect(detail).toContainText('Choose your challenge');
  expect((await timeline.boundingBox())!.height).toBeLessThan(86);
  await page.evaluate(() => window.scrollTo({ top: 280, behavior: 'instant' }));
  await expect.poll(async () => Math.round((await timeline.boundingBox())!.y)).toBe(0);
  const first = track.getByRole('button', { name: /FRIDAY NIGHT/ });
  if (test.info().project.name === 'android-chrome') await first.tap();
  else await first.click();
  await expect(first).toHaveAttribute('aria-current', 'true');
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await expect.poll(async () => Math.round((await timeline.boundingBox())!.y)).toBe(0);
  const add = timeline.getByRole('button', { name: 'Add after this' });
  await add.click();
  const palette = (await page.locator('.floating-menu').boundingBox())!;
  expect(palette.x).toBeGreaterThanOrEqual(0);
  expect(palette.x + palette.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  for (const width of [390, 820]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [button, menu] of [[/^Play & publish/, 'Play and publish'], [/^Game menu/, 'Game menu']] as const) {
      await page.locator('.editor-header').getByRole('button', { name: button }).click();
      const popup = page.locator('.editor-header').getByRole('menu', { name: menu });
      expect(await popup.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.left + 16, bounds.top + 10));
      })).toBe(true);
      await page.keyboard.press('Escape');
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await tabs.getByRole('tab', { name: 'Flow editor' }).click();
  await card(page, /Choose your challenge/).locator('.card-title').click();
  const panel = page.getByRole('complementary');
  const inView = async (locator: Locator) => { const box = (await locator.boundingBox())!; return box.y >= 0 && box.y + 40 <= 844 && box.x >= 0 && box.x + box.width <= 391; };
  expect(await inView(panel.getByRole('button', { name: 'Edit this scene →' }))).toBe(true);
  await panel.getByRole('button', { name: 'Close' }).click();
  const header = page.locator('.editor-header');
  const play = header.getByRole('button', { name: 'Play & publish' });
  const people = header.getByRole('button', { name: 'Everyone editing now' });
  const burger = header.getByRole('button', { name: /^Game menu/ });
  expect((await header.boundingBox())!.width).toBeLessThanOrEqual(390);
  expect((await play.boundingBox())!.width).toBe(40);
  expect((await people.boundingBox())!.y).toBeCloseTo((await play.boundingBox())!.y, 0);
  await play.click();
  expect(await inView(page.getByRole('menuitem', { name: 'Publish', exact: true }))).toBe(true);
  const menu = page.getByRole('menu', { name: 'Play and publish' });
  const headerBox = (await header.boundingBox())!;
  const headerBottom = headerBox.y + headerBox.height;
  const placement = (await menu.boundingBox())!.y;
  expect(placement).toBeGreaterThanOrEqual(headerBottom);
  expect(placement).toBeLessThanOrEqual(headerBottom + 5);
  await burger.click();
  const gameMenu = page.getByRole('menu', { name: 'Game menu' });
  expect((await gameMenu.boundingBox())!.y).toBeCloseTo(placement, 0);
  await people.click();
  await expect(page.getByRole('textbox', { name: 'Your name, as others editing this game see it' })).toBeVisible();
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

test('the editor header compacts on resize and the invite panel stays reachable', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The same editor is resized to phone width in this test.');
  await openCopy(page, baseURL!, `Invite layout ${Date.now()}`);
  const header = page.locator('.editor-header');
  const wideHeader = (await header.boundingBox())!;
  const dock = (await page.getByRole('tablist', { name: 'Editor view' }).boundingBox())!;
  const history = (await page.getByRole('button', { name: /^History/ }).boundingBox())!;
  const minimap = (await page.locator('.minimap').boundingBox())!;
  expect(dock.x).toBeGreaterThan(history.x + history.width);
  expect(dock.x + dock.width).toBeLessThan(minimap.x);
  expect(dock.y + dock.height).toBeCloseTo(history.y + history.height, 0);
  await page.setViewportSize({ width: 900, height: 450 });
  await expect(header).toHaveClass(/compact-header/);
  await expect(header.getByRole('button', { name: 'Play & publish' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  const title = page.getByLabel('Game name');
  const originalTitle = await title.inputValue();
  await title.fill('Temporary title');
  const gameMenu = page.getByRole('button', { name: /^Game menu/ });
  await gameMenu.click();
  await page.getByRole('menuitem', { name: 'Undo', exact: true }).click();
  await expect(title).toHaveValue(originalTitle);
  await gameMenu.click();
  await page.getByRole('menuitem', { name: 'Editing: switch to view only' }).click();
  await gameMenu.click();
  await page.getByRole('menuitem', { name: 'Viewing: switch to editing' }).click();
  await gameMenu.click();
  await page.getByRole('menuitem', { name: 'Invite people' }).click();
  const panel = page.getByRole('region', { name: 'Edit together' });
  const compactHeader = (await header.boundingBox())!;
  expect(compactHeader.height).toBeLessThanOrEqual(wideHeader.height);
  expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(compactHeader.y + compactHeader.height);
  const copy = panel.getByRole('button', { name: 'Copy', exact: true });
  await copy.click({ trial: true });
  await page.setViewportSize({ width: 390, height: 370 });
  await expect.poll(async () => {
    const mobile = (await panel.boundingBox())!;
    return mobile.y >= 0 && mobile.y + mobile.height <= 370;
  }).toBe(true);
  await copy.click({ trial: true });
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test('Game settings set the room\'s starting settings, saving only what differs from the standard', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await openCopy(page, baseURL!, `Room start ${Date.now()}`);
  const url = `${baseURL}/api/host/games/${new URL(page.url()).searchParams.get('edit')}`;
  const room = async () => (await (await page.request.get(url, { headers: { 'x-party-request': '1', origin: baseURL! } })).json()).data.definition.room;
  await page.getByRole('button', { name: /^Game menu/ }).click(); await page.getByRole('menuitem', { name: /^Game settings/ }).click();
  const section = page.getByRole('region', { name: 'Game settings' }).locator('details').filter({ has: page.getByText('Room settings', { exact: true }) });
  const summary = section.locator('summary').first();
  await expect(summary).toContainText('Standard');
  await summary.click();
  await section.getByLabel('Players see the scores during the game').uncheck();
  await section.getByLabel('Seconds to wait after the last answer').fill('8');
  await expect(summary).toContainText('Own starting values');
  await expect.poll(room).toEqual({ showScores: false, autoCloseSeconds: 8 });
  // Back to the standard: nothing is stored.
  await section.getByLabel('Players see the scores during the game').check();
  await section.getByLabel('Seconds to wait after the last answer').fill('3');
  await expect(summary).toContainText('Standard');
  await expect.poll(room).toBeUndefined();
});

test('editor menus close outside and Game settings warnings can fold away', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await openCopy(page, baseURL!, `Warnings ${Date.now()}`);
  const gameId = new URL(page.url()).searchParams.get('edit');
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const url = `${baseURL}/api/host/games/${gameId}`;
  const draft = (await (await page.request.get(url, { headers })).json()).data;
  const invalid = { ...draft.definition, finale: { stats: ['stats'] } };
  const response = await page.request.put(`${url}/draft`, { headers, data: { definition: invalid, expectedRevision: draft.revision } });
  expect(response.ok()).toBe(true);
  await page.reload();

  const siteMenu = page.getByRole('button', { name: 'Menu: go to another part of party' });
  await expect(siteMenu).toHaveText('p.');
  await expect(siteMenu.locator('.app-logo-caret')).toBeVisible();
  await siteMenu.click();
  const navigation = page.getByRole('navigation', { name: 'Go to' });
  await expect(navigation.getByRole('link', { name: 'Editor' })).toHaveAttribute('aria-current', 'page');
  await page.mouse.click(700, 400);
  await expect(navigation).toHaveCount(0);
  const gameMenu = page.getByRole('button', { name: /^Game menu/ });
  await gameMenu.click();
  await expect(gameMenu).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.click(700, 400);
  await expect(gameMenu).toHaveAttribute('aria-expanded', 'false');

  await gameMenu.click();
  await page.getByRole('menuitem', { name: /^Game settings/ }).click();
  const settings = page.getByRole('region', { name: 'Game settings' });
  const awards = settings.locator('details').filter({ has: page.getByText('End-of-game awards', { exact: true }) });
  const summary = awards.locator('summary').first();
  await expect(awards.getByRole('alert')).toBeVisible();
  await summary.click();
  await expect(awards.getByRole('alert')).toBeHidden();
  await expect(summary).toContainText('1 problem');
  await summary.press('Enter');
  await expect(awards.getByRole('alert')).toBeVisible();
  await page.mouse.click(700, 400);
  await expect(settings).toHaveCount(0);
  const problems = page.getByRole('button', { name: '1 problem', exact: true });
  await expect(problems.locator('.corner-label')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const history = page.getByRole('button', { name: 'History', exact: true });
  await expect(history.locator('.corner-label')).toHaveCSS('clip-path', 'inset(50%)');
  await expect(problems.locator('.corner-label')).toHaveCSS('clip-path', 'inset(50%)');
  await expect(history).toHaveCSS('width', '44px');
  await expect(problems).toHaveCSS('width', '44px');
  await problems.click();
  await expect(problems).toHaveAttribute('aria-expanded', 'true');
  const listBox = (await page.locator('.problems-list').boundingBox())!;
  expect(listBox.x + listBox.width).toBeLessThanOrEqual(390);
});

test('the Scene editor lists scenes in play order, previews them, and edits parts and game settings on the same draft', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await openCopy(page, baseURL!, `Scenes ${Date.now()}`);
  const dock = page.getByRole('tablist', { name: 'Editor view' });
  await dock.getByRole('tab', { name: 'Scene editor' }).click();
  const frame = (await page.locator('.scene-canvas .tv-screen').boundingBox())!;
  const pill = (await dock.boundingBox())!;
  expect(frame.y + frame.height).toBeLessThan(pill.y);
  for (const side of ['.scene-list', '.scene-props']) {
    const panel = (await page.locator(side).boundingBox())!;
    expect(panel.y + panel.height).toBeGreaterThan(pill.y + pill.height);
  }
  await page.setViewportSize({ width: 1020, height: 900 });
  const compactPill = (await dock.boundingBox())!;
  const sidebar = (await page.locator('.scene-props').boundingBox())!;
  expect(compactPill.x + compactPill.width).toBeLessThan(sidebar.x);
  // The narrow scene list never scrolls sideways: its header and titles fit or end in ….
  expect(await page.locator('.scene-list').evaluate(panel => panel.scrollWidth - panel.clientWidth)).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1440, height: 900 });
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
  await expect(page.locator('.tv-banner')).toHaveValue('FRIDAY NIGHT LIVE');
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
  const addAfter = list.getByRole('button', { name: 'Add after this' });
  await expect(addAfter).toHaveCSS('white-space', 'nowrap');
  await addAfter.click();
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
  await page.keyboard.press('Escape');
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
  const [practice] = await Promise.all([context.waitForEvent('page'), (async () => { await page.getByRole('button', { name: 'Play & publish' }).click(); await page.getByRole('menuitem', { name: 'Rehearse', exact: true }).click(); await page.getByRole('dialog', { name: 'Rehearse' }).getByRole('button', { name: 'Rehearse from the start' }).click(); })()]);
  await expect(practice.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ })).toBeVisible();
  await expect(practice.getByText(/^Copy source \d+ · waiting to start$/)).toBeVisible();
  await practice.close();
  await expect(page.locator('.crumb')).not.toContainText('published');
  // Rehearse from a scene that votes on nothing earlier: fine; the room starts there.
  await card(page, /Shared finale/).locator('.card-title').click();
  await page.getByRole('button', { name: 'Close' }).click().catch(() => undefined);
  await card(page, /Shared finale/).locator('.card-title').click();
  const [fromFinale] = await Promise.all([context.waitForEvent('page'), (async () => { await page.getByRole('button', { name: 'Play & publish' }).click(); await page.getByRole('menuitem', { name: 'Rehearse', exact: true }).click(); await page.getByRole('dialog', { name: 'Rehearse' }).getByRole('button', { name: 'Rehearse from the selected scene' }).click(); })()]);
  await expect(fromFinale.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ })).toBeVisible();
  await fromFinale.getByRole('button', { name: 'Start the game' }).click();
  await expect(fromFinale.getByRole('heading', { name: /^Shared finale/ })).toBeVisible();
  await fromFinale.close();
  // The canvas can show either device. Try this scene opens the current draft in a dialog.
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  await page.getByRole('navigation', { name: 'Scenes in play order' }).getByRole('button', { name: /Music Mayhem/ }).first().click();
  const canvas = page.locator('.scene-canvas');
  await expect(canvas.locator('.phone-screen')).toHaveCount(0);
  const scene = page.getByRole('region', { name: 'Preview' });
  const prompt = canvas.locator('.canvas-prompt');
  const originalPrompt = await prompt.inputValue();
  const initialHeight = (await prompt.boundingBox())!.height;
  await prompt.fill('More room for the question.\n'.repeat(5));
  expect((await prompt.boundingBox())!.height).toBeGreaterThan(initialHeight);
  await prompt.fill('More room for the question.\n'.repeat(40));
  expect(await prompt.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect((await prompt.boundingBox())!.height).toBeLessThanOrEqual(288);
  // Dragging the corner overrides the automatic height, both larger and smaller.
  const dragCorner = async (by: number) => {
    const box = (await prompt.boundingBox())!;
    await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3 + by, { steps: 5 });
    await page.mouse.up();
  };
  await dragCorner(120);
  expect((await prompt.boundingBox())!.height).toBeGreaterThan(330);
  await dragCorner(-260);
  const shrunk = (await prompt.boundingBox())!.height;
  expect(shrunk).toBeLessThan(150);
  expect((await prompt.locator('..').boundingBox())!.height).toBeLessThan(shrunk + 2);
  await prompt.fill('A live scene draft');
  await expect(page.locator('.scene-props textarea').first()).toHaveValue('A live scene draft');
  const answer = canvas.getByLabel('Answer option 1', { exact: true });
  const originalAnswer = await answer.inputValue();
  await answer.fill('A live answer edit');
  await expect(page.locator('.scene-props').getByLabel('Answer option 1', { exact: true })).toHaveValue('A live answer edit');
  const pages = context.pages().length;
  await scene.getByRole('button', { name: 'Phone', exact: true }).click();
  await expect(scene.locator('.phone-screen')).toContainText('A live scene draft');
  await expect(scene.locator('.phone-screen')).toContainText('A live answer edit');
  await expect(scene.locator('.tv-screen')).toHaveCount(0);
  await scene.getByRole('button', { name: 'Shared screen', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Preview' });
  const tryScene = page.getByRole('button', { name: 'Try this scene' });
  const sceneActions = page.getByRole('button', { name: 'Scene actions' });
  expect((await tryScene.boundingBox())!.height).toBe((await sceneActions.boundingBox())!.height);
  await tryScene.click();
  await expect(preview.locator('.tv-screen')).toContainText('A live scene draft');
  expect(context.pages()).toHaveLength(pages);
  await preview.getByRole('button', { name: 'Close' }).click();
  await prompt.fill(originalPrompt);
  await answer.fill(originalAnswer);
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
  await page.getByRole('region', { name: 'Your games' }).getByRole('button', { name: 'Import from text' }).click();
  const section = page.getByRole('dialog', { name: 'Import a game from text' });
  await section.getByRole('button', { name: 'Copy instructions for an AI' }).click();
  await expect(section.getByRole('button', { name: 'Instructions copied ✓' })).toBeVisible();
  const instructions = await page.evaluate(() => navigator.clipboard.readText());
  // The AI asks its questions first, then answers with only the game.
  expect(instructions).toContain('First, ask before you write.');
  expect(instructions).toContain('reply with ONLY one JSON object');
  expect(instructions).not.toContain('ai-instructions');
  expect(instructions).toContain('Configure minigame');
  const example = JSON.parse(/```json\s*([\s\S]*?)```/.exec(instructions)![1]!);
  expect(example.scenes).toEqual(expect.arrayContaining([
    expect.objectContaining({ game: 'count-the-dots', settings: expect.objectContaining({ revealEasing: 'ease-in' }) }),
    expect.objectContaining({ game: 'draw-the-graph', settings: expect.objectContaining({ revealEasing: 'ease-out' }) }),
  ]));
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
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  await page.getByRole('navigation', { name: 'Scenes in play order' }).getByRole('button', { name: /Finish the joke/ }).click();
  const timer = await page.getByRole('spinbutton', { name: /^Timer/ }).boundingBox();
  const longest = await page.getByRole('spinbutton', { name: /^Longest answer/ }).boundingBox();
  expect(timer?.x).toBeCloseTo(longest!.x);
  expect(timer?.width).toBeCloseTo(longest!.width);
});

test('right-clicking a scene or an arrow opens its own menu instead of the browser’s', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Right-click menus are for a mouse.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Menu test ${Date.now()}`;
  await mine.getByRole('button', { name: 'New game', exact: true }).click();
  await mine.getByLabel('Name of your new game').fill(name);
  await chooseOption(mine.getByLabel('Start from'), { label: 'A copy of Friday Night Chaos' });
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();
  await expect(page.locator('.scene-card')).toHaveCount(5);
  await fit(page);

  // One scene: its actions, Delete last; the right-clicked scene is selected; Escape closes and keeps focus on it.
  const finale = card(page, /Shared finale/);
  await finale.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Scene actions' });
  await expect(menu.getByRole('menuitem')).toHaveText([/Open scene/, /Start the game here/, /Duplicate/, /Copy/, /Replace scene type/, /Save as prefab/, /Delete scene/]);
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await expect(finale).toHaveClass(/selected/);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(finale).toBeFocused();
  // Duplicate from the menu adds a scene.
  await finale.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Duplicate/ }).click();
  await expect(page.locator('.scene-card')).toHaveCount(6);
  // Delete asks first.
  // (The copy sits on top of the original, a little offset.)
  await card(page, /Shared finale/).last().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Delete scene/ }).click();
  const ask = page.getByRole('alertdialog', { name: /^Delete “Shared finale/ });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: /Keep|Cancel/ }).click();
  await expect(ask).toHaveCount(0);

  // Several selected: the menu acts on all of them.
  await page.locator('.scene-card').nth(0).click(); await page.locator('.scene-card').nth(1).click({ modifiers: ['Shift'] });
  await page.locator('.scene-card').nth(1).click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Actions for 2 scenes' }).getByRole('menuitem', { name: /Duplicate 2 scenes/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // An arrow: add a scene on it, or remove it.
  const edges = await page.locator('.edge-line').count();
  const hit = page.locator('.edge-hit').first(); const box = (await hit.boundingBox())!;
  const point = await hit.evaluate(path => { const geometry = path as SVGPathElement; const at = geometry.getPointAtLength(geometry.getTotalLength() / 2); const matrix = geometry.getScreenCTM()!; return { x: at.x * matrix.a + matrix.e, y: at.y * matrix.d + matrix.f }; });
  expect(box.width + box.height).toBeGreaterThan(0);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const arrow = page.getByRole('menu', { name: 'Arrow actions' });
  await expect(arrow.getByRole('menuitem').first()).toHaveText(/Add a scene on this arrow/);
  await arrow.getByRole('menuitem', { name: /Remove this connection/ }).click();
  await expect(page.locator('.edge-line')).toHaveCount(edges - 1);
});
