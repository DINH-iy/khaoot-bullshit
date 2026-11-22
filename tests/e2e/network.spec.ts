import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import jsQR from 'jsqr';
import { createDatabase } from '../../apps/server/src/database/client.js';
import { provisionRehearsal } from '../../apps/server/src/rooms/rehearsal.js';
import { preparedGame } from '../../apps/server/src/game/prepared-game.js';
import { closeHostFold, connectionStatus, openHostFold } from './helpers.js';

const url = process.env['DATABASE_URL'];
if (!url || !new URL(url).pathname.endsWith('_test') || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E test database required');
const db = createDatabase(url, 2);
test.afterAll(async () => { await db.close(); });

test('host and phone verify access, save privately, refresh and recover after a network interruption', async ({ browser, page, context, baseURL }) => {
  const f = await provisionRehearsal(db.client);
  const hostContext = await browser.newContext(); const host = await hostContext.newPage();
  try {
    await host.goto(`${baseURL}/?room=${f.sessionId}#access=${f.hostToken}`);
    await expect(host.getByRole('button', { name: 'Start the game' })).toBeVisible();
    await expect(host).not.toHaveURL(/access=/);
    await openHostFold(host, 'Room settings');
    await expect(host.getByRole('link', { name: 'Back to host menu' })).toHaveCount(0);
    await closeHostFold(host);
    const qr = host.getByRole('img', { name: `Scan to join room ${f.roomCode}` });
    await expect(qr).toBeVisible();
    const pixels = await qr.evaluate(async element => {
      const image = element as HTMLImageElement; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
    });
    expect(jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height)?.data).toBe(`${baseURL}/?code=${f.roomCode}`);
    await page.goto(`/?code=${f.roomCode}`);
    await page.getByLabel('Your name').fill('Phone player');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Room ${f.roomCode}` })).toBeVisible();
    await expect(host.getByText('Phone player · connected', { exact: false })).toBeVisible();
    await host.getByRole('button', { name: 'Start the game' }).click();
    await page.getByRole('radio', { name: 'Canberra', exact: true }).check();
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    const playerId = (await db.client.sessionPlayer.findFirstOrThrow({ where: { sessionId: f.sessionId } })).id;
    await page.reload();
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    expect(await db.client.sessionPlayer.count({ where: { sessionId: f.sessionId } })).toBe(1);
    expect(await db.client.scoreEntry.count({ where: { sessionId: f.sessionId } })).toBe(1);
    const cookies = await context.cookies(); expect(cookies.filter(cookie => cookie.name.startsWith('party_')).every(cookie => cookie.httpOnly)).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('party_');
    await context.setOffline(true);
    await connectionStatus(page);
    await page.getByRole('button', { name: 'Reconnect and sync' }).click();
    await expect(await connectionStatus(page)).not.toHaveText('Connected');
    await context.setOffline(false);
    await expect(await connectionStatus(page)).toHaveText('Connected', { timeout: 20000 });
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    expect((await db.client.sessionPlayer.findFirstOrThrow({ where: { sessionId: f.sessionId } })).id).toBe(playerId);
    expect(await db.client.scoreEntry.count({ where: { sessionId: f.sessionId } })).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await openHostFold(host, 'Players');
    await host.getByRole('button', { name: 'Revoke access for Phone player' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('.room-join .join-card')).toBeVisible();
  } finally { await hostContext.close(); }
});

test('display stays read-only without replacing host credentials in another tab', async ({ browser, baseURL }) => {
  const f = await provisionRehearsal(db.client); const context = await browser.newContext();
  try {
    const host = await context.newPage(); await host.goto(`${baseURL}/?room=${f.sessionId}#access=${f.hostToken}`);
    await openHostFold(host, 'Shared screen');
    await host.getByRole('button', { name: 'Create display link' }).click();
    const href = await host.getByRole('link', { name: 'Open shared display' }).getAttribute('href'); expect(href).toBeTruthy();
    await closeHostFold(host);
    const display = await context.newPage(); await display.goto(href!);
    await expect(display.getByRole('heading', { name: `Room ${f.roomCode}` })).toBeVisible();
    await expect(display.getByRole('button', { name: 'Start the game' })).toHaveCount(0);
    await connectionStatus(host);
    await host.getByRole('button', { name: 'Reconnect and sync' }).click();
    await expect(host.getByRole('button', { name: 'Start the game' })).toBeVisible();
  } finally { await context.close(); }
});

test('the join form keeps the code readable and capped, and says what is missing', async ({ page }) => {
  const f = await provisionRehearsal(db.client);
  await page.goto('/');
  const code = page.getByLabel('Room code');
  // Lower case, spaces and a paste that is too long all become the code itself, shown as ABC-123.
  await code.pressSequentially(`${f.roomCode.slice(0, 2).toLowerCase()} ${f.roomCode.slice(2)}XYZ`);
  await expect(code).toHaveValue(`${f.roomCode.slice(0, 3)}-${f.roomCode.slice(3)}`);
  await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(page.getByText('Type a name so the others know who you are.')).toBeVisible();
  await expect(page.getByLabel('Your name')).toBeFocused();
  await page.getByLabel('Your name').fill('Dash tester');
  await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Room ${f.roomCode}` })).toBeVisible();
});

test('the room header keeps the full logo and puts the connection button at the right on narrow screens', async ({ page }) => {
  const title = 'MBO Utrecht: De Ultieme Schoolbattle MetEenExtraLangWoordVoorDeLaatsteRonde';
  const f = await provisionRehearsal(db.client, { ...preparedGame, title, presentation: { theme: { preset: 'mbou' } } });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/?code=${f.roomCode}`);
  await page.getByLabel('Your name').fill('Phone player');
  await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Room ${f.roomCode}` })).toBeVisible();

  const bar = page.locator('.session-bar');
  await expect(bar.locator('.room-game')).toContainText(title);
  const positions = await bar.evaluate(element => {
    const brand = element.querySelector('.brand')!;
    const range = document.createRange();
    range.selectNodeContents(brand);
    const logo = brand.getBoundingClientRect();
    const title = element.querySelector('.room-game')!.getBoundingClientRect();
    const connection = element.querySelector('.room-connection button')!.getBoundingClientRect();
    const rightEdge = element.getBoundingClientRect().right - parseFloat(getComputedStyle(element).paddingRight);
    return {
      logoLines: new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size,
      fitsBetween: logo.right <= title.left && title.right <= connection.left,
      sameRow: Math.abs(logo.y + logo.height / 2 - connection.y - connection.height / 2) < 1,
      rightOffset: Math.abs(rightEdge - connection.right),
    };
  });
  expect(positions).toEqual({ logoLines: 1, fitsBetween: true, sameRow: true, rightOffset: 0 });
  await bar.getByRole('button').click();
  await expect(bar.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
