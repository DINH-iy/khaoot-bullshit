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
  await mini.getByLabel('Text color', { exact: true }).fill('#e19a30');
  await expect(canvas.locator('.canvas-text-reading').getByText('1e', { exact: true })).toHaveCSS('font-style', 'italic');

  await page.screenshot({ path: testInfo.outputPath('editor-selection.png') });
  await sidebar.getByRole('button', { name: 'Format text', exact: true }).click();
  const format = sidebar.getByRole('group', { name: 'Format text', exact: true });
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
  await format.getByRole('button', { name: 'Move up', exact: true }).click();
  await expect(canvas.getByRole('textbox', { name: 'Text box 1', exact: true })).toHaveValue('Houd één hand achter je rug.');
  await sidebar.getByRole('button', { name: 'Format text', exact: true }).click();
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
      const boxes = surface.locator('.composition-copy > p');
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
