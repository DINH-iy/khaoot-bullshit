import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import jsQR from 'jsqr';
import { createDatabase } from '../../apps/server/src/database/client.js';
import { provisionRehearsal } from '../../apps/server/src/rooms/rehearsal.js';

const url = process.env['DATABASE_URL'];
if (!url || !new URL(url).pathname.endsWith('_test') || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E test database required');
const db = createDatabase(url, 2);
test.afterAll(async () => { await db.close(); });

test('host and phone verify access, save privately, refresh and recover after a network interruption', async ({ browser, page, context, baseURL }) => {
  const f = await provisionRehearsal(db.client);
  const hostContext = await browser.newContext(); const host = await hostContext.newPage();
  try {
    await host.goto(`${baseURL}/?room=${f.sessionId}#access=${f.hostToken}`);
    await expect(host.getByRole('button', { name: 'Start test round' })).toBeVisible();
    await expect(host).not.toHaveURL(/access=/);
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
    await host.getByRole('button', { name: 'Start test round' }).click();
    await page.getByRole('radio', { name: 'Canberra', exact: true }).check();
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(page.getByText('Your answer is saved on the server.')).toBeVisible();
    const playerId = (await db.client.sessionPlayer.findFirstOrThrow({ where: { sessionId: f.sessionId } })).id;
    await page.reload();
    await expect(page.getByText('Your answer is saved on the server.')).toBeVisible();
    expect(await db.client.sessionPlayer.count({ where: { sessionId: f.sessionId } })).toBe(1);
    expect(await db.client.scoreEntry.count({ where: { sessionId: f.sessionId } })).toBe(1);
    const cookies = await context.cookies(); expect(cookies.filter(cookie => cookie.name.startsWith('party_')).every(cookie => cookie.httpOnly)).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('party_');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Reconnect and sync' }).click();
    await expect(page.getByRole('region', { name: 'Connection', exact: true }).getByRole('status', { name: 'Connection status' })).not.toHaveText('Connected');
    await context.setOffline(false);
    await expect(page.getByRole('region', { name: 'Connection', exact: true }).getByRole('status', { name: 'Connection status' })).toHaveText('Connected', { timeout: 20000 });
    await expect(page.getByText('Your answer is saved on the server.')).toBeVisible();
    expect((await db.client.sessionPlayer.findFirstOrThrow({ where: { sessionId: f.sessionId } })).id).toBe(playerId);
    expect(await db.client.scoreEntry.count({ where: { sessionId: f.sessionId } })).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await host.getByRole('button', { name: 'Revoke Phone player\'s access' }).click();
    await expect(page.getByRole('region', { name: 'Connection', exact: true }).getByRole('status', { name: 'Connection status' })).not.toHaveText('Connected');
    await page.reload();
    await expect(page.getByText('Room access denied. Your access may have expired or been revoked.')).toBeVisible();
  } finally { await hostContext.close(); }
});

test('display stays read-only without replacing host credentials in another tab', async ({ browser, baseURL }) => {
  const f = await provisionRehearsal(db.client); const context = await browser.newContext();
  try {
    const host = await context.newPage(); await host.goto(`${baseURL}/?room=${f.sessionId}#access=${f.hostToken}`);
    await host.getByRole('button', { name: 'Create display link' }).click();
    const href = await host.getByRole('link', { name: 'Open shared display' }).getAttribute('href'); expect(href).toBeTruthy();
    const display = await context.newPage(); await display.goto(href!);
    await expect(display.getByRole('heading', { name: `Room ${f.roomCode}` })).toBeVisible();
    await expect(display.getByRole('button', { name: 'Start test round' })).toHaveCount(0);
    await host.getByRole('button', { name: 'Reconnect and sync' }).click();
    await expect(host.getByRole('button', { name: 'Start test round' })).toBeVisible();
  } finally { await context.close(); }
});
