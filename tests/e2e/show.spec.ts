import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPhoneMenu } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('a wheel of fortune picks the challenge, players vote for a break, and the game ends with awards', async ({ page, baseURL, browser }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor part is desktop first; the phone is a separate context below.');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const name = `Wheel night ${Date.now()}`;
  const section = page.getByRole('region', { name: 'Import a game from text' });
  await section.getByLabel('Game text').fill(JSON.stringify({ title: name, awards: ['winner', 'mostCorrect'],
    wheels: [{ title: 'Forfeits', entries: ['Sing a song', 'Tell a joke', 'Do a dance'], removePicked: true, spinSeconds: 2 }],
    scenes: [
      { id: 'dare', type: 'challenge', question: 'Do what the wheel says!', maxPoints: 5, spin: 'Forfeits' },
      { id: 'q1', type: 'quiz', question: 'Capital of France?', answers: ['Paris', 'Lyon'], correct: 'Paris', seconds: 60 },
    ] }));
  await section.getByRole('button', { name: 'Import' }).click();
  // The editor shows how long the game takes, and the wheel can be changed there.
  await expect(page.locator('.game-overview')).toContainText(/about \d+ min/);
  // The wheels belong to the whole game (Game settings); the scene that spins one says which.
  await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: 'Game settings' }).click();
  await page.getByText('Wheels of fortune').click();
  await expect(page.getByLabel('Entry 1 of Forfeits', { exact: true })).toHaveValue('Sing a song');
  // A test spin shows the real wheel in the game's look and lands on one of its entries; nothing is saved.
  await page.locator('.game-settings-panel').getByRole('button', { name: 'Test spin…' }).click();
  const spinTest = page.getByRole('dialog', { name: 'Test spin: Forfeits' });
  await expect(spinTest.locator('.wheel-label')).toHaveCount(3);
  await spinTest.getByRole('button', { name: 'Spin' }).click();
  await expect(spinTest.getByRole('status')).toHaveText(/^(Sing a song|Tell a joke|Do a dance)$/, { timeout: 8000 });
  // Clicking the wheel turns it; clicking again while it turns gives it a boost; it still lands on an entry.
  // (With motion allowed: for less motion the wheel stops at once, as above.)
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await spinTest.locator('.wheel-hit').click();
  await expect(spinTest.getByRole('button', { name: 'Boost' })).toBeVisible();
  await spinTest.locator('.wheel-hit').click();
  await expect(spinTest.getByRole('status')).toHaveText('Boost!');
  await expect(spinTest.getByRole('status')).toHaveText(/^(Sing a song|Tell a joke|Do a dance)$/, { timeout: 15000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await new AxeBuilder({ page }).include('.wheel-test').analyze()).violations).toEqual([]);
  await spinTest.getByRole('button', { name: 'Close' }).click();
  // Its own slice colours instead of the game's answer colours.
  await page.locator('.game-settings-panel').getByRole('group', { name: 'Slice colours' }).getByRole('button', { name: 'Its own colours' }).click();
  await expect(page.getByLabel('Slice colour 1 of Forfeits')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  await expect(page.getByLabel('On this scene')).toHaveText('The host spins “Forfeits”');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Play & publish' }).click(); await page.getByRole('menuitem', { name: 'Publish', exact: true }).click();
  await page.getByRole('button', { name: 'Play & publish' }).click(); await expect(page.getByRole('menuitem', { name: 'Play the published version ↗' })).toBeEnabled(); await page.keyboard.press('Escape');
  await page.goto(`${baseURL}/?host=1`);
  await page.getByRole('region', { name: 'Your games' }).getByRole('button', { name: `Open room for ${name}` }).click();
  const roomCode = (await page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })).newPage();
  await phone.goto(`${baseURL}/?code=${roomCode}`);
  await phone.getByLabel('Your name').fill('Wim'); await phone.getByRole('button', { name: 'Join room', exact: true }).click();
  await page.getByRole('button', { name: 'Start the game' }).click();

  // The host spins: every screen shows the wheel, then the result stays as a small note.
  await page.getByRole('button', { name: 'Spin the wheel' }).click();
  await expect(phone.getByRole('status', { name: /^Forfeits: (Sing a song|Tell a joke|Do a dance)$/ })).toBeVisible({ timeout: 8000 });
  await expect(phone.locator('.wheel-badge')).toContainText(/Now: (Sing a song|Tell a joke|Do a dance)/);
  await expect(page.getByRole('button', { name: 'Spin again' })).toBeVisible();

  // The only player votes for a break: the game pauses with a break screen until the host continues.
  await (await openPhoneMenu(phone)).getByRole('button', { name: /^Break 0\/1/ }).click();
  await expect(phone.getByRole('dialog', { name: 'Smoke break!' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Smoke break!' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue the game' }).click();
  await expect(phone.getByRole('dialog', { name: 'Smoke break!' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Close answers' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await phone.getByRole('radio', { name: 'Paris', exact: true }).check();
  await phone.getByRole('button', { name: 'Save answer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reveal results' })).toBeVisible({ timeout: 8000 }); // closed by itself: everyone answered
  await page.getByRole('button', { name: 'Reveal results' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const awards = phone.getByRole('region', { name: 'The awards' });
  await expect(awards).toContainText('Wim');
  // Two awards: one dot each, stepped through by hand on a phone (auto-play is off there until chosen).
  await expect(awards.getByRole('group', { name: 'Awards' }).getByRole('button')).toHaveCount(2);
  await expect(awards.getByRole('button', { name: '▶ Auto-play' })).toHaveAttribute('aria-pressed', 'false');
  await awards.getByRole('button', { name: 'Next award' }).click();
  await expect(awards).toContainText('2 / 2');
  expect((await new AxeBuilder({ page: phone }).analyze()).violations).toEqual([]);
});
