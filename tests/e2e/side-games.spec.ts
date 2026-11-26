import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { closeHostFold, openHostFold, openPhoneMenu } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('a person’s phone joins as them, plays side games, and the game pauses them when a round starts', async ({ browser, page, baseURL }) => {
  // Both browser projects share one database: each makes its own person.
  const name = `Dinny ${test.info().project.name.split('-')[0]}`;
  const ownerContext = await browser.newContext(); const host = await ownerContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await expect(host.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
    await host.goto(`${baseURL}/?admin=people`);
    await host.getByLabel('Name', { exact: true }).fill(name);
    await host.getByRole('button', { name: 'Add person' }).click();
    await expect(host.getByRole('heading', { name: `Personal key for ${name}` })).toBeVisible();
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    const link = (await host.locator('.person-url code').textContent())!;
    expect(link).toMatch(/\/#person=[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    await host.getByRole('button', { name: 'Done' }).click();
    await expect(host.getByRole('row', { name: new RegExp(name) })).toBeVisible();
    const key = host.getByRole('button', { name: `Share key for ${name}` });
    await expect(key).toHaveText(new URLSearchParams(new URL(link).hash.slice(1)).get('person')!);
    await key.click();
    await expect(host.getByRole('dialog', { name: `Personal key for ${name}` })).toBeVisible();
    await host.getByRole('button', { name: 'Done' }).click();

    await host.goto(`${baseURL}/?host=1`);
    await host.getByRole('button', { name: 'Open room for Timed quiz' }).click();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    // Side games are on and chips off in a new room; the host switches chips on in the lobby.
    await openHostFold(host, 'Room settings');
    await expect(host.getByRole('switch', { name: 'Side games', exact: true })).toHaveAttribute('aria-checked', 'true');
    const chips = host.getByRole('switch', { name: 'Chips', exact: true });
    await expect(chips).toHaveAttribute('aria-checked', 'false');
    await chips.click(); await expect(chips).toHaveAttribute('aria-checked', 'true');
    await closeHostFold(host);

    // The phone opens its personal link once; the key leaves the address bar at once.
    await page.goto(link);
    await expect(page.getByText(`This phone now plays as ${name}`)).toBeVisible();
    await expect(page).not.toHaveURL(/person=/);
    await page.getByLabel('Room code').fill(roomCode);
    await expect(page.getByText(`Playing as ${name}`)).toBeVisible();
    let releaseChallenges!: () => void;
    const challengeGate = new Promise<void>(resolve => { releaseChallenges = resolve; });
    await page.route('**/api/rooms/*/side/challenges', async route => {
      await challengeGate;
      await route.continue();
    }, { times: 1 });
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(host.getByText(`${name} · connected`, { exact: false })).toBeVisible();

    await (await openPhoneMenu(page)).getByRole('button', { name: 'Challenge', exact: true }).click();
    const challenges = page.getByRole('dialog', { name: 'Challenges' });
    await expect(challenges.getByRole('button', { name: 'Challenge someone' })).toBeVisible();
    await expect(challenges.getByRole('region', { name: 'Your challenges' })).toHaveAttribute('aria-busy', 'true');
    releaseChallenges();
    await expect(challenges.getByText(/^None yet/)).toBeVisible();
    await challenges.getByRole('button', { name: 'Close' }).click();
    const dock = await openPhoneMenu(page);
    await dock.getByRole('button', { name: 'Games' }).click();
    const sheet = page.getByRole('dialog', { name: 'Side games' });
    await expect(sheet.getByRole('button', { name: /Spin/ })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Slot machine', exact: true }).click();
    // Everyone starts with 200 chips (more are earned by playing).
    await expect(sheet.getByTitle('200 chips')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await sheet.getByRole('button', { name: 'Spin for 10 chips' }).click();
    const reels = sheet.locator('.reel-strip.landing');
    await expect(reels).toHaveCount(3);
    expect(await reels.evaluateAll(elements => elements.map(element => getComputedStyle(element).animationDuration)))
      .toEqual(['0.95s', '1.45s', '1.96s']);
    await expect(sheet.getByRole('status').filter({ hasText: /You win|No luck/ })).toBeVisible();
    expect((await new AxeBuilder({ page }).include('.bottom-sheet').analyze()).violations).toEqual([]);
    // One button names the game being played and opens all games.
    await sheet.getByRole('button', { name: /choose another game/ }).click();
    await sheet.getByRole('list', { name: 'Side games' }).getByRole('button', { name: 'Leaderboard' }).click();
    await expect(sheet.getByRole('row', { name: new RegExp(name) }).first()).toContainText('10');

    // The host starts the game: the round needs the player, so the side game steps aside.
    await host.getByRole('button', { name: 'Start the game' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText('Round started: your side game is paused')).toBeVisible();
    await expect((await openPhoneMenu(page)).getByRole('button', { name: 'Games paused' })).toBeVisible();
  } finally { await ownerContext.close(); }
});
