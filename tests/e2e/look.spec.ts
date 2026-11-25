import { chooseOption, removeForkedStyles } from './helpers.js';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
/** Sets a look colour with the app's colour picker: open it from the colour, type the code, press Enter. */
async function setColour(page: Page, name: string, code: string) {
  await page.getByRole('button', { name: new RegExp(`^${name} #`) }).click();
  const picker = page.getByRole('dialog', { name });
  await picker.getByRole('button', { name: 'HEX', exact: true }).click();
  await picker.getByLabel('Hex code').fill(code);
  await picker.getByLabel('Hex code').press('Enter');
  await picker.getByLabel('Hex code').press('Escape');
  await expect(picker).toHaveCount(0);
}
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the owner styles a game, rewrites its texts and picks animations, and phones show exactly that', async ({ page, baseURL, browser }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first; the phone side is checked below in a separate context.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const name = `Styled quiz ${Date.now()}`;
  const section = page.getByRole('region', { name: 'Import a game from text' });
  await section.getByLabel('Game text').fill(JSON.stringify({ title: name, scenes: [
    { id: 'q1', type: 'quiz', question: 'Capital of France?', answers: ['Paris', 'Lyon'], correct: 'Paris', seconds: 60 },
    { id: 'end', type: 'scoreboard', title: 'Final scores' },
  ] }));
  await section.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('tab', { name: 'Look & feel' }).click();
  await expect(page.getByRole('heading', { name: 'Look & feel', level: 2 })).toBeVisible();
  await settled(page); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A style, a colour and a readability warning.
  await page.getByRole('group', { name: 'Style groups' }).getByRole('button', { name: 'Bold', exact: true }).click();
  await page.getByRole('button', { name: 'Neon night', exact: true }).click();
  await page.getByRole('group', { name: 'Show this moment' }).getByRole('button', { name: 'Question', exact: true }).click();
  await expect(page.locator('.room-preview').first()).toHaveCSS('font-family', /Arial Narrow/);
  await page.getByRole('group', { name: 'Show this moment' }).getByRole('button', { name: 'Results', exact: true }).click();
  await expect(page.locator('.look-tv .round-results .result-answer')).toHaveText('Correct answer: Paris');
  await expect(page.locator('.look-phone .round-results .results-points-large')).toHaveText('+10');
  // The style page is in small groups; only Style starts open.
  await expect(page.getByRole('button', { name: /^Text on main buttons #/ })).toBeHidden();
  await page.locator('summary', { hasText: /^Colours/ }).click();
  await setColour(page, 'Text on main buttons', '#00f0ff');
  // A built-in style is never changed: the change makes a new style of yours, without asking.
  await expect(page.getByRole('dialog', { name: /^Change/ })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /made a new style: My Neon night/ })).toBeVisible();
  await removeForkedStyles(page, baseURL!, 'Neon night');
  await expect(page.getByText('Text on main buttons is hard to read')).toBeVisible();
  await setColour(page, 'Text on main buttons', '#001417');
  await expect(page.getByText('Text on main buttons is hard to read')).toHaveCount(0);

  // Own words, shown in the preview straight away.
  await page.getByRole('tab', { name: 'Texts' }).click();
  await page.getByLabel('Find a text').fill('answer is in');
  await page.getByLabel('Your answer is in!', { exact: true }).fill('Locked in, good luck!');
  // Without a search the texts are in closed groups; a search opens the groups with a match.
  await page.getByLabel('Find a text').fill('');
  await expect(page.getByLabel('Join a game', { exact: true })).toBeHidden();
  await page.locator('summary', { hasText: /^Joining/ }).click();
  await page.getByLabel('Join a game', { exact: true }).fill('Welcome to quiz night');
  await page.getByLabel('Find a text').fill('time} left');
  await page.getByLabel('{time} left', { exact: true }).fill('Hurry! {time}');
  await page.getByLabel('Find a text').fill('');
  await page.getByRole('button', { name: 'Answer saved', exact: true }).click();
  await expect(page.locator('.look-phone')).toContainText('Locked in, good luck!');

  // A ready-made animation and one built from blocks.
  await page.getByRole('tab', { name: 'Animations' }).click();
  // The long list scrolls inside its panel; the page itself never gets a scrollbar.
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
  await page.getByLabel('Animation for: A player’s answer is saved').click(); await page.getByRole('option', { name: 'Shake' }).click();
  const sceneMoment = page.getByRole('group', { name: 'A new scene or question appears' });
  await sceneMoment.getByRole('button', { name: 'Build your own' }).click();
  await sceneMoment.getByRole('button', { name: 'Add a step in between' }).click();
  await sceneMoment.getByLabel('Name').fill('Wiggle in');
  await sceneMoment.getByRole('button', { name: 'Use this animation' }).click();
  await expect(sceneMoment.getByLabel('Animation for: A new scene or question appears')).toHaveText('Wiggle in');
  await settled(page); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });

  // Only this scene: a different heading font for the quiz question.
  await page.getByRole('tab', { name: 'Colours & style' }).click();
  await page.getByLabel('Change the look of').click(); await page.getByRole('option', { name: 'Capital of France?' }).click();
  await page.locator('summary', { hasText: /^Text/ }).click();
  await page.getByLabel('Font for titles').click(); await page.getByRole('option', { name: 'Elegant' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });
  const exported = await (async () => { await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: 'Export as text' }).click(); return JSON.parse(await page.getByLabel('The game as text').inputValue()); })();
  expect(exported.presentation).toMatchObject({ theme: { preset: 'neon', colors: { accentText: '#001417' } }, texts: { 'answer.saved': 'Locked in, good luck!', 'join.title': 'Welcome to quiz night', 'timer.left': 'Hurry! {time}' },
    animations: { answerSaved: { preset: 'shake' }, sceneEnter: { name: 'Wiggle in', custom: { keyframes: expect.any(Array) } } } });
  expect(exported.nodes.find((node: { key: string }) => node.key === 'q1').stages[0].presentation).toEqual({ theme: { headingFont: 'elegant' } });

  // Close the exported text again: it lies over the top bar.
  await page.locator('.export-panel').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Play & publish' }).click(); await page.getByRole('menuitem', { name: 'Publish', exact: true }).click();
  await page.getByRole('button', { name: 'Play & publish' }).click(); await expect(page.getByRole('menuitem', { name: 'Play the published version ↗' })).toBeEnabled(); await page.keyboard.press('Escape');
  await page.goto(`${baseURL}/?host=1`);
  await page.getByRole('region', { name: 'Your games' }).getByRole('button', { name: `Open room for ${name}` }).click();
  const roomCode = (await page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await expect(page.locator('main.room')).toHaveCSS('--r-accent', '#00f0ff');

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' }); const phone = await phoneContext.newPage();
  try {
    await phone.goto(`${baseURL}/?code=${roomCode}`);
    await expect(phone.getByRole('heading', { name: 'Welcome to quiz night' })).toBeVisible();
    await expect(phone.getByText(name)).toBeVisible();
    await expect(phone.locator('main.room')).toHaveCSS('--r-accent', '#00f0ff');
    await phone.getByLabel('Your name').fill('Styled player');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expect(phone.getByRole('timer', { name: 'Time left' })).toHaveText(/^Hurry! 0:\d\d$/);
    await expect(phone.getByRole('heading', { name: 'Capital of France?' })).toHaveCSS('font-family', /Didot/);
    await phone.getByRole('radio', { name: 'Paris', exact: true }).check();
    await phone.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(phone.getByText('Locked in, good luck!')).toBeVisible();
    await settled(phone); expect((await new AxeBuilder({ page: phone }).analyze()).violations).toEqual([]);
  } finally { await phoneContext.close(); }
});

