import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the host keeps scores secret, players react on the big screen, and a round ends once everyone answered', async ({ page, baseURL, browser }) => {
  test.setTimeout(90_000);
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }); const host = await hostContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await expect(host.getByText('about', { exact: false }).first()).toBeVisible();
    await host.getByRole('radio', { name: /Timed quiz/ }).check();
    await expect(host.getByRole('heading', { name: 'Timed quiz', level: 3 })).toBeVisible();
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    await host.getByRole('button', { name: 'Open room', exact: true }).click();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    await host.getByLabel('Players see the scores during the game').uncheck();

    await page.goto(`/?code=${roomCode}`);
    await page.getByLabel('Your name').fill('Rea');
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    const dock = page.getByRole('navigation', { name: 'More' });
    await expect(dock.getByRole('button', { name: 'Players · 1' })).toBeVisible();
    await expect(dock.getByRole('button', { name: 'Scoreboard' })).toHaveCount(0); // scores are secret

    // A reaction from the phone floats up on the host screen.
    await dock.getByRole('button', { name: 'React' }).click();
    await page.getByRole('dialog', { name: 'Send a reaction' }).getByRole('button', { name: 'Send 🔥' }).click();
    await expect(host.locator('.reactions-overlay')).toContainText('🔥');
    await page.getByRole('dialog', { name: 'Send a reaction' }).getByRole('button', { name: 'Close' }).click();
    // The host blocks a reaction: it disappears from the phone.
    await host.getByRole('button', { name: '🔥, allowed' }).click();
    await dock.getByRole('button', { name: 'React' }).click();
    await expect(page.getByRole('button', { name: 'Send 🔥' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // The only player answers: the round ends about 3 seconds later, without waiting for its 20 seconds.
    await host.getByRole('button', { name: 'Start the game' }).click();
    await expect(page.getByText('Answer now')).toBeVisible();
    await page.locator('fieldset').getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Reveal results' })).toBeVisible({ timeout: 6000 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    // Secret scores: the host still sees them; the phone gets none until the end.
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(host.getByRole('heading', { name: 'Scoreboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scoreboard' })).toHaveCount(0);
    // Allowed again: the phone gets the scoreboard button and an overlay, no scrolling.
    await host.getByLabel('Players see the scores during the game').check();
    await dock.getByRole('button', { name: 'Scoreboard' }).click();
    await expect(page.getByRole('dialog', { name: 'Scoreboard' })).toContainText('Rea');
  } finally { await hostContext.close(); }
});
