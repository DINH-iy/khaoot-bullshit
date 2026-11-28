import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { chooseOption } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('two pictures can be positioned freely and the points box follows the scene scoring', async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const gameId = randomUUID();
  const imported = await page.request.post(`${baseURL}/api/host/games/import`, { headers, data: {
    gameId, text: JSON.stringify({ title: 'Gift wrap challenge', look: { theme: {
      background: 'solid', font: 'rounded',
      colors: { background: '#24493d', surface: '#24493d', text: '#fff5de', accent: '#ae3548', accentText: '#ffffff' },
    } }, scenes: [{ type: 'challenge', question: 'Gift wrap challenge!\n\nYou have 60 seconds. One hand each.', maxPoints: 8, places: [3, 2, 1] }] }),
  } });
  expect(imported.ok()).toBe(true);
  await page.goto(`${baseURL}/?edit=${gameId}`);
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  const canvas = page.locator('.scene-canvas');
  const side = page.locator('.scene-props');
  const addBox = side.getByRole('combobox', { name: 'Add text box' });
  await chooseOption(addBox, 'points');
  const pointsLine = canvas.getByRole('textbox', { name: 'Text box 1', exact: true });
  await expect(pointsLine).toHaveValue('1st: 3 points · 2nd: 2 points · 3rd: 1 point');
  await expect(pointsLine).toHaveAttribute('readonly', '');
  await side.locator('summary').filter({ has: page.getByText('Points', { exact: true }) }).click();
  await side.locator('.place-list input').first().fill('8');
  const awards = '1st: 8 points · 2nd: 2 points · 3rd: 1 point';
  await expect(pointsLine).toHaveValue(awards);
  await side.locator('summary').filter({ has: page.getByText('Intro before the round', { exact: true }) }).click();
  const intro = side.getByRole('checkbox', { name: 'Show an intro before the round' });
  await intro.check();
  const introPoints = side.getByRole('checkbox', { name: 'Show points in the intro', exact: true });
  await expect(introPoints).toBeChecked();
  await introPoints.uncheck();
  await expect(pointsLine).toHaveValue(awards);
  await intro.uncheck();

  const settings = side.getByRole('group', { name: 'Slide pictures' });
  const layer = canvas.locator('.scene-slide-images');
  const horizontal = settings.getByRole('spinbutton', { name: 'Horizontal position (%)' });
  const vertical = settings.getByRole('spinbutton', { name: 'Vertical position (%)' });
  const width = settings.getByRole('spinbutton', { name: 'Picture width (%)' });
  const rotation = settings.getByRole('spinbutton', { name: 'Rotation (degrees)' });

  const set = async (field: typeof horizontal, value: string) => { await field.fill(value); await field.press('Enter'); };
  const textSettings = side.locator('.canvas-text-controls');
  await set(textSettings.getByRole('spinbutton', { name: 'Horizontal position (%)' }), '50');
  await set(textSettings.getByRole('spinbutton', { name: 'Vertical position (%)' }), '36');
  await expect(pointsLine).toHaveValue(awards);
  for (const { name, background, paper } of [
    { name: 'Gold gift', background: '#f1c56b', paper: '#c14e39' },
    { name: 'Pink gift', background: '#ebb0aa', paper: '#764663' },
  ]) {
    const data = await page.evaluate(({ background, paper }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 210;
      const art = canvas.getContext('2d')!;
      art.fillStyle = background; art.fillRect(0, 0, 320, 210);
      art.fillStyle = '#fff4d2';
      for (const [x, y] of [[43, 50], [76, 150], [258, 47], [268, 144], [215, 171]]) {
        art.beginPath(); art.arc(x!, y!, 4, 0, Math.PI * 2); art.fill();
      }
      art.strokeStyle = paper; art.lineWidth = 6;
      for (const direction of [-1, 1]) {
        art.beginPath(); art.ellipse(160 + direction * 19, 65, 22, 11, direction * Math.PI / 5, 0, Math.PI * 2); art.stroke();
      }
      art.fillStyle = paper; art.fillRect(104, 83, 112, 81); art.fillRect(96, 81, 128, 17);
      art.fillStyle = '#f9e6b7'; art.fillRect(153, 81, 14, 83); art.fillRect(104, 113, 112, 9);
      return canvas.toDataURL().split(',')[1]!;
    }, { background, paper });
    await settings.getByRole('button', { name: 'Add picture' }).click();
    const library = page.getByRole('dialog', { name: 'Media library' });
    await library.locator('input[type=file]').setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
    await expect(library).toHaveCount(0);
    await settings.getByRole('textbox', { name: 'Picture description' }).fill(name);
    await set(horizontal, name === 'Gold gift' ? '23.5' : '70');
    await set(vertical, '72');
    await set(rotation, name === 'Gold gift' ? '-8' : '8');
  }

  const pictures = layer.locator('.scene-slide-image');
  await expect(pictures).toHaveCount(2);
  await expect(pictures.first()).toHaveCSS('translate', '-50% -50%');
  const second = pictures.last();
  const board = (await layer.boundingBox())!;
  const body = (await second.getByRole('button', { name: 'Move Picture 2' }).boundingBox())!;
  const x = body.x + body.width / 2;
  const y = body.y + body.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + board.width * .045, y + board.height * .03, { steps: 8 });
  await page.mouse.up();
  // Browser pointer coordinates round to pixels. The fields retain the result to a tenth of a percent.
  expect(Number(await horizontal.inputValue())).toBeCloseTo(74.5, 0);
  expect(Number(await vertical.inputValue())).toBeCloseTo(75, 0);
  await set(horizontal, '76.5');
  await set(vertical, '72.5');
  await set(width, '24.2');
  await second.getByRole('button', { name: 'Rotate Picture 2' }).press('ArrowRight');
  await expect(rotation).toHaveValue('9');
  await expect(second).toHaveAttribute('style', /left: 76.5%; top: 72.5%; width: 24.2%/);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('free-slide-pictures.png') });
  await settings.getByRole('button', { name: 'Send backward' }).click();
  await expect(pictures.first().locator('img')).toHaveAttribute('alt', 'Pink gift');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  await page.reload();
  await expect(pictures).toHaveCount(2);
  await expect(pointsLine).toHaveValue(awards);
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Play & publish' }).click();
  await page.getByRole('menuitem', { name: /Test bench: play it with virtual phones/ }).click();
  const bench = await popup;
  const host = bench.frameLocator('.bench-host');
  await expect(host.getByText(/Player 1 · connected/)).toBeVisible();
  await host.getByRole('button', { name: 'Start the game' }).click();
  for (const screen of [host, bench.frameLocator('iframe[title="Phone of Player 1"]')]) {
    const actual = screen.locator('.scene-slide-images .scene-slide-image');
    await expect(actual).toHaveCount(2);
    await expect(actual.first().locator('img')).toHaveAttribute('alt', 'Pink gift');
    await expect(actual.first()).toHaveAttribute('style', /left: 76.5%; top: 72.5%; width: 24.2%/);
    await expect(actual.first().locator('div')).toHaveCSS('rotate', '9deg');
    await expect(screen.locator('.scene-positioned-text-box p')).toHaveText(awards);
    await expect(screen.locator('.canvas-box-handle')).toHaveCount(0);
  }
  await host.locator('.stage-card').screenshot({ path: testInfo.outputPath('live-slide.png') });
});