test('a colour palette from Canva, Figma or Coolors is imported, and the colours export for design tools', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${process.env['LOCAL_OWNER_TOKEN']}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Palette test ${Date.now()}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();
  await page.getByRole('tab', { name: 'Look & feel' }).click();
  // The MBO Utrecht style is one of the starting points.
  await page.getByRole('group', { name: 'Style groups' }).getByRole('button', { name: 'Brands', exact: true }).click();
  await page.getByRole('button', { name: /MBO Utrecht/ }).click();
  await page.locator('summary', { hasText: /^Colours/ }).click();
  await expect(page.getByRole('button', { name: 'Answer A colour', exact: true })).toHaveAttribute('title', '#F39200');

  await page.getByRole('button', { name: 'Import colours…' }).click();
  const importing = page.getByRole('dialog', { name: 'Import colours' });
  await importing.getByLabel('Colours').fill('https://coolors.co/264653-2a9d8f-e9c46a-f4a261-e76f51');
  await expect(importing.getByRole('status')).toContainText('Found 5 colours');
  // Measure the colours once the dialog has finished fading in.
  await settled(page);
  expect((await new AxeBuilder({ page }).include('.palette-dialog').analyze()).violations).toEqual([]);
  await importing.getByRole('button', { name: 'Use these colours' }).click();
  await expect(page.getByRole('status').filter({ hasText: /made a new style: My MBO Utrecht/ })).toBeVisible();
  await removeForkedStyles(page, baseURL!, 'MBO Utrecht');
  await expect(page.getByRole('button', { name: 'Answer A colour', exact: true })).toHaveAttribute('title', '#264653');
  await expect(page.getByRole('button', { name: 'Answer E colour', exact: true })).toHaveAttribute('title', '#E76F51');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Export colours…' }).click();
  const exporting = page.getByRole('dialog', { name: 'Export colours' });
  await expect(exporting.getByLabel('The hex codes')).toHaveValue(/^#264653\n#2a9d8f/);
  const [download] = await Promise.all([page.waitForEvent('download'), exporting.getByRole('button', { name: /Swatch file \(\.ase\)/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^palette-test-\d+-colours\.ase$/);
  await page.keyboard.press('Escape');
  await expect(exporting).toHaveCount(0);
});

test('answer marks can be numbers, square and after the answer, and answers never stick out of their tiles', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Desktop editor flow.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${process.env['LOCAL_OWNER_TOKEN']}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Marks test ${Date.now()}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await chooseOption(mine.getByLabel('Start from'), { label: 'A copy of Friday Night Chaos' });
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();
  await page.getByRole('tab', { name: 'Look & feel' }).click();
  await page.getByRole('button', { name: 'Question', exact: true }).click();
  const phoneTiles = page.locator('.look-phone .tile');
  await expect(phoneTiles.first().locator('.answer-mark')).toHaveText('A');
  await page.locator('summary', { hasText: /^Answer marks/ }).click();
  // Shapes are drawn as icons.
  await page.getByRole('group', { name: 'Marks', exact: true }).getByRole('button', { name: '★ ● ▲' }).click();
  await expect(phoneTiles.first().locator('.answer-mark svg.mark-icon')).toBeVisible();
  await page.getByRole('group', { name: 'Marks', exact: true }).getByRole('button', { name: '1 2 3' }).click();
  await page.getByRole('group', { name: 'Mark shape' }).getByRole('button', { name: 'Square', exact: true }).click();
  await page.getByRole('group', { name: 'Mark place' }).getByRole('button', { name: 'After the answer' }).click();
  await expect(phoneTiles.first().locator('.answer-mark')).toHaveText('1');
  await expect(page.locator('.look-tv .options-board li').nth(1).locator('.answer-mark')).toHaveText('2');
  await expect(page.locator('.look-phone .room')).toHaveClass(/marks-square/);
  await expect(page.locator('.look-phone .room')).toHaveClass(/marks-end/);
  await expect(phoneTiles.first().locator('.answer-mark')).toHaveCSS('border-radius', '0px');
  // Answers fit their tiles: side by side only when every word fits, never sticking out.
  expect(await phoneTiles.evaluateAll(tiles => tiles.filter(tile => tile.scrollWidth > tile.clientWidth + 1).length)).toBe(0);
  // Your own marks: typed in a field, repeating when there are more answers.
  await page.getByRole('group', { name: 'Marks', exact: true }).getByRole('button', { name: 'Your own' }).click();
  await page.getByLabel('Your marks, with spaces between them').fill('🎄 Nee');
  await expect(phoneTiles.nth(0).locator('.answer-mark')).toHaveText('🎄');
  await expect(phoneTiles.nth(1).locator('.answer-mark')).toHaveText('Nee');
  expect(await phoneTiles.evaluateAll(tiles => tiles.filter(tile => tile.scrollWidth > tile.clientWidth + 1).length)).toBe(0);
  await page.getByRole('group', { name: 'Marks', exact: true }).getByRole('button', { name: 'None' }).click();
  await expect(phoneTiles.first().locator('.answer-mark')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });
});

test("the clock timer's example stays small, and its own colours reach the clock", async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const section = page.getByRole('region', { name: 'Import a game from text' });
  await section.getByLabel('Game text').fill(JSON.stringify({ title: `Clock colours ${Date.now()}`, scenes: [
    { id: 'q1', type: 'quiz', question: 'Capital of France?', answers: ['Paris', 'Lyon'], correct: 'Paris', seconds: 60 },
  ] }));
  await section.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('tab', { name: 'Look & feel' }).click();
  const timer = page.locator('details.ed-section').filter({ has: page.locator('summary', { hasText: /^Timer/ }) });
  await timer.locator('summary').click();
  await timer.getByRole('button', { name: 'Shrinking clock' }).click();
  const sample = timer.getByRole('img', { name: 'Timer example' });
  // Reported: the example took a whole screen's height.
  expect((await sample.boundingBox())!.height).toBeLessThan(80);
  await timer.getByRole('button', { name: /^Time left Standard/ }).click();
  const picker = page.getByRole('dialog', { name: 'Time left' });
  await picker.getByRole('button', { name: 'HEX', exact: true }).click();
  await picker.getByLabel('Hex code').fill('#00ff00');
  await picker.getByLabel('Hex code').press('Enter');
  await picker.getByLabel('Hex code').press('Escape');
  await expect(sample.locator('.timer-clock-slice').first()).toHaveCSS('fill', 'rgb(0, 255, 0)');
  await timer.screenshot({ path: 'test-results/timer-colours.png' });
});

