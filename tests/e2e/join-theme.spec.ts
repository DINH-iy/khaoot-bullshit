import { expect, test } from '@playwright/test';

test('the join form waits for the saved site look on first load', async ({ page }) => {
  let release!: () => void;
  const loaded = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/site/look', async route => {
    await loaded;
    await route.fulfill({ json: { ok: true, data: { theme: { colors: { background: '#124c48' } } } } });
  });
  const request = page.waitForRequest('**/api/site/look');
  await page.goto('/');
  await request;
  try {
    await expect(page.locator('.join-startup')).toBeVisible();
    await expect(page.getByLabel('Room code', { exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByLabel('Room code', { exact: true })).toBeVisible();
  await expect(page.locator('.room-join')).toHaveAttribute('style', /--r-bg1: #124c48/);
});

test('an invite waits for its room look instead of painting the site look first', async ({ page }) => {
  let release!: () => void;
  const loaded = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/site/look', route => route.fulfill({ json: { ok: true, data: { theme: { colors: { background: '#452544' } } } } }));
  await page.route('**/api/rooms/look/ABC234', async route => {
    await loaded;
    await route.fulfill({ json: { ok: true, data: { title: 'Themed room', presentation: {
      texts: {}, animations: {}, themes: [{ colors: { background: '#173963' } }],
    } } } });
  });
  const request = page.waitForRequest('**/api/rooms/look/ABC234');
  await page.goto('/?code=ABC234');
  await request;
  try {
    await expect(page.locator('.join-startup')).toBeVisible();
    await expect(page.locator('.room-join')).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByText('Themed room', { exact: true })).toBeVisible();
  await expect(page.locator('.room-join')).toHaveAttribute('style', /--r-bg1: #173963/);
});
