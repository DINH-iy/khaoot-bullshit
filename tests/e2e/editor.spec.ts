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
  await page.getByRole('button', { name: 'Fit' }).click();
  await page.getByRole('button', { name: 'Add a scene', exact: true }).click();
  await page.getByRole('menu', { name: 'Add a scene' }).getByRole('menuitem', { name: /^Scoreboard/ }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Fit' }).click();
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
  await page.getByRole('button', { name: 'Fit' }).click();
  const boardOut = await center(board.locator('.port-out'));
  // The bottom-left corner of the canvas is empty: cards are centred by Fit.
  const area = (await page.locator('.flow-canvas').boundingBox())!;
  await drag(page, boardOut, { x: area.x + 40, y: area.y + area.height - 40 });
  const menu = page.getByRole('menu', { name: 'Add a connected scene' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /^Cutscene or info/ }).click();
  await expect(page.locator('.edge-line')).toHaveCount(7);
  const inspector = page.getByRole('complementary');
  await inspector.getByLabel('Text on every screen').fill('Thanks for playing!');
  await expect(card(page, /Thanks for playing!/)).toBeVisible();
  await saved(page);

  // Tap-to-connect without dragging, and a circle is refused.
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Fit' }).click();
  const thanks = card(page, /Thanks for playing!/);
  await thanks.locator('.port-out').click();
  await expect(page.getByText('Now tap the scene to connect to.')).toBeVisible();
  await card(page, /Choose your challenge/).locator('.card-title').click();
  await expect(page.getByText('That would make the game go round in a circle.')).toBeVisible();
  await expect(page.locator('.edge-line')).toHaveCount(7);

  // Removing a connection, then putting it back with the keyboard-friendly "Next scene" list.
  await page.locator('.edge-hit').last().dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Remove connection' }).click();
  await expect(page.locator('.edge-line')).toHaveCount(6);
  await card(page, /^Standings$/).focus(); await page.keyboard.press('Enter');
  await inspector.getByLabel('Next scene').selectOption({ label: 'Thanks for playing!' });
  await expect(page.locator('.edge-line')).toHaveCount(7);
  await saved(page);

  // Tidy up, publish, and the published game matches the draft.
  await page.getByRole('button', { name: 'Tidy up' }).click();
  await saved(page);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Published as version 1.')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A reload restores the saved layout and connections.
  const before = await finale.evaluate(element => (element as HTMLElement).style.cssText);
  await page.reload();
  await expect(page.locator('.edge-line')).toHaveCount(7);
  expect(await card(page, /Shared finale/).evaluate(element => (element as HTMLElement).style.cssText)).toBe(before);
});

async function openCopy(page: Page, baseURL: string, name: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByLabel('Name of your new game').fill(name);
  await page.getByLabel('Start from').selectOption({ label: 'A copy of Friday Night Chaos' });
  await page.getByRole('button', { name: 'Create game' }).click();
  await page.getByRole('link', { name: `Edit ${name}` }).click();
  await expect(page.locator('.scene-card')).toHaveCount(5);
}

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

test('the Scene editor lists scenes in play order, previews them, and edits parts and game settings on the same draft', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await openCopy(page, baseURL!, `Scenes ${Date.now()}`);
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  const list = page.getByRole('navigation', { name: 'Scenes in play order' });
  await expect(list.locator('.scene-row')).toContainText(['FRIDAY NIGHT.', 'Choose your challenge!', /Music Mayhem/, /Living Sculpture/, /Shared finale/]);
  await expect(list.getByRole('button', { name: /Music route/ })).toBeVisible();
  // The opening scene has two parts: a cutscene and a warm-up question.
  await list.getByRole('button', { name: /FRIDAY NIGHT/ }).click();
  const props = page.getByRole('complementary', { name: 'Cutscene' });
  await expect(page.getByRole('tab', { name: /Part 2 · Quiz/ })).toBeVisible();
  await props.getByLabel('Title').fill('FRIDAY NIGHT LIVE');
  await expect(page.locator('.tv-banner')).toHaveText('FRIDAY NIGHT LIVE');
  // Add a scoreboard part, which becomes part 3, and see its preview.
  await props.getByRole('button', { name: 'Add a part' }).click();
  await props.getByRole('menuitem', { name: /^Scoreboard/ }).click();
  await expect(page.getByRole('tab', { name: /Part 3 · Results/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tv-scores')).toBeVisible();
  // Insert a quiz question right after the party choice's Music route scene.
  await list.getByRole('button', { name: /Music Mayhem/ }).click();
  await list.getByRole('button', { name: 'Add after this' }).click();
  await list.getByRole('menuitem', { name: /^Quiz question/ }).click();
  await expect(list.locator('.scene-row')).toHaveCount(6);
  // Game settings: give the game teams and make rounds team rounds by default.
  await page.getByText('Game settings: teams and default play').click();
  await page.getByLabel('This game has teams').check();
  await page.getByLabel('Rounds play, unless a round says otherwise').selectOption('teams');
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
  const [practice] = await Promise.all([context.waitForEvent('page'), (async () => { await page.getByRole('button', { name: 'Rehearse ▾' }).click(); await page.getByRole('menuitem', { name: 'From the start' }).click(); })()]);
  await expect(practice.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ })).toBeVisible();
  await expect(practice.getByText(/^Copy source \d+ · waiting to start$/)).toBeVisible();
  await practice.close();
  await expect(page.locator('.crumb')).not.toContainText('published');
  // Rehearse from a scene that votes on nothing earlier: fine; the room starts there.
  await card(page, /Shared finale/).locator('.card-title').click();
  await page.getByRole('button', { name: 'Close' }).click().catch(() => undefined);
  await card(page, /Shared finale/).locator('.card-title').click();
  const [fromFinale] = await Promise.all([context.waitForEvent('page'), (async () => { await page.getByRole('button', { name: 'Rehearse ▾' }).click(); await page.getByRole('menuitem', { name: 'From the selected scene' }).click(); })()]);
  await expect(fromFinale.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ })).toBeVisible();
  await fromFinale.getByRole('button', { name: 'Start the game' }).click();
  await expect(fromFinale.getByRole('heading', { name: /^Shared finale/ })).toBeVisible();
  await fromFinale.close();

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
  expect(instructions).toContain('Reply with ONLY one JSON object');
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
  await page.getByRole('button', { name: 'Export as text' }).click();
  const exported = await page.getByLabel('The game as text').inputValue();
  expect(JSON.parse(exported)).toMatchObject({ formatVersion: 2, nodes: expect.any(Array), edges: expect.any(Array), editor: { positions: expect.any(Object) } });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
