import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { join } from 'node:path';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('a phone sends its log by itself when the server fails, without what was typed; the owner reads it in Admin', async ({ browser, page, baseURL }) => {
  const secretName = `Secret Sam ${test.info().project.name}`;
  // The server fails to join anyone, as an internal error would.
  await page.route('**/api/rooms/join', route => route.fulfill({ status: 500, contentType: 'application/json', headers: { 'x-request-id': '0f0f0f0f-0000-4000-8000-000000000000' }, body: JSON.stringify({ ok: false, error: { code: 'GAME_UNAVAILABLE' } }) }));
  await page.goto('/?code=ZZZ999');
  await page.getByLabel('Your name').fill(secretName);
  const sent = page.waitForRequest(request => request.url().endsWith('/api/diagnostics') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Join room', exact: true }).click();

  // The player only sees the usual message; the log goes to the server a few seconds later.
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('GAME_UNAVAILABLE')).toHaveCount(0);
  const request = await sent; const body = request.postDataJSON() as { id: string; reason: string; summary: string; events: { kind: string; what: string; code?: string; requestId?: string }[] };
  expect(body.reason).toBe('problem');
  expect(body.summary).toContain('GAME_UNAVAILABLE');
  expect(body.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'tap', what: 'Join room (button)' }),
    expect.objectContaining({ kind: 'request', what: 'POST /api/rooms/join', code: 'GAME_UNAVAILABLE', requestId: '0f0f0f0f-0000-4000-8000-000000000000' }),
  ]));
  expect(request.postData()).not.toContain('Secret Sam');

  const ownerContext = await browser.newContext(); const owner = await ownerContext.newPage();
  try {
    expect((await owner.request.post(`${baseURL}/api/host/claim`, { headers: { origin: baseURL!, 'x-party-request': '1' }, data: { token: ownerToken } })).ok()).toBe(true);
    if (process.env['ADMIN_SCREENSHOTS']) await owner.emulateMedia({ colorScheme: 'dark' });
    await owner.goto(`${baseURL}/?admin=logs`);
    await expect(owner.getByRole('heading', { name: 'Device logs', level: 1 })).toBeVisible();
    await owner.getByRole('searchbox', { name: 'Search' }).fill('0f0f0f0f');
    const item = owner.locator('.admin-item').first();
    await expect(item).toContainText('GAME_UNAVAILABLE');
    await item.getByRole('button', { name: 'Show' }).click();
    const timeline = item.getByRole('table', { name: /What happened on the device/ });
    await expect(timeline.getByRole('row').filter({ hasText: 'POST /api/rooms/join' }).first()).toHaveClass(/log-bad/);
    await expect(timeline).not.toContainText('Secret Sam');
    for (const width of [1320, 390]) {
      await owner.setViewportSize({ width, height: 960 });
      for (const name of ['Refresh', 'Hide', 'Copy as text']) {
        const button = owner.getByRole('button', { name, exact: true }).first();
        await expect(button).toBeVisible();
        expect((await button.boundingBox())!.height).toBe(44);
        expect((await button.locator('svg').boundingBox())!.width).toBeLessThanOrEqual(16);
      }
      expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (process.env['ADMIN_SCREENSHOTS']) await owner.screenshot({ path: join(process.env['ADMIN_SCREENSHOTS'], `device-logs-${width}.png`), fullPage: true });
    }
    expect((await new AxeBuilder({ page: owner }).analyze()).violations).toEqual([]);
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await ownerContext.close(); }
});
