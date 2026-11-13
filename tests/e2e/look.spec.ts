import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the owner styles a game, rewrites its texts and picks animations, and phones show exactly that', async ({ page, baseURL, browser }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first; the phone side is checked below in a separate context.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const name = `Styled quiz ${Date.now()}`;
  const section = page.getByRole('region', { name: 'Import a game from text' });
  await section.getByLabel('Game text').fill(JSON.stringify({ title: name, scenes: [
    { id: 'q1', type: 'quiz', question: 'Capital of France?', answers: ['Paris', 'Lyon'], correct: 'Paris', seconds: 60 },
    { id: 'end', type: 'scoreboard', title: 'Final scores' },
  ] }));
  await section.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('tab', { name: 'Look & feel' }).click();
  await expect(page.getByRole('heading', { name: 'Look & feel', level: 2 })).toBeVisible();
  await settled(page); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A style, a colour and a readability warning.
  await page.getByRole('button', { name: /Neon night/ }).click();
  await expect(page.locator('.room-preview').first()).toHaveCSS('font-family', /Arial Narrow/);
  await page.getByLabel('Text on main buttons').fill('#00f0ff');
  await expect(page.getByText('Text on main buttons is hard to read')).toBeVisible();
  await page.getByLabel('Text on main buttons').fill('#001417');
  await expect(page.getByText('Text on main buttons is hard to read')).toHaveCount(0);

  // Own words, shown in the preview straight away.
  await page.getByRole('tab', { name: 'Texts' }).click();
  await page.getByLabel('Find a text').fill('answer is in');
  await page.getByLabel('Your answer is in!', { exact: true }).fill('Locked in, good luck!');
  await page.getByLabel('Find a text').fill('');
  await page.getByLabel('Join a game', { exact: true }).fill('Welcome to quiz night');
  await page.getByLabel('{time} left', { exact: true }).fill('Hurry! {time}');
  await page.getByRole('button', { name: 'Answer saved', exact: true }).click();
  await expect(page.locator('.look-phone')).toContainText('Locked in, good luck!');

  // A ready-made animation and one built from blocks.
  await page.getByRole('tab', { name: 'Animations' }).click();
  await page.getByLabel('Animation for: A player’s answer is saved').selectOption({ label: 'Shake' });
  const sceneMoment = page.getByRole('group', { name: 'A new scene or question appears' });
  await sceneMoment.getByRole('button', { name: 'Build your own' }).click();
  await sceneMoment.getByRole('button', { name: 'Add a step in between' }).click();
  await sceneMoment.getByLabel('Name').fill('Wiggle in');
  await sceneMoment.getByRole('button', { name: 'Use this animation' }).click();
  await expect(sceneMoment.getByLabel('Animation for: A new scene or question appears')).toHaveValue('own:0');
  await settled(page); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });

  // Only this scene: a different heading font for the quiz question.
  await page.getByRole('tab', { name: 'Colours & style' }).click();
  await page.getByLabel('Change the look of').selectOption({ label: 'Capital of France?' });
  await page.getByLabel('Font for titles').selectOption({ label: 'Elegant' });
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });
  const exported = await (async () => { await page.getByRole('button', { name: 'Export as text' }).click(); return JSON.parse(await page.getByLabel('The game as text').inputValue()); })();
  expect(exported.presentation).toMatchObject({ theme: { preset: 'neon', colors: { accentText: '#001417' } }, texts: { 'answer.saved': 'Locked in, good luck!', 'join.title': 'Welcome to quiz night', 'timer.left': 'Hurry! {time}' },
    animations: { answerSaved: { preset: 'shake' }, sceneEnter: { name: 'Wiggle in', custom: { keyframes: expect.any(Array) } } } });
  expect(exported.nodes.find((node: { key: string }) => node.key === 'q1').stages[0].presentation).toEqual({ theme: { headingFont: 'elegant' } });

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play published version ↗' })).toBeEnabled();
  await page.goto(`${baseURL}/?host=1`);
  await page.getByRole('region', { name: 'Your games' }).getByRole('button', { name: `Open room for ${name}` }).click();
  const roomCode = (await page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await expect(page.locator('main.room')).toHaveCSS('--r-accent', '#00f0ff');

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' }); const phone = await phoneContext.newPage();
  try {
    await phone.goto(`${baseURL}/?code=${roomCode}`);
    await expect(phone.getByRole('heading', { name: 'Welcome to quiz night' })).toBeVisible();
    await expect(phone.getByText(name)).toBeVisible();
    await expect(phone.locator('main.room')).toHaveCSS('--r-accent', '#00f0ff');
    await phone.getByLabel('Your name').fill('Styled player');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expect(phone.getByRole('timer', { name: 'Time left' })).toHaveText(/^Hurry! 0:\d\d$/);
    await expect(phone.getByRole('heading', { name: 'Capital of France?' })).toHaveCSS('font-family', /Didot/);
    await phone.getByRole('radio', { name: 'Paris', exact: true }).check();
    await phone.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(phone.getByText('Locked in, good luck!')).toBeVisible();
    await settled(phone); expect((await new AxeBuilder({ page: phone }).analyze()).violations).toEqual([]);
  } finally { await phoneContext.close(); }
});