test('scenes with their own look are tagged, explained in the preview, and can follow the game again', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const section = page.getByRole('region', { name: 'Import a game from text' });
  await section.getByLabel('Game text').fill(JSON.stringify({ title: `Own looks ${Date.now()}`, scenes: [
    { id: 'hello', type: 'cutscene', text: 'Welcome!', look: { theme: { font: 'serif' } } },
    { id: 'q1', type: 'quiz', question: 'Capital of France?', answers: ['Paris', 'Lyon'], correct: 'Paris', seconds: 60, look: { theme: { font: 'mono' } } },
  ] }));
  await section.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('tab', { name: 'Look & feel' }).click();
  const controls = page.getByRole('complementary', { name: 'Look & feel' });
  await expect(controls.getByText('2 scenes have their own look.', { exact: false })).toBeVisible();
  // The preview shows the start scene, which has its own look: it says so, and that scene alone can follow the game.
  const banner = page.getByRole('note').filter({ hasText: 'This scene has its own look' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Use the game’s look' }).click();
  await expect(banner).toHaveCount(0);
  await expect(controls.getByText('1 scene has its own look.', { exact: false })).toBeVisible();
  // The list tags the scene that still has its own look.
  await controls.getByRole('combobox', { name: /Change the look of/ }).or(controls.getByLabel('Change the look of')).first().click();
  await expect(page.getByRole('option', { name: /Capital of France\? Own look/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Own look/ })).toHaveCount(1);
  await page.keyboard.press('Escape');
  // All at once, after asking.
  await controls.getByRole('button', { name: 'Use the game’s look everywhere' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Use the game’s look in every scene?' });
  await ask.getByRole('button', { name: 'Use the game’s look' }).click();
  await expect(controls.getByText(/own look/)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Every scene now follows the game’s look.' })).toBeVisible();
});
