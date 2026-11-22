import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { chooseOption, closeHostFold, closeRoundsByHand, openHostFold } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
const fixture = fileURLToPath(new URL('./fixtures/Tiny5.woff2', import.meta.url));
test.use({ actionTimeout: 10000 });

test('an uploaded font reaches every room screen and a scene can override the game font', async ({ page: host, browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-chrome', 'The editor and three room views are exercised together.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'Font night', startFrom: null } })).json()).data;
  const definition = { formatVersion: 2, title: 'Font night', startNodeKey: 'intro', edges: [],
    nodes: [{ key: 'intro', stages: [{ key: 'main', kind: 'info', title: 'A new typeface', prompt: 'Welcome to font night.', durationMs: null }] }] };
  expect((await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?edit=${gameId}&view=look`);
  await chooseOption(host.getByLabel('Change the look of'), { label: 'The whole game' });
  await host.locator('.look-panel summary').filter({ has: host.locator('.ed-section-title', { hasText: /^Text$/ }) }).click();
  await host.getByLabel('Google Fonts link').fill('https://example.com/fonts/Inter');
  await host.getByRole('button', { name: 'Import font' }).click();
  await expect(host.getByRole('alert').filter({ hasText: 'Google Fonts link for one font family' })).toBeVisible();
  await host.getByLabel('Upload font', { exact: true }).setInputFiles(fixture);
  await expect(host.getByRole('status').filter({ hasText: 'Tiny5 is ready' })).toBeVisible();
  const fonts = (await (await host.request.get(`${baseURL}/api/host/fonts`, { headers })).json()).data as { id: string; name: string }[];
  const asset = fonts.find(font => font.name === 'Tiny5')!;
  const textFont = host.getByRole('combobox', { name: 'Font', exact: true });
  const titleFont = host.getByRole('combobox', { name: 'Font for titles', exact: true });
  await chooseOption(textFont, { label: 'Tiny5' });
  await chooseOption(titleFont, { label: 'Tiny5' });
  const family = `party-font-${asset.id}`;

  await chooseOption(host.getByLabel('Change the look of'), 'intro|0');
  await expect(textFont).toContainText('Inherited · Tiny5');
  await expect(titleFont).toContainText('Inherited · Tiny5');
  await chooseOption(textFont, 'serif');
  await chooseOption(textFont, 'inherit');
  await expect(textFont).toContainText('Inherited · Tiny5');
  await chooseOption(textFont, 'serif');
  const getDraft = async () => (await (await host.request.get(`${games}/${gameId}`, { headers })).json()).data;
  await expect.poll(async () => (await getDraft()).definition).toMatchObject({
    presentation: { theme: { font: asset, headingFont: asset } },
    nodes: [{ stages: [{ presentation: { theme: { font: 'serif' } } }] }],
  });

  const saved = await getDraft();
  expect((await host.request.post(`${games}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);
  await openHostFold(host, 'Shared screen');
  await host.getByRole('button', { name: 'Create display link' }).click();
  const href = (await host.getByRole('link', { name: 'Open shared display' }).getAttribute('href'))!;
  await closeHostFold(host);
  const display = await host.context().newPage();
  const phone = await browser.newPage({ viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true });
  const loaded = (page: Page) => page.evaluate(name => [...document.fonts].some(face => face.family === name && face.status === 'loaded'), family);
  try {
    await display.goto(href);
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill('Ada');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(phone.getByRole('button', { name: /^Menu/ })).toBeVisible();
    for (const screen of [host, display, phone]) {
      await expect.poll(() => loaded(screen)).toBe(true);
      await expect(screen.locator('main.room')).toHaveCSS('--r-font', new RegExp(family));
    }
    await host.getByRole('button', { name: 'Start the game' }).click();
    for (const screen of [host, display, phone]) {
      await expect(screen.locator('main.room')).toHaveCSS('--r-font', /Georgia/);
      await expect(screen.locator('main.room')).toHaveCSS('--r-heading-font', new RegExp(family));
    }
  } finally {
    await Promise.all([display.close(), phone.close()]);
  }
});
