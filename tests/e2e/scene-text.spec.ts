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
  await chooseOption(addBox, 'points');
  const points = '1e plek: 3 punten · 2e plek: 2 punten · 3e plek: 1 punt';
  const box = canvas.getByRole('textbox', { name: 'Text box 1', exact: true });
  await expect(box).toHaveValue('1st: 3 points · 2nd: 2 points · 3rd: 1 point');
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
  const resizeHandle = selectedBox.getByRole('button', { name: /^Resize Text box/ });
  const step = await grid.evaluate(element => (element.getBoundingClientRect().width + parseFloat(getComputedStyle(element).columnGap)) / 12);
  const lineHeight = await selectedBox.locator('textarea').evaluate(element => parseFloat(getComputedStyle(element).lineHeight));
  const dragHandle = async (handle: typeof moveHandle, dx: number, dy: number) => {
    await expect(handle).toBeVisible();
    const button = (await handle.boundingBox())!;
    const x = button.x + button.width / 2;
    const y = button.y + button.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await expect(page.locator('.canvas-box-preview')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.canvas-box-preview')).toHaveCount(0);
  };
  await dragHandle(moveHandle, step, 0);
  await expect(settings.getByRole('combobox', { name: 'Start column', exact: true })).toHaveText('8');
  await expect(settings.getByRole('combobox', { name: 'Row', exact: true })).toHaveText('2');

  await dragHandle(resizeHandle, -step, 2 * lineHeight);
  await expect(settings.getByRole('combobox', { name: 'Box width' })).toHaveText('One quarter');
  await expect(settings.getByLabel('Height in lines')).toHaveValue('3');
  await moveHandle.press('ArrowLeft');
  await expect(settings.getByRole('combobox', { name: 'Start column', exact: true })).toHaveText('7');

  [first, second, third] = await getPositions();
  await dragHandle(moveHandle, 0, first!.y - third!.y);
  await expect(settings.getByRole('combobox', { name: 'Row', exact: true })).toHaveText('1');
  await expect(grid.locator('.scene-text-cell').first().locator('textarea')).toHaveValue('Start playing');
  const rotateHandle = selectedBox.getByRole('button', { name: /^Rotate Text box/ });
  const rotation = settings.getByRole('spinbutton', { name: 'Rotation (degrees)' });
  const handle = (await rotateHandle.boundingBox())!;
  const frame = (await selectedBox.boundingBox())!;
  const x = frame.x + frame.width / 2;
  const y = frame.y + frame.height / 2;
  const radius = y - handle.y - handle.height / 2;
  await page.mouse.move(handle.x + handle.width / 2, y - radius);
  await page.mouse.down();
  await page.mouse.move(x + radius / 2, y - radius * Math.sqrt(3) / 2, { steps: 8 });
  await expect(selectedBox).toHaveCSS('rotate', '30deg');
  await page.mouse.up();
  await expect(rotation).toHaveValue('30');
  await rotateHandle.press('ArrowLeft');
  await expect(rotation).toHaveValue('29');
  await chooseOption(settings.getByRole('combobox', { name: 'Row', exact: true }), '2');
  await expect(settings.getByRole('combobox', { name: 'Row', exact: true })).toHaveText('2');
  await expect(rotation).toHaveValue('29');
  await rotation.fill('12');
  await rotation.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('text-box-handles.png') });
  await chooseOption(arrange, '3');
  await expect(rotation).toHaveValue('12');

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
    await expect(live).toHaveText(['Warm up', 'Get ready']);
    await expect(frame.locator('.canvas-box-handle')).toHaveCount(0);
    await expect(live.first()).toHaveCSS('rotate', '15deg');
    const rowTops = await live.evaluateAll(cells => cells.map(cell => (cell as HTMLElement).offsetTop));
    expect(rowTops[0]).toBe(rowTops[1]);
  }

});
