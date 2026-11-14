import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('a person’s phone joins as them, plays side games, and the game pauses them when a round starts', async ({ browser, page, baseURL }) => {
  // Both browser projects share one database: each makes its own person.
  const name = `Dinny ${test.info().project.name.split('-')[0]}`;
  const ownerContext = await browser.newContext(); const host = await ownerContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await host.getByRole('link', { name: 'Admin: people (accounts)' }).click();
    await host.getByLabel('Name', { exact: true }).fill(name);
    await host.getByRole('button', { name: 'Add person' }).click();
    await expect(host.getByRole('heading', { name: `Personal link for ${name}` })).toBeVisible();
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    const link = (await host.locator('.person-url code').textContent())!;
    expect(link).toMatch(/\/#person=[A-Za-z0-9_-]{43}$/);
    await host.getByRole('button', { name: 'Done' }).click();
    await expect(host.getByRole('row', { name: new RegExp(name) })).toBeVisible();

    await host.goto(`${baseURL}/?host=1`);
    await host.getByRole('radio', { name: /Timed quiz/ }).check();
    await host.getByRole('button', { name: 'Open room', exact: true }).click();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);

    // The phone opens its personal link once; the key leaves the address bar at once.
    await page.goto(link);
    await expect(page.getByText(`This phone now plays as ${name}`)).toBeVisible();
    await expect(page).not.toHaveURL(/person=/);
    await page.getByLabel('Room code').fill(roomCode);
    await expect(page.getByText(`Playing as ${name}`)).toBeVisible();
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(host.getByText(`${name} · connected`, { exact: false })).toBeVisible();

    const dock = page.getByRole('navigation', { name: 'More' });
    await dock.getByRole('button', { name: 'Games' }).click();
    const sheet = page.getByRole('dialog', { name: 'Side games' });
    await expect(sheet.getByText('1,000 chips')).toBeVisible();
    await sheet.getByRole('button', { name: 'Spin for 10 chips' }).click();
    await expect(sheet.getByRole('status').filter({ hasText: /You win|No luck/ })).toBeVisible();
    expect((await new AxeBuilder({ page }).include('.bottom-sheet').analyze()).violations).toEqual([]);
    await sheet.getByRole('tab', { name: 'Leaderboard' }).click();
    await expect(sheet.getByRole('row', { name: new RegExp(name) }).first()).toContainText('10');

    // The host starts the game: the round needs the player, so the side game steps aside.
    await host.getByRole('button', { name: 'Start the game' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText('Round started: your side game is paused')).toBeVisible();
    await expect(dock.getByRole('button', { name: 'Games paused' })).toBeVisible();
  } finally { await ownerContext.close(); }
});
