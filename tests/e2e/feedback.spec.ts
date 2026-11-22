import { chooseOption } from './helpers.js';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('a tester points at a button and reports it; the owner finds it with its file in the admin menu', async ({ browser, page, baseURL }) => {
  // Both browser projects share one database: each sends its own report.
  const title = `Join button feels slow (${test.info().project.name})`;
  if (test.info().project.name === 'android-chrome') await page.setViewportSize({ width: 320, height: 670 });
  await page.goto('/');
  await page.getByText('More options', { exact: true }).click();
  await expect(page.getByRole('link', { name: /Arcade/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText('More options', { exact: true }).click();
  await page.getByRole('button', { name: 'Feedback' }).click();
  const panel = page.getByRole('dialog', { name: 'Feedback' });
  await expect(panel).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.feedback-panel').analyze()).violations).toEqual([]);
  await panel.getByRole('radio', { name: 'Something is broken' }).check();
  await panel.getByLabel('What went wrong?').fill(title);
  await panel.getByLabel(/Tell us more/).fill('Took a while after tapping.');

  // Pointing picks the element instead of pressing it: the join form is not sent.
  await panel.getByRole('button', { name: 'Point at something' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Tap or click the thing you mean' })).toBeVisible();
  await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByRole('listitem')).toContainText('JoinScreen@room/room-screen.tsx');
  const remove = panel.getByRole('button', { name: 'Remove pointed element 1' });
  expect((await remove.boundingBox())!.width).toBeLessThan(120);
  await panel.getByLabel(/Image or short video/).setInputFiles({
    name: 'join-issue.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  });
  await expect(panel.getByText('join-issue.png')).toBeVisible();
  await panel.getByLabel(/Your name/).fill('Tester Tess');
  await panel.getByRole('button', { name: 'Send' }).click();
  await expect(panel.getByRole('status')).toContainText('Thank you');
  const receipt = panel.getByRole('status').locator('code');
  await expect(receipt).toHaveText(/^[a-f0-9-]{36}$/i);
  const reportId = (await receipt.innerText()).trim();
  await panel.getByRole('button', { name: 'Send another' }).click();
  const clipTitle = `Another report (${test.info().project.name})`;
  await panel.getByLabel('What went wrong?').fill(clipTitle);
  const video = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d')!;
    const stream = canvas.captureStream(20);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const pieces: Blob[] = [];
    recorder.ondataavailable = event => pieces.push(event.data);
    const stopped = new Promise<void>(resolve => recorder.addEventListener('stop', () => resolve(), { once: true }));
    recorder.start();
    const frames = window.setInterval(() => {
      context.fillStyle = context.fillStyle === '#ff0000' ? '#000000' : '#ff0000';
      context.fillRect(0, 0, 32, 32);
    }, 50);
    await new Promise(resolve => setTimeout(resolve, 400));
    recorder.stop();
    window.clearInterval(frames);
    await stopped;
    for (const track of stream.getTracks()) track.stop();
    return [...new Uint8Array(await new Blob(pieces).arrayBuffer())];
  });
  await panel.getByLabel(/Image or short video/).setInputFiles({ name: 'issue.webm', mimeType: 'video/webm', buffer: Buffer.from(video) });
  await panel.getByRole('button', { name: 'Send' }).click();
  await expect(receipt).toHaveText(/^[a-f0-9-]{36}$/i);
  await expect(receipt).not.toHaveText(reportId);

  // Players and strangers cannot read reports.
  await page.goto('/?admin');
  await expect(page).toHaveURL('/');
  await expect(page.locator('.admin-page')).toHaveCount(0);

  const ownerContext = await browser.newContext(); const owner = await ownerContext.newPage();
  try {
    const claim = await owner.request.post(`${baseURL}/api/host/claim`, {
      headers: { origin: baseURL!, 'x-party-request': '1' },
      data: { token: ownerToken },
    });
    expect(claim.ok()).toBe(true);
    await owner.goto(`${baseURL}/?admin`);
    await owner.getByRole('searchbox', { name: 'Search' }).fill(reportId.toUpperCase());
    await expect(owner.locator('.admin-item')).toHaveCount(1);
    const item = owner.getByRole('listitem').filter({ has: owner.getByRole('heading', { name: title }) });
    await expect(item.locator('.admin-report-id code')).toHaveText(reportId);
    await expect(item).toContainText('Tester Tess');
    await expect(item).toContainText('join screen');
    await expect(item).toContainText(/JoinScreen in apps\/web\/src\/room\/room-screen\.tsx:\d+/);
    expect((await new AxeBuilder({ page: owner }).analyze()).violations).toEqual([]);
    await item.getByRole('button', { name: 'View attachment' }).click();
    const preview = item.getByRole('img', { name: 'Feedback attachment' });
    await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1);
    await item.getByRole('button', { name: 'Hide attachment' }).click();
    await ownerContext.grantPermissions(['clipboard-read', 'clipboard-write']);
    await item.getByRole('button', { name: 'Copy as text' }).click();
    await expect(item.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await owner.evaluate(() => navigator.clipboard.readText())).toContain(`Report ID: ${reportId}`);
    await chooseOption(item.getByLabel(`Status of ${title}`), 'done');
    await expect(item).toHaveCount(0);
    await owner.reload();
    await chooseOption(owner.locator('.admin-filters').getByRole('combobox'), 'done');
    await owner.getByRole('searchbox', { name: 'Search' }).fill(reportId);
    await expect(item.getByLabel(`Status of ${title}`)).toHaveAttribute('value', 'done');
    await expect(item.locator('.admin-report-id code')).toHaveText(reportId);
    await chooseOption(owner.locator('.admin-filters').getByRole('combobox'), 'open');
    await owner.getByRole('searchbox', { name: 'Search' }).fill(clipTitle);
    await owner.getByRole('button', { name: 'View attachment' }).click();
    await expect.poll(() => owner.locator('video[aria-label="Feedback video"]').evaluate(video => (video as HTMLVideoElement).videoWidth)).toBe(32);
  } finally { await ownerContext.close(); }
});
