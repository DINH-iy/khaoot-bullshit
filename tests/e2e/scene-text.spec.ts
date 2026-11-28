import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { chooseOption, closeHostFold, openHostFold } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('slide text, blank lines and selected letters survive editing, publishing and results', async ({ browser, page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();

  const gameId = randomUUID();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const imported = await page.request.post(`${baseURL}/api/host/games/import`, { headers, data: {
    gameId, text: JSON.stringify({ title: 'Inpakchallenge', look: { theme: {
      background: 'solid', font: 'rounded',
      colors: { background: '#2b5544', surface: '#2b5544', text: '#f6f0df', accent: '#ae3548', accentText: '#ffffff' },
    } }, scenes: [
      { type: 'challenge', question: 'Inpakchallenge!', maxPoints: 3, places: [3, 2, 1] },
    ] }),
  } });
  expect(imported.ok()).toBe(true);
  await page.goto(`${baseURL}/?edit=${gameId}`);
  await page.getByRole('tab', { name: 'Scene editor' }).click();

  const prompt = 'Inpakchallenge!\n\n60 seconden, één hand per persoon.\nWie pakt het mooiste cadeau in?';
  const canvas = page.locator('.scene-canvas');
  const sidebar = page.locator('.scene-props');
  const addBox = sidebar.getByRole('combobox', { name: 'Add text box' });
  const field = canvas.locator('.canvas-prompt');
  await expect(canvas.getByText('Add text box', { exact: false })).toHaveCount(0);
  const slideTop = await canvas.locator('.tv-screen').boundingBox();
  const caption = await canvas.locator('figcaption').boundingBox();
  expect(slideTop!.y - caption!.y - caption!.height).toBeLessThan(16);
  await field.fill(prompt);
  await chooseOption(addBox, 'blank');
  const points = '1e plek: 3 punten · 2e plek: 2 punten · 3e plek: 1 punt';
  const box = canvas.getByRole('textbox', { name: 'Text box 1', exact: true });
  await box.fill(points);

  await box.press('Home');
  await box.press('Shift+ArrowRight');
  await box.press('Shift+ArrowRight');
  const mini = page.getByRole('group', { name: 'Format selected text' });
  await expect(mini).toBeVisible();
  const menuFrame = await mini.boundingBox();
  const fieldFrame = await box.boundingBox();
  expect(menuFrame!.height).toBeLessThan(65);
  expect(menuFrame!.y + menuFrame!.height).toBeLessThan(fieldFrame!.y + 4);
  await box.press('Shift+F10');
  await expect(mini).toBeVisible();
  await mini.getByRole('button', { name: 'Italic', exact: true }).click();
  await mini.getByRole('button', { name: 'Underline', exact: true }).click();
  await mini.getByRole('combobox', { name: 'Font', exact: true }).selectOption('mono');
  await mini.getByRole('button', { name: 'Text color', exact: true }).click();
  const colorPicker = page.getByRole('dialog', { name: 'Text color' });
  const hex = colorPicker.locator('.color-code input');
  await expect(colorPicker.getByRole('slider').first()).toBeVisible();
  await hex.fill('#e19a30');
  await hex.press('Enter');
  await page.screenshot({ path: testInfo.outputPath('built-in-color-picker.png') });
  await hex.press('Escape');
  await expect(colorPicker).toHaveCount(0);
  await expect(canvas.locator('.canvas-text-reading').getByText('1e', { exact: true })).toHaveCSS('font-style', 'italic');

  await page.screenshot({ path: testInfo.outputPath('editor-selection.png') });
  await sidebar.getByRole('button', { name: 'Box layout', exact: true }).click();
  const format = sidebar.getByRole('group', { name: 'Box layout', exact: true });
  await expect(format.getByRole('combobox', { name: 'Font', exact: true })).toHaveCount(0);
  await chooseOption(format.getByLabel('Text role'), 'small');
  await chooseOption(format.getByLabel('Horizontal alignment'), 'right');
  await expect(box).toHaveCSS('text-align', 'right');
  await chooseOption(format.getByLabel('Horizontal alignment'), 'left');
  await expect(box).toHaveCSS('text-align', 'left');
  await chooseOption(format.getByLabel('Horizontal alignment'), 'center');
  await chooseOption(format.getByLabel('Wrapping'), 'none');
  await expect(box).toHaveCSS('white-space', 'pre');
  await chooseOption(format.getByLabel('Wrapping'), 'word');
  await chooseOption(format.getByLabel('Overflow'), 'scroll');
  await format.getByLabel('Height in lines').fill('3');
  await format.getByLabel('Height in lines').press('Enter');
  const reading = canvas.locator('.canvas-text-reading');
  await chooseOption(format.getByLabel('Vertical alignment'), 'bottom');
  await expect(reading).toHaveCSS('align-content', 'safe end');
  await chooseOption(format.getByLabel('Vertical alignment'), 'middle');
  await expect(reading).toHaveCSS('align-content', 'safe center');
  await sidebar.evaluate(element => { element.scrollTop = 150; });
  await page.screenshot({ path: testInfo.outputPath('editor-settings.png') });

  await chooseOption(addBox, 'blank');
  await sidebar.getByRole('textbox', { name: 'Text box 2', exact: true }).fill('Houd één hand achter je rug.');
  await sidebar.getByRole('button', { name: 'Move up', exact: true }).click();
  await expect(canvas.getByRole('textbox', { name: 'Text box 1', exact: true })).toHaveValue('Houd één hand achter je rug.');
  await sidebar.getByRole('button', { name: 'Box layout', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('editor-slide.png') });
  const editorPromptStyle = await field.evaluate(element => {
    const style = getComputedStyle(element);
    return { font: style.fontFamily, weight: style.fontWeight, alignment: style.textAlign, wrapping: style.whiteSpace };
  });

  const game = (await (await page.request.get(`${baseURL}/api/host/games/${gameId}`, { headers })).json()).data;
  expect((await page.request.post(`${baseURL}/api/host/games/${gameId}/publish`, { headers, data: { expectedRevision: game.revision } })).ok()).toBe(true);
  const sessionId = randomUUID();
  expect((await page.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId, commandId: randomUUID() } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?room=${sessionId}`);
  const code = (await page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const phone = await phoneContext.newPage();
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill('Guest');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(page.getByText('Guest · connected')).toBeVisible();
    await page.getByRole('button', { name: 'Start the game' }).click();
    await openHostFold(page, 'Shared screen & invite');
    await page.getByRole('button', { name: 'Create display link' }).click();
    const href = await page.getByRole('link', { name: 'Open shared display' }).getAttribute('href');
    await closeHostFold(page);
    const display = await context.newPage();
    await display.goto(href!);

    for (const surface of [page, display, phone]) {
      const livePrompt = surface.locator('#stage-heading');
      await expect(livePrompt).toHaveJSProperty('textContent', prompt);
      await expect(livePrompt).toHaveCSS('font-family', editorPromptStyle.font);
      await expect(livePrompt).toHaveCSS('font-weight', editorPromptStyle.weight);
      await expect(livePrompt).toHaveCSS('text-align', editorPromptStyle.alignment);
      await expect(livePrompt).toHaveCSS('white-space', editorPromptStyle.wrapping);
      const boxes = surface.locator('.scene-text-grid p');
      await expect(boxes).toHaveText(['Houd één hand achter je rug.', points]);
      const livePoints = boxes.last();
      await expect(livePoints).toHaveCSS('text-align', 'center');
      await expect(livePoints).toHaveCSS('align-content', 'safe center');
      await expect(livePoints).toHaveCSS('white-space', 'pre-wrap');
      await expect(livePoints).toHaveCSS('overflow-wrap', 'normal');
      await expect(livePoints).toHaveCSS('overflow', 'auto');
      const marked = livePoints.getByText('1e', { exact: true });
      await expect(marked).toHaveCSS('font-style', 'italic');
      await expect(marked).toHaveCSS('font-family', 'ui-monospace, Menlo, Consolas, monospace');
      await expect(marked).toHaveCSS('color', 'rgb(225, 154, 48)');
      await expect(marked).toHaveCSS('text-decoration-line', 'underline');
      await expect(livePoints.locator('span').last()).toHaveCSS('font-style', 'normal');
      expect((await marked.boundingBox())!.y).toBeGreaterThan((await livePoints.boundingBox())!.y + 6);
    }
    await page.getByRole('button', { name: 'Close answers' }).click();
    await page.getByRole('button', { name: 'Reveal results' }).click();
    await expect(display.locator('.stage-card')).toContainText('Points this round');
    await expect(display.locator('#stage-heading')).toHaveJSProperty('textContent', prompt);
    await expect(display.locator('.scene-text-small')).toHaveText(points);
    await display.screenshot({ path: testInfo.outputPath('shared-screen.png') });
    await expect(phone.locator('.stage-card')).toContainText('No points for you this round.');
    await phone.screenshot({ path: testInfo.outputPath('phone.png') });
  } finally {
    await phoneContext.close();
  }
});

test('authors can place two or three text boxes in a row and delete a selected box', async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  expect((await page.request.post(`${baseURL}/api/host/games/import`, { headers, data: {
    gameId, text: JSON.stringify({ title: 'Three columns', scenes: [{
      type: 'cutscene', title: 'Showtime', text: 'Choose your station.',
      textBoxes: [{ key: 'one', text: 'Warm up' }, { key: 'two', text: 'Get ready' }, { key: 'three', text: 'Start playing' }],
    }] }),
  } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  const settings = page.locator('.scene-props');
  const layoutButton = settings.getByRole('button', { name: 'Box layout', exact: true });
  await layoutButton.click();
  const grid = page.locator('.scene-text-grid');
  const getPositions = () => grid.locator('.scene-text-cell').evaluateAll(divs => divs.map(div => {
    const { x, y, width } = div.getBoundingClientRect();
    return { x, y, width };
  }));
  const arrange = settings.getByRole('combobox', { name: 'Arrange all boxes' });
  await chooseOption(arrange, '2');
  let [first, second, third] = await getPositions();
  expect(second!.y).toBeCloseTo(first!.y);
  expect(second!.x).toBeGreaterThan(first!.x);
  expect(third!.y).toBeGreaterThan(first!.y);

  await chooseOption(arrange, '3');
  [first, second, third] = await getPositions();
  expect(third!.y).toBeCloseTo(second!.y);
  expect(third!.x).toBeGreaterThan(second!.x);
  expect(Math.abs(third!.width - first!.width)).toBeLessThan(1);
  await testInfo.attach('three-text-boxes', { body: await page.screenshot({ path: testInfo.outputPath('three-text-boxes.png') }), contentType: 'image/png' });

  await chooseOption(settings.getByLabel('Selected text box'), 'box:three');
  await settings.getByLabel('Start a new row').check();
  await chooseOption(settings.getByLabel('Start column'), '7');
  [first, second, third] = await getPositions();
  expect(third!.y).toBeGreaterThan(first!.y);
  expect(third!.x).toBeGreaterThan(second!.x);

  const selectedBox = page.locator('.canvas-box-frame[data-selected]');
  const moveHandle = selectedBox.getByRole('button', { name: /^Move Text box/ });
  const textSettings = settings.locator('.canvas-text-controls');
  const horizontal = textSettings.getByRole('spinbutton', { name: 'Horizontal position (%)' });
  const vertical = textSettings.getByRole('spinbutton', { name: 'Vertical position (%)' });
  const width = textSettings.getByRole('spinbutton', { name: 'Text box width (%)' });
  const rotation = textSettings.getByRole('spinbutton', { name: 'Rotation (degrees)' });
  const set = async (field: typeof horizontal, value: string) => { await field.fill(value); await field.press('Enter'); };
  const layer = page.locator('.scene-slide-text-layer');
  const board = (await layer.boundingBox())!;
  const frame = (await selectedBox.boundingBox())!;
  const dragHandle = async (handle: typeof moveHandle, dx: number, dy: number) => {
    await expect(handle).toBeVisible();
    const button = (await handle.boundingBox())!;
    const x = button.x + button.width / 2;
    const y = button.y + button.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
  };
  const dx = 27;
  const dy = 49;
  await dragHandle(moveHandle, dx, dy);
  const positioned = layer.locator('.scene-positioned-text-box');
  await expect(positioned.getByRole('textbox')).toHaveValue('Start playing');
  expect(Number(await horizontal.inputValue())).toBeCloseTo((frame.x + frame.width / 2 + dx - board.x) * 100 / board.width, 0);
  expect(Number(await vertical.inputValue())).toBeCloseTo((frame.y + frame.height / 2 + dy - board.y) * 100 / board.height, 0);
  await expect(grid.locator('.scene-text-cell')).toHaveCount(2);
  expect((await getPositions())[1]!.x).toBeCloseTo(second!.x);

  const previousWidth = Number(await width.inputValue());
  await dragHandle(selectedBox.getByRole('button', { name: /^Resize Text box/ }), -19, 0);
  expect(Number(await width.inputValue())).toBeCloseTo(previousWidth - 19 * 200 / board.width, 0);
  await set(horizontal, '68.2');
  await set(vertical, '72.6');
  await set(width, '32.5');
  await selectedBox.getByRole('button', { name: /^Rotate Text box/ }).press('Shift+ArrowRight');
  await expect(rotation).toHaveValue('15');
  await expect(positioned).toHaveAttribute('style', /left: 68.2%; top: 72.6%; width: 32.5%/);
  await expect(settings.getByRole('combobox', { name: 'Start column', exact: true })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await textSettings.locator('.slide-position-values').evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: testInfo.outputPath('freely-positioned-text.png') });

  await textSettings.getByRole('button', { name: 'Return to automatic layout' }).click();
  await expect(grid.locator('.scene-text-cell')).toHaveCount(3);
  await expect(settings.getByRole('combobox', { name: 'Start column', exact: true })).toHaveText('7');
  await chooseOption(arrange, '3');

  const devices = page.getByRole('group', { name: 'Preview device' });
  await devices.getByRole('button', { name: 'Phone', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Phone model' })).toBeVisible();
  [first, second] = await getPositions();
  expect(second!.y).toBeGreaterThan(first!.y);
  await settings.getByLabel('Keep columns on phones').check();
  [first, second] = await getPositions();
  expect(second!.y).toBeCloseTo(first!.y);
  await devices.getByRole('button', { name: 'Shared screen', exact: true }).click();

  await layoutButton.click();
  await settings.getByRole('button', { name: 'Remove text box', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: 'Remove text box', exact: true }).click();
  await expect(grid.locator('.scene-text-cell')).toHaveCount(2);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(grid.locator('.scene-text-cell')).toHaveCount(2);
  [first, second] = await getPositions();
  expect(second!.y).toBeCloseTo(first!.y);
  const firstBox = grid.locator('.canvas-box-frame').first();
  await firstBox.locator('textarea').click();
  await firstBox.getByRole('button', { name: /^Rotate Text box/ }).press('Shift+ArrowRight');
  await expect(firstBox).toHaveCSS('rotate', '15deg');
  // Entering an exact position also detaches a box from the automatic layout.
  await set(horizontal, '28.4');
  await set(vertical, '70.3');
  await set(width, '38.5');
  await expect(layer.locator('.scene-positioned-text-box')).toHaveAttribute('style', /left: 28.4%; top: 70.3%; width: 38.5%/);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  const pop = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Play & publish' }).click();
  await page.getByRole('menuitem', { name: /Test bench: play it with virtual phones/ }).click();
  const bench = await pop;
  const host = bench.frameLocator('.bench-host');
  await expect(host.getByText(/Player 1 · connected/)).toBeVisible();
  await host.getByRole('button', { name: 'Start the game' }).click();
  for (const frame of [host, bench.frameLocator('iframe[title="Phone of Player 1"]')]) {
    const live = frame.locator('.scene-text-cell');
    await expect(live).toHaveText('Get ready');
    const free = frame.locator('.scene-positioned-text-box');
    await expect(free).toHaveText('Warm up');
    await expect(free).toHaveAttribute('style', /left: 28.4%; top: 70.3%; width: 38.5%/);
    await expect(free.locator('p')).toHaveCSS('rotate', '15deg');
    await expect(frame.locator('.canvas-box-handle')).toHaveCount(0);
  }

});

test('the title and question can be positioned independently and keep their roles in play', async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  expect((await page.request.post(`${baseURL}/api/host/games/import`, { headers, data: {
    gameId, text: JSON.stringify({ title: 'Welcome and quiz', scenes: [
      { id: 'welcome', type: 'cutscene', title: 'Welcome!', text: 'Grab your phone.\n\nGet ready to play.', titleStyle: { color: '#ffcc55' } },
      { id: 'first-question', type: 'quiz', question: 'What day is it?', answers: ['Friday', 'Saturday'], correct: 'Friday', seconds: 30 },
    ] }),
  } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  const canvas = page.locator('.scene-canvas');
  const settings = page.locator('.canvas-text-controls');
  const selected = settings.getByLabel('Selected text box');
  const setNumber = async (name: string, value: string) => {
    const input = settings.getByRole('spinbutton', { name, exact: true });
    await input.fill(value);
    await input.press('Enter');
  };
  const place = async (x: string, y: string, width: string) => {
    await setNumber('Horizontal position (%)', x);
    await setNumber('Vertical position (%)', y);
    await setNumber('Text box width (%)', width);
  };
  const drag = async (name: string, dx: number, dy: number) => {
    const handle = canvas.getByRole('button', { name, exact: true });
    await expect(handle).toBeVisible();
    const { x, y, width, height } = (await handle.boundingBox())!;
    await page.mouse.move(x + width / 2, y + height / 2);
    await page.mouse.down();
    await page.mouse.move(x + width / 2 + dx, y + height / 2 + dy, { steps: 8 });
    await page.mouse.up();
  };

  await chooseOption(selected, 'titleStyle');
  await drag('Move Title', -43, 36);
  const title = canvas.locator('.scene-positioned-text-box').filter({ has: page.getByRole('textbox', { name: 'Title', exact: true }) });
  await expect(title.getByRole('textbox')).toHaveValue('Welcome!');
  await expect(settings.getByRole('spinbutton', { name: 'Horizontal position (%)' })).toHaveValue(/\d/);
  await place('28.5', '25.2', '45');
  await expect(title).toHaveAttribute('style', /left: 28.5%; top: 25.2%; width: 45%/);

  await chooseOption(selected, 'promptStyle');
  await drag('Move Text on every screen', 53, 88);
  const instruction = canvas.locator('.scene-positioned-text-box').filter({ has: page.getByRole('textbox', { name: 'Text on every screen', exact: true }) });
  await expect(instruction.getByRole('textbox')).toHaveValue('Grab your phone.\n\nGet ready to play.');
  await place('65.4', '59.8', '55');
  await expect(instruction).toHaveAttribute('style', /left: 65.4%; top: 59.8%; width: 55%/);
  await chooseOption(selected, 'titleStyle');
  await expect(settings.getByRole('spinbutton', { name: 'Horizontal position (%)' })).toHaveValue('28.5');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('movable-title-and-instruction.png') });

  await page.getByRole('navigation', { name: 'Scenes in play order' }).getByRole('button', { name: /What day is it/ }).click();
  await place('59.2', '44.7', '70.5');
  const question = canvas.locator('.scene-positioned-text-box').getByRole('textbox', { name: 'Question or instruction' });
  await expect(question).toHaveValue('What day is it?');
  await settings.getByRole('button', { name: 'Return to automatic layout' }).click();
  await expect(question).toHaveCount(0);
  await place('59.2', '44.7', '70.5');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Play & publish' }).click();
  await page.getByRole('menuitem', { name: /Test bench: play it with virtual phones/ }).click();
  const bench = await popup;
  const host = bench.frameLocator('.bench-host');
  const phone = bench.frameLocator('iframe[title="Phone of Player 1"]');
  await expect(host.getByText(/Player 1 · connected/)).toBeVisible();
  await host.getByRole('button', { name: 'Start the game' }).click();
  for (const screen of [host, phone]) {
    const heading = screen.locator('#stage-heading');
    await expect(heading).toHaveText('Welcome!');
    await expect(heading).toHaveCSS('color', 'rgb(255, 204, 85)');
    await expect(screen.locator('.scene-positioned-text-box')).toHaveCount(2);
    await expect(screen.locator('.scene-positioned-text-box').filter({ hasText: 'Get ready to play.' })).toHaveAttribute('style', /left: 65.4%; top: 59.8%; width: 55%/);
  }
  await host.getByRole('button', { name: 'Next', exact: true }).click();
  for (const screen of [host, phone]) {
    const heading = screen.locator('.scene-positioned-text-box #stage-heading');
    await expect(heading).toHaveText('What day is it?');
    await expect(screen.locator('#stage-heading')).toHaveCount(1);
    await expect(screen.locator('.scene-positioned-text-box')).toHaveAttribute('style', /left: 59.2%; top: 44.7%; width: 70.5%/);
  }
  await phone.locator('.answer-form label').filter({ hasText: 'Friday' }).click();
  await phone.getByRole('button', { name: 'Save answer', exact: true }).click();
  await expect(phone.getByRole('status').filter({ hasText: 'Your answer is in!' })).toBeVisible();
});

test('quiz answers move, resize and rotate independently on the slide while phones can submit', async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  expect((await page.request.post(`${baseURL}/api/host/games/import`, { headers, data: {
    gameId, text: JSON.stringify({ title: 'Planet quiz', scenes: [
      { type: 'quiz', question: 'Which planet has rings?', answers: [{ key: 'saturn', label: 'Planet Saturn' }, 'Mercury', 'Venus'], correct: 'saturn', seconds: 60 },
    ] }),
  } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  const canvas = page.locator('.scene-canvas');
  const settings = page.locator('.scene-props .answer-placement-settings');
  const picker = settings.getByRole('combobox', { name: 'Answer to position' });
  const x = settings.getByRole('spinbutton', { name: 'Horizontal position (%)' });
  const y = settings.getByRole('spinbutton', { name: 'Vertical position (%)' });
  const width = settings.getByRole('spinbutton', { name: 'Answer width (%)' });
  const height = settings.getByRole('spinbutton', { name: 'Minimum answer height (%)' });
  const rotation = settings.getByRole('spinbutton', { name: 'Rotation (degrees)' });
  const set = async (field: typeof x, value: string) => { await field.fill(value); await field.press('Enter'); };
  const drag = async (name: string, dx: number, dy: number) => {
    const handle = canvas.getByRole('button', { name, exact: true });
    await expect(handle).toBeVisible();
    const { x, y, width, height } = (await handle.boundingBox())!;
    await page.mouse.move(x + width / 2, y + height / 2);
    await page.mouse.down();
    await page.mouse.move(x + width / 2 + dx, y + height / 2 + dy, { steps: 8 });
    await page.mouse.up();
  };

  const first = canvas.locator('[data-canvas-answer-key="saturn"]');
  const neighbor = canvas.locator('[data-canvas-answer-key="mercury"]');
  const before = (await neighbor.boundingBox())!;
  await chooseOption(picker, 'saturn');
  await drag('Move answer 1', 31, 74);
  await expect(first).toHaveClass(/scene-positioned-answer/);
  const after = (await neighbor.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
  const oldWidth = Number(await width.inputValue());
  const oldHeight = Number(await height.inputValue());
  await drag('Resize answer 1', -23, 15);
  expect(Number(await width.inputValue())).toBeLessThan(oldWidth);
  expect(Number(await height.inputValue())).toBeGreaterThan(oldHeight);
  await set(x, '48.5');
  await set(y, '76.2');
  await set(width, '36.4');
  await set(height, '16.3');
  await expect(first).toHaveAttribute('style', /left: 48.5%; top: 76.2%; width: 36.4%; min-height: 16.3%/);

  const rotateFirst = canvas.getByRole('button', { name: 'Rotate answer 1' });
  const handle = (await rotateFirst.boundingBox())!;
  const card = (await first.boundingBox())!;
  const center = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
  const radius = center.y - (handle.y + handle.height / 2);
  const radians = 22 * Math.PI / 180;
  await page.mouse.move(handle.x + handle.width / 2, center.y - radius);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(center.x + Math.sin(radians) * radius, center.y - Math.cos(radians) * radius, { steps: 8 });
  await expect(first).toHaveCSS('rotate', '15deg');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(rotation).toHaveValue('15');
  await rotateFirst.press('ArrowRight');
  await expect(rotation).toHaveValue('16');
  await set(rotation, '7');
  await expect(first).toHaveCSS('rotate', '7deg');
  await drag('Resize answer 1', 16, 2);
  expect(Number(await width.inputValue())).toBeGreaterThan(36.4);
  expect(Number(await height.inputValue())).toBeCloseTo(16.3, 0);
  await set(width, '36.4');
  await set(height, '16.3');

  await chooseOption(picker, 'mercury');
  await canvas.getByRole('button', { name: 'Rotate answer 2' }).press('ArrowLeft');
  await expect(rotation).toHaveValue('-1');
  await set(rotation, '');
  await expect(neighbor).toHaveCSS('rotate', 'none');
  await set(x, '77.4');
  await set(y, '47.3');
  await set(width, '31.2');
  await set(height, '12.6');
  await expect(neighbor).toHaveAttribute('style', /left: 77.4%; top: 47.3%; width: 31.2%; min-height: 12.6%/);
  await expect(first).toHaveAttribute('style', /left: 48.5%; top: 76.2%; width: 36.4%; min-height: 16.3%/);
  await settings.getByRole('button', { name: 'Return answer to automatic layout' }).click();
  await expect(neighbor).not.toHaveClass(/scene-positioned-answer/);
  await set(x, '77.4');
  await set(y, '49.3');
  await set(width, '31.2');
  await set(height, '12.6');
  await set(rotation, '-9');
  await expect(neighbor).toHaveCSS('rotate', '-9deg');

  const answer = first.getByRole('textbox');
  await answer.press('End');
  for (const _ of 'Saturn') await answer.press('Shift+ArrowLeft');
  const toolbar = page.getByRole('group', { name: 'Format selected text' });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: 'Italic', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Underline', exact: true }).click();
  await toolbar.getByRole('combobox', { name: 'Font', exact: true }).selectOption('serif');
  await set(toolbar.getByRole('spinbutton', { name: 'Size (%)' }), '145');
  await toolbar.getByRole('button', { name: 'Text color', exact: true }).click();
  const hex = page.getByRole('dialog', { name: 'Text color' }).locator('.color-code input');
  await hex.fill('#f0c45c');
  await hex.press('Enter');
  await page.screenshot({ path: testInfo.outputPath('answer-color-picker.png') });
  await hex.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Text color' })).toHaveCount(0);
  await expect(toolbar).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('answer-word-formatting.png') });
  const shortHeight = await first.evaluate(element => element.offsetHeight);
  const sidebarAnswer = page.locator('.scene-props').getByRole('textbox', { name: 'Answer option 1', exact: true });
  await sidebarAnswer.click();
  await sidebarAnswer.evaluate(input => (input as HTMLInputElement).setSelectionRange(0, 0));
  await page.keyboard.insertText('Surrounded by rings of ice and rock, this is ');
  await expect(sidebarAnswer).toHaveValue('Surrounded by rings of ice and rock, this is Planet Saturn');
  await expect.poll(() => first.evaluate(element => element.offsetHeight)).toBeGreaterThan(shortHeight);
  await expect(first.locator('.canvas-text-reading').getByText('Saturn', { exact: true })).toHaveCSS('font-style', 'italic');

  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await settings.evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: testInfo.outputPath('freely-positioned-answers.png') });
  await page.reload();
  await expect(canvas.locator('.scene-positioned-answer')).toHaveCount(2);
  await expect(first).toHaveCSS('rotate', '7deg');
  await expect(neighbor).toHaveCSS('rotate', '-9deg');

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Play & publish' }).click();
  await page.getByRole('menuitem', { name: /Test bench: play it with virtual phones/ }).click();
  const bench = await popup;
  const host = bench.frameLocator('.bench-host');
  const phone = bench.frameLocator('iframe[title="Phone of Player 1"]');
  await expect(host.getByText(/Player 1 · connected/)).toBeVisible();
  await host.getByRole('button', { name: 'Start the game' }).click();
  const placed = host.locator('.scene-positioned-answer').filter({ hasText: 'Saturn' });
  await expect(placed).toHaveAttribute('style', /left: 48.5%; top: 76.2%; width: 36.4%; min-height: 16.3%/);
  await expect(placed).toHaveCSS('rotate', '7deg');
  const selectedWord = placed.locator('.answer-label').getByText('Saturn', { exact: true });
  await expect(selectedWord).toHaveCSS('font-style', 'italic');
  await expect(selectedWord).toHaveCSS('text-decoration-line', 'underline');
  await expect(selectedWord).toHaveCSS('color', 'rgb(240, 196, 92)');
  await expect(selectedWord).toHaveAttribute('style', /font-size: 145%/);
  const cardFit = await placed.evaluate(element => ({
    height: element.offsetHeight,
    minimum: element.parentElement!.clientHeight * 0.163,
    textHeight: element.querySelector<HTMLElement>('.answer-label')!.offsetHeight,
  }));
  expect(cardFit.height).toBeGreaterThan(cardFit.minimum);
  expect(cardFit.textHeight).toBeLessThan(cardFit.height);
  await expect(host.locator('.scene-positioned-answer').filter({ hasText: 'Mercury' })).toHaveCSS('rotate', '-9deg');
  await expect(host.locator('.scene-positioned-answer').filter({ hasText: 'Mercury' })).toHaveAttribute('style', /left: 77.4%; top: 49.3%; width: 31.2%; min-height: 12.6%/);
  await expect(host.locator('.canvas-box-handle')).toHaveCount(0);
  const automatic = host.locator('.with-positioned-answers li:visible').filter({ hasText: 'Venus' });
  const automaticBounds = (await automatic.boundingBox())!;
  const boardBounds = (await host.locator('.scene-slide-answers').boundingBox())!;
  expect(automaticBounds.y + automaticBounds.height).toBeLessThan(boardBounds.y + boardBounds.height * 0.762);
  await host.locator('.stage-card').screenshot({ path: testInfo.outputPath('live-answer-layout.png') });
  await expect(phone.locator('.answer-form label')).toHaveCount(3);
  await expect(phone.locator('.answer-form .answer-label').getByText('Saturn', { exact: true })).toHaveCSS('font-style', 'italic');
  await phone.locator('.answer-form label').filter({ hasText: 'Saturn' }).click();
  await phone.getByRole('button', { name: 'Save answer', exact: true }).click();
  await expect(phone.getByRole('status').filter({ hasText: 'Your answer is in!' })).toBeVisible();
});
