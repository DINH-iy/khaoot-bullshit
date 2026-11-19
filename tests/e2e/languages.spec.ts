import { expect, test } from '@playwright/test';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the host chooses Dutch: the host menu and the host’s room controls switch, and the choice is remembered', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Hosting is checked on the desktop.');
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Host a game' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('nl');
  await expect(page.getByRole('heading', { name: 'Een spel hosten' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kies een spel' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('nl');
  // Remembered in this browser.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Een spel hosten' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Spelen' })).toBeVisible();

  await page.getByRole('radio', { name: /Timed quiz/ }).check();
  await page.getByRole('button', { name: 'Kamer openen', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Hostbediening' })).toBeVisible();
  await page.getByRole('group', { name: 'Meer' }).getByRole('button', { name: 'Kamerinstellingen' }).click();
  await expect(page.getByRole('dialog', { name: 'Kamerinstellingen' })).toContainText('Tijdens het spel');
  await expect(page.getByText('Spelers zien de scores tijdens het spel')).toBeVisible();
  await page.keyboard.press('Escape');

  // Back to English for the other tests in this browser profile (each test has its own, but tidy anyway).
  await page.goto(`${baseURL}/?host=1`);
  await page.getByRole('combobox', { name: 'Taal' }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Host a game' })).toBeVisible();
});

test('the editor’s frame in Dutch: tabs, menus, help and game settings', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  await mine.getByLabel('Name of your new game').fill(`Taaltest ${Date.now()}`);
  await mine.getByRole('button', { name: 'Create game' }).click();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('nl');
  await page.getByRole('link', { name: /bewerken$/ }).first().click();
  await expect(page.getByRole('tab', { name: 'Scène-editor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spelen & publiceren' })).toBeVisible();
  await page.getByRole('button', { name: 'Spelmenu' }).click();
  await page.getByRole('menuitem', { name: /Hulp & sneltoetsen/ }).click();
  const help = page.getByRole('dialog', { name: 'Hulp & sneltoetsen' });
  await expect(help).toContainText('Sneltoetsen'); await expect(help.locator('strong').first()).toHaveText('Flow-editor');
  await help.getByRole('button', { name: 'Sluiten' }).click();
  await page.getByRole('button', { name: 'Spelmenu' }).click(); await page.getByRole('menuitem', { name: 'Spelinstellingen' }).click();
  await expect(page.getByRole('heading', { name: 'Spelinstellingen' })).toBeVisible();
  await expect(page.locator('.game-settings-panel')).toContainText('Bijspellen & fiches');
  await page.locator('.game-settings-panel').getByRole('button', { name: 'Sluiten' }).first().click();
  // The scene panel, the map and Look & feel too.
  await page.getByRole('tab', { name: 'Scène-editor' }).click();
  await expect(page.locator('.scene-props summary', { hasText: 'Inhoud' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deze scène proberen' })).toBeVisible();
  await page.getByRole('tab', { name: 'Flow-editor' }).click();
  await expect(page.getByRole('toolbar', { name: 'Flow-gereedschap' })).toContainText('Een scène toevoegen');
  await page.getByRole('tab', { name: 'Uiterlijk' }).click();
  await expect(page.getByRole('tab', { name: 'Kleuren & stijl' })).toBeVisible();
  await page.getByRole('tab', { name: 'Animaties' }).click();
  await expect(page.getByRole('group', { name: 'Er verschijnt een nieuwe scène of vraag' })).toBeVisible();
});

test('a phone chooses its own language: the game’s standard texts follow it, the host keeps English', async ({ browser, page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Set up from the desktop; the phone is its own context below.');
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByRole('radio', { name: /Timed quiz/ }).check();
  await page.getByRole('button', { name: 'Open room', exact: true }).click();
  const roomCode = (await page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const phone = await phoneContext.newPage();
  try {
    await phone.goto(`${baseURL}/?code=${roomCode}`);
    await phone.getByRole('combobox', { name: 'Language' }).selectOption('nl');
    await expect(phone.getByLabel('Je naam')).toBeVisible();
    await phone.getByLabel('Je naam').fill('Taalspeler');
    await phone.getByRole('button', { name: 'Meedoen', exact: true }).click();
    await expect(phone.getByRole('heading', { name: 'Je doet mee!' })).toBeVisible();
    // The phone's menu switches it back, the host never changed.
    await phone.getByRole('button', { name: /^Menu/ }).click();
    await phone.getByRole('navigation', { name: 'More' }).getByRole('button', { name: 'Nederlands' }).click();
    await phone.getByRole('group', { name: 'Taal' }).getByRole('button', { name: 'Deutsch' }).click();
    await expect(phone.getByRole('heading', { name: 'Du bist dabei!' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start the game' })).toBeVisible();
  } finally { await phoneContext.close(); }
});
