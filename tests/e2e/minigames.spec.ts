import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('a player builds their own look and plays minigames on the phone; the screens rank everyone', async ({ page, baseURL, browser }) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }); const host = await hostContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await host.getByRole('radio', { name: /Minigame madness/ }).check();
    await host.getByRole('button', { name: 'Open room', exact: true }).click();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);

    // Joining, then a look made from parts.
    await page.goto(`/?code=${roomCode}`);
    await page.getByLabel('Your name').fill('Speedy');
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await page.getByRole('button', { name: 'Change my look' }).click();
    const builder = page.getByRole('dialog', { name: 'Your look' });
    await builder.getByRole('tab', { name: 'Character' }).click();
    await builder.getByRole('radio', { name: 'Cat' }).click();
    await builder.getByRole('tab', { name: 'Hat' }).click();
    await builder.getByRole('radio', { name: 'Crown' }).click();
    await expect(builder.getByRole('img', { name: 'Speedy: cat with a crown' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await builder.getByRole('button', { name: 'Save my look' }).click();
    await expect(builder).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('party_look') ?? '{}'))).toMatchObject({ body: 'cat', hat: 'crown' });
    // The look reaches the other screens: the lobby crowd shows the player.
    await expect(host.getByRole('list', { name: 'Players who joined' })).toContainText('Speedy');

    await host.getByRole('button', { name: 'Start the game' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();

    // Reaction duel: wait for GO, then tap.
    await expect(host.getByText('Reaction duel', { exact: true }).first()).toBeVisible();
    const pad = page.getByRole('button', { name: 'GO!' });
    await expect(pad).toBeVisible({ timeout: 15_000 });
    await pad.click();
    await expect(page.getByRole('status').filter({ hasText: /\d+ ms/ })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(host.getByRole('region', { name: 'Round results' })).toContainText(/Speedy.*\d+ ms/);
    await expect(page.getByText('You earned 10 points this round.')).toBeVisible();
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);

    // Tap race: hammer the button until the time is up; the count is sent by itself.
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    const tap = page.getByRole('button', { name: 'TAP!' });
    await expect(tap).toBeVisible({ timeout: 10_000 });
    // At a human pace: the server does not believe more taps than a person can make.
    for (let index = 0; index < 15; index++) { await tap.click(); await page.waitForTimeout(110); }
    await expect(page.getByRole('status').filter({ hasText: /^15 taps/ })).toBeVisible({ timeout: 15_000 });

    // Stop the clock is skipped by the host; then lucky doors.
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Door 2' }).click({ timeout: 10_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Door 2' })).toBeVisible();
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(page.getByRole('heading', { name: 'Behind the doors' })).toBeVisible();
    await expect(page.locator('.mg-doors.revealed li')).toHaveCount(4);
  } finally { await hostContext.close(); }
});
