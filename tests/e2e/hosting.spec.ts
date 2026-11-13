import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { closeRoundsByHand, expectPhoneScores } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('owner opens a room from the host menu and stays in control of a timed stage', async ({ browser, page, baseURL }) => {
  // A browser without the owner key gets an explanation, not a menu.
  await page.goto('/?host=1');
  await expect(page.getByRole('alert')).toContainText('not signed in as the owner');
  await expect(page.getByRole('button', { name: 'Open room', exact: true })).toHaveCount(0);

  const hostContext = await browser.newContext(); const host = await hostContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
    await expect(host).not.toHaveURL(/owner=/);
    expect(await host.evaluate(() => document.cookie)).not.toContain('party_');
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    await host.getByRole('radio', { name: /Timed quiz/ }).check();
    await host.getByRole('button', { name: 'Open room', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Start the game' })).toBeVisible();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    await closeRoundsByHand(host);

    await page.goto(`/?code=${roomCode}`);
    await page.getByLabel('Your name').fill('Phone player');
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(host.getByText('Phone player · connected', { exact: false })).toBeVisible();
    await host.getByRole('button', { name: 'Start the game' }).click();
    const playerTimer = page.getByRole('timer', { name: 'Time left' });
    await expect(playerTimer).toHaveText(/^0:(1\d|20) left$/);
    await expect(page.getByRole('group', { name: 'Time controls' })).toHaveCount(0);

    await host.getByRole('button', { name: 'Add 1 minute' }).click();
    await expect(playerTimer).toHaveText(/^1:\d\d left$/);
    await host.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(playerTimer).toHaveText(/^Paused · 1:\d\d left$/);
    const frozen = await playerTimer.textContent();
    await page.waitForTimeout(1500);
    await expect(playerTimer).toHaveText(frozen!);
    await host.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(playerTimer).toHaveText(/^1:\d\d left$/);

    await expect(page.locator('fieldset.tiles').getByRole('radio')).toHaveCount(4);
    await page.getByRole('radio', { name: 'Saturn', exact: true }).check();
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // The host overrides the clock; the server then closes the stage by itself.
    await host.getByLabel('Time left (seconds)').fill('1');
    await host.getByRole('button', { name: 'Set time', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
    await expect(playerTimer).toHaveCount(0);
    await host.getByRole('button', { name: 'Reopen for 30 seconds' }).click();
    await expect(playerTimer).toHaveText(/^0:(2\d|30) left$/);
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    await host.getByRole('button', { name: 'Remove time limit' }).click();
    await expect(playerTimer).toHaveText('No time limit');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // Answer styles are set per round: tiles first, then a plain list, then ordering.
    await expect(page.locator('fieldset.tiles')).toHaveCount(0); // already answered; tiles were used above
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Pacific', exact: true })).toBeVisible();
    await expect(page.locator('fieldset.tiles')).toHaveCount(0);
    // Moving on revealed round one: the scoreboard now counts the correct Saturn answer.
    await expectPhoneScores(page, ['Phone player (you)10']);
    await page.getByRole('radio', { name: 'Pacific', exact: true }).check();
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(page.getByText('1 of 1 answered')).toBeVisible();
    await host.getByRole('button', { name: 'Close answers' }).click();
    // Locked but not revealed: no answer, no new points yet.
    await expect(page.getByText('answers are locked')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Round results' })).toHaveCount(0);
    await expectPhoneScores(page, ['Phone player (you)10']);
    await host.getByRole('button', { name: 'Reveal results' }).click();
    const results = page.getByRole('region', { name: 'Round results' });
    await expect(results).toContainText('Correct answer: Pacific');
    await expect(results).toContainText('You earned 10 points this round.');
    await expectPhoneScores(page, ['Phone player (you)20']);
    await expect(host.getByRole('button', { name: 'Reopen for 30 seconds' })).toHaveCount(0);
    // The host fixes a score; the player sees it without any earlier entry being edited.
    await host.getByRole('button', { name: 'Correct scores' }).click();
    await host.getByLabel('Correct score for Phone player (+ or −)').fill('-3');
    await host.getByRole('button', { name: 'Correct score', exact: true }).click();
    await expectPhoneScores(page, ['Phone player (you)17']);
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('fieldset.tiles')).toBeVisible();
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    const items = page.locator('.order-list .order-label');
    await expect(items).toHaveCount(4);
    // Arrange with buttons only (no dragging): repeatedly lift each animal into place.
    const wanted = ['Mouse', 'Wolf', 'Horse', 'Hippopotamus'];
    for (let target = 0; target < wanted.length; target++) {
      for (let guard = 0; guard < 4 && (await items.nth(target).textContent()) !== wanted[target]; guard++) await page.getByRole('button', { name: `Move ${wanted[target]} up` }).click();
    }
    await expect(items).toHaveText(wanted);
    await expect(page.getByRole('button', { name: 'Move Mouse up' })).toBeDisabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Your answer is in!')).toBeVisible();

    // The owner can always get back into the room from the menu.
    await host.getByRole('link', { name: 'Back to the host menu' }).click();
    await host.getByRole('button', { name: `Return to room ${roomCode}` }).click();
    await expect(host.getByRole('heading', { name: `Room ${roomCode}` })).toBeVisible();
    await expect(host.getByRole('button', { name: 'Close answers' })).toBeVisible();
  } finally { await hostContext.close(); }
});
