import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { chooseOption, removeForkedStyles } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
const headers = (baseURL: string) => ({ 'x-party-request': '1', origin: baseURL });

async function openLook(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  expect((await page.request.post(`${baseURL}/api/host/games`, { headers: headers(baseURL), data: { gameId, title: 'Styled', startFrom: null } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?edit=${gameId}&view=look`);
  await chooseOption(page.getByLabel('Change the look of'), { label: 'The whole game' });
  const theme = async () => (await (await page.request.get(`${baseURL}/api/host/games/${gameId}`, { headers: headers(baseURL) })).json()).data.definition.presentation?.theme;
  return { theme };
}
/** Sets a look colour with the app's colour picker: open it from the colour, type the code, press Enter. */
async function setColour(page: Page, name: string, code: string) {
  await page.getByRole('button', { name: new RegExp(`^${name} #`) }).click();
  const picker = page.getByRole('dialog', { name });
  await picker.getByRole('button', { name: 'HEX', exact: true }).click();
  await picker.getByLabel('Hex code').fill(code);
  await picker.getByLabel('Hex code').press('Enter');
}
// The style list shows one group at a time.
const styleGroup = (page: Page, name: string) => page.getByRole('group', { name: 'Style groups' }).getByRole('button', { name, exact: true }).click();
const group = (page: Page, title: RegExp) => page.locator('.look-panel summary').filter({ has: page.locator('.ed-section-title', { hasText: title }) });

const savedStyle = async (page: Page, baseURL: string, name: string) => ((await (await page.request.get(`${baseURL}/api/host/styles`, { headers: headers(baseURL) })).json()).data as { name: string; theme: unknown }[]).find(style => style.name === name)?.theme;
/** The name of the style a change to a built-in one made, from the note under the styles. */
const forkedName = async (page: Page, builtIn: string) => {
  const note = page.getByRole('status').filter({ hasText: `made a new style: My ${builtIn}` });
  await expect(note).toBeVisible();
  return (await note.textContent())!.replace(/^.*made a new style: /, '').replace(/\.$/, '');
};

test('a built-in style is never changed: the first change makes a new style of yours, without asking, and it follows later changes', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-chrome', 'Look & feel is an editor task.');
  const { theme } = await openLook(page, baseURL!);
  await styleGroup(page, 'Everyday');
  await page.getByRole('button', { name: 'Pub quiz', exact: true }).click();
  // The reported steps: a style, its background colour, then the font.
  await group(page, /^Colours$/).click();
  await setColour(page, 'Background', '#336699');
  await expect(page.getByRole('dialog', { name: /^Change/ })).toHaveCount(0);
  const name = await forkedName(page, 'Pub quiz');
  await group(page, /^Text$/).click();
  await chooseOption(page.getByRole('combobox', { name: 'Font', exact: true }), 'mono');
  await expect.poll(theme).toEqual({ preset: 'pub', colors: { background: '#336699' }, font: 'mono' });
  // The new style keeps following, and the look is that style (shown under Yours, selected).
  await expect.poll(() => savedStyle(page, baseURL!, name)).toEqual({ preset: 'pub', colors: { background: '#336699' }, font: 'mono' });
  await expect(group(page, /^Style$/)).toContainText(name);
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await removeForkedStyles(page, baseURL!, 'Pub quiz');
});

test('changing your own style asks: update it or save the change as a new style; it can be deleted', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-chrome', 'Look & feel is an editor task.');
  const { theme } = await openLook(page, baseURL!);
  await styleGroup(page, 'Everyday');
  await page.getByRole('button', { name: 'Gala', exact: true }).click();
  await group(page, /^Text$/).click();
  await chooseOption(page.getByRole('combobox', { name: 'Font', exact: true }), 'mono');
  const name = await forkedName(page, 'Gala');
  const card = page.getByRole('button', { name, exact: true });
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(theme).toEqual({ preset: 'elegant', font: 'mono' });

  // Picking a built-in style and the saved one again brings its look back.
  await styleGroup(page, 'Everyday');
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  await styleGroup(page, 'Yours');
  await card.click();
  await expect.poll(theme).toEqual({ preset: 'elegant', font: 'mono' });

  // An own style asks first: update it, or keep it and save the change as a new style. Never only here.
  await chooseOption(page.getByRole('combobox', { name: 'Font', exact: true }), 'serif');
  const own = page.getByRole('dialog', { name: `Change “${name}”?` });
  await expect(own.getByRole('button', { name: 'Only change this look' })).toHaveCount(0);
  await own.getByRole('button', { name: `Update “${name}”` }).click();
  await expect.poll(() => savedStyle(page, baseURL!, name)).toEqual({ preset: 'elegant', font: 'serif' });
  // Asked once: later changes follow the style.
  await chooseOption(page.getByRole('combobox', { name: 'Font for titles', exact: true }), 'slab');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => savedStyle(page, baseURL!, name)).toEqual({ preset: 'elegant', font: 'serif', headingFont: 'slab' });

  await page.getByRole('button', { name: `Delete style ${name}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete style' }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(() => savedStyle(page, baseURL!, name)).toBeUndefined();
  // The game keeps its look.
  await expect.poll(theme).toEqual({ preset: 'elegant', font: 'serif', headingFont: 'slab' });
});

test('the current look can be saved as a new style', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-chrome', 'Look & feel is an editor task.');
  await openLook(page, baseURL!);
  const name = `Own ${randomUUID().slice(0, 6)}`;
  // The last tile of your own styles: same size as a style, with a dashed edge.
  await styleGroup(page, 'Yours');
  await expect(page.getByRole('button', { name: 'Save as new style' })).toHaveClass(/new-style-card/);
  // “This scene” is the preview shown first.
  await expect(page.getByRole('group', { name: 'Show this moment' }).getByRole('button', { name: 'This scene', exact: true })).toHaveAttribute('aria-pressed', 'true');
  if (process.env['DRAW_SHOTS']) await page.screenshot({ path: `${process.env['DRAW_SHOTS']}/look-and-feel.png` });
  await page.getByRole('button', { name: 'Save as new style' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as new style' });
  await dialog.getByLabel('Name of the style').fill(name);
  await dialog.getByRole('button', { name: 'Create new style' }).click();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  // Delete it again: the shared list stays tidy for the other tests.
  await page.getByRole('button', { name: `Delete style ${name}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete style' }).click();
});

test('the colour picker takes hex and rgba codes, and keeps see-through colours', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-chrome', 'Look & feel is an editor task.');
  const { theme } = await openLook(page, baseURL!);
  await group(page, /^Colours$/).click();
  // A pasted rgba() code in the hex field, and a short hex code, are both understood.
  await setColour(page, 'Cards and panels', 'rgba(51, 102, 153, 0.5)');
  await expect.poll(theme).toMatchObject({ colors: { surface: '#33669980' } });
  await expect(page.getByRole('button', { name: /^Cards and panels #/ })).toContainText('#33669980');
  // The RGBA view: one channel at a time; a value that is not a number is marked and not used.
  await page.getByRole('button', { name: /^Main buttons #/ }).click();
  const picker = page.getByRole('dialog', { name: 'Main buttons' });
  await picker.getByRole('button', { name: 'RGBA', exact: true }).click();
  await picker.getByLabel('Red').fill('lots');
  await picker.getByLabel('Red').press('Enter');
  await expect(picker.getByLabel('Red')).toHaveAttribute('aria-invalid', 'true');
  for (const [channel, value] of [['Red', '255'], ['Green', '0'], ['Blue', '0'], ['Opacity', '25']] as const) {
    await picker.getByRole('textbox', { name: channel }).fill(value);
    await picker.getByRole('textbox', { name: channel }).press('Enter');
  }
  await expect.poll(theme).toMatchObject({ colors: { accent: '#ff000040' } });
  // Escape closes the picker and returns to its colour.
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Main buttons #/ })).toBeFocused();
});
