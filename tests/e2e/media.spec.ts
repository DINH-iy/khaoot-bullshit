import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
const picture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const loaded = (image: HTMLImageElement) => image.complete && image.naturalWidth > 0;

test('a player answers with a picture, the room votes on it without names, then sees whose it was', async ({ browser, page, baseURL }) => {
  const hostContext = await browser.newContext(); const host = await hostContext.newPage();
  const otherContext = await browser.newContext(); const other = await otherContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await host.getByRole('radio', { name: /Picture party/ }).check();
    await host.getByRole('button', { name: 'Open room', exact: true }).click();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    for (const [device, name] of [[page, 'Uploader'], [other, 'Watcher']] as const) {
      await device.goto(`${baseURL}/?code=${roomCode}`);
      await device.getByLabel('Your name').fill(name);
      await device.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(device.getByRole('heading', { name: `Room ${roomCode}` })).toBeVisible();
    }
    await host.getByRole('button', { name: 'Start the game' }).click();

    const chooser = page.getByLabel('Choose a picture or a GIF');
    await expect(page.getByRole('button', { name: 'Save answer', exact: true })).toBeDisabled();
    await chooser.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') });
    await expect(page.getByRole('alert')).toContainText('not accepted');
    await chooser.setInputFiles({ name: 'holiday.png', mimeType: 'image/png', buffer: picture });
    const preview = page.getByRole('img', { name: 'Your upload' });
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate(loaded)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const address = await preview.evaluate(image => (image as HTMLImageElement).src);
    // The photo was redrawn in the browser before upload, so the stored file is a JPEG.
    expect((await page.context().request.get(address)).headers()['content-type']).toBe('image/jpeg');
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(page.getByText('Your answer is in!')).toBeVisible();

    // Before the reveal the other phone gets nothing, even with the direct address.
    await host.getByRole('button', { name: 'Close answers' }).click();
    await expect(other.getByText('answers are locked')).toBeVisible();
    await expect(other.getByRole('img', { name: 'Upload from Uploader' })).toHaveCount(0);
    expect((await otherContext.request.get(address)).status()).toBe(403);
    await expect(other.getByText('shown without names in the vote')).toBeVisible();
    await expect(host.getByRole('button', { name: 'Reveal results' })).toHaveCount(0);

    // The vote: the picture appears without a name; the uploader cannot vote for it.
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    const entry = other.getByRole('img', { name: 'Entry 1' });
    await expect(entry).toBeVisible();
    await expect.poll(() => entry.evaluate(loaded)).toBe(true);
    expect((await otherContext.request.get(address)).status()).toBe(200);
    await expect(other.getByText('Uploader', { exact: false }).filter({ hasText: 'Entry' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: /Entry 1 \(yours/ })).toBeDisabled();
    expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);
    await other.getByRole('radio', { name: /^Entry 1/ }).check();
    await other.getByRole('button', { name: 'Save vote' }).click();
    await expect(other.getByText('Your vote is in!')).toBeVisible();
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    const results = other.getByRole('region', { name: 'Round results' });
    await expect(results).toContainText('Uploader · 1 vote');
    const shown = results.getByRole('img', { name: 'Entry from Uploader' });
    await expect(shown).toBeVisible();
    await expect.poll(() => shown.evaluate(loaded)).toBe(true);
    await expect(page.getByRole('region', { name: 'Scoreboard' }).getByRole('listitem')).toContainText(['Uploader (you)5']);
    expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await hostContext.close(); await otherContext.close(); }
});
