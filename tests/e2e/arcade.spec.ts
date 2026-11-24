import { randomUUID } from 'node:crypto';
import { HEAD_TO_HEAD_KEYS, MINIGAME_KEYS } from '@party/contracts';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

if (process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E environment required');

/** The lobby keeps its lists in sheets: the invite link sits behind the Invite players button. */
async function inviteLink(page: Page) {
  await page.getByRole('button', { name: 'Invite players' }).click();
  const sheet = page.getByRole('dialog', { name: 'Invite players' });
  const link = (await sheet.getByRole('link').textContent())!;
  await sheet.getByRole('button', { name: 'Close' }).click();
  return link;
}
/** The leader taps the game tile and picks a game from the grid. */
async function pickGame(page: Page, name: string) {
  await page.getByRole('button', { name: /Change$/ }).click();
  await page.getByRole('dialog', { name: 'Choose a game' }).getByRole('button', { name, exact: true }).click();
}
async function openScores(page: Page) {
  await page.getByRole('button', { name: /Scores$/ }).click();
  return page.getByRole('dialog', { name: 'Scores' });
}

test('an Arcade lobby can require a password, and its leader can remove it', async ({ browser, page, baseURL }) => {
  await page.goto('/?arcade');
  const codeLink = page.getByRole('link', { name: 'Join a game with a code' });
  await expect(codeLink).toHaveCSS('text-decoration-line', 'none');
  await codeLink.click();
  await expect(page.getByRole('button', { name: 'Join room', exact: true })).toBeVisible();
  await page.goto('/?arcade');
  await page.getByLabel('Your name').fill('Lobby leader');
  const title = `Password lobby ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Lobby name (optional)').fill(title);
  await page.getByLabel('Lobby password (optional)').fill('game night');
  await page.getByRole('button', { name: 'Open a lobby' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const url = await inviteLink(page);
  expect(url).toMatch(/\?arcade=[a-f0-9-]{36}$/);
  const context = await browser.newContext({ baseURL });
  const friend = await context.newPage();
  try {
    await friend.goto(url);
    await friend.getByLabel('Your name').fill('Friend');
    const key = friend.getByLabel('Lobby password', { exact: true });
    await key.fill('incorrect');
    await friend.getByRole('button', { name: 'Join the lobby' }).click();
    await expect(friend.getByRole('alert')).toContainText('Enter the correct lobby password');
    await key.fill('game night');
    await friend.getByRole('button', { name: 'Join the lobby' }).click();
    await expect(friend.getByRole('button', { name: 'Players 2' })).toBeVisible();
    await page.getByRole('button', { name: 'Lobby settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Lobby settings' });
    await expect(settings.getByRole('heading', { name: 'Lobby password · On' })).toBeVisible();
    await settings.getByRole('button', { name: 'Remove password' }).click();
    await expect(settings.getByRole('status').filter({ hasText: 'Lobby password removed' })).toBeVisible();
    await settings.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Invite players' }).click();
    await expect(page.getByRole('dialog', { name: 'Invite players' }).getByText('Share the password', { exact: false })).toHaveCount(0);
  } finally { await context.close(); }
});

test('the arcade: a guest opens a lobby, friends join by link, the leader locks it and runs a round, and everyone is back with the totals', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const phone = async () => { const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); return { context, page: await context.newPage() }; };
  const [ann, bo, cy] = await Promise.all([phone(), phone(), phone()]);
  try {
    // From the start page into the arcade, and a lobby of one's own.
    await ann.page.goto(`${baseURL}/`);
    const arcade = ann.page.getByRole('link', { name: 'Arcade Play minigames with friends' });
    await expect(arcade).toBeHidden();
    await ann.page.locator('.join-more summary').click();
    await arcade.click();
    await ann.page.getByLabel('Your name').fill('Ann');
    expect((await new AxeBuilder({ page: ann.page }).analyze()).violations).toEqual([]);
    // A name of its own per run: lobbies of other runs (the other browser project) may still be listed.
    const title = `Ann's lobby ${randomUUID().slice(0, 6)}`;
    await ann.page.getByLabel('Lobby name (optional)').fill(title);
    await ann.page.getByRole('button', { name: 'Open a lobby' }).click();
    await expect(ann.page.getByRole('heading', { name: title })).toBeVisible();
    const link = await inviteLink(ann.page);
    expect(link).toMatch(/\/\?arcade=[0-9a-f-]{36}$/);

    // Bo follows the link; Cy finds the lobby on the arcade page.
    await bo.page.goto(link);
    await bo.page.getByLabel('Your name').fill('Bo');
    await bo.page.getByRole('button', { name: 'Join the lobby' }).click();
    // Bo sees the leader's picker read-only: Ann's choice, no way to change it or start the round.
    await expect(bo.page.getByText('Ann is choosing', { exact: false })).toBeVisible();
    await expect(bo.page.getByRole('button', { name: /Change$/ })).toHaveCount(0);
    await expect(bo.page.getByRole('button', { name: /^Play / })).toHaveCount(0);
    await expect(bo.page.getByRole('status').filter({ hasText: 'Waiting for Ann to start' })).toBeVisible();
    // The players sit behind the avatar button in the bar.
    await ann.page.getByRole('button', { name: 'Players 2' }).click();
    await expect(ann.page.getByRole('dialog', { name: 'Players (2)' })).toContainText('Bo');
    await ann.page.keyboard.press('Escape');

    // Locked: Cy cannot get in until Ann unlocks.
    const lockSwitch = async () => {
      await ann.page.getByRole('button', { name: 'Lobby settings' }).click();
      await ann.page.getByRole('switch', { name: /Lock the lobby/ }).click();
      await ann.page.keyboard.press('Escape');
    };
    await lockSwitch();
    await cy.page.goto(`${baseURL}/?arcade`);
    const card = cy.page.getByRole('listitem').filter({ hasText: title });
    await expect(card).toContainText('locked');
    await expect(card.getByRole('button')).toHaveCount(0);
    await expect(ann.page.getByText('Locked', { exact: true })).toBeVisible();
    await lockSwitch();
    await expect(card.getByRole('button', { name: 'Join' })).toBeEnabled({ timeout: 10_000 });
    await card.getByRole('button', { name: 'Join' }).click();
    await cy.page.getByLabel('Your name').fill('Cy');
    await cy.page.getByRole('button', { name: 'Join the lobby' }).click();
    await expect(ann.page.getByRole('button', { name: 'Players 3' })).toBeVisible();
    expect((await new AxeBuilder({ page: ann.page }).analyze()).violations).toEqual([]);

    // Ann picks Left or right, and the others see her choice change (the lobby checks in every few seconds).
    await pickGame(ann.page, 'Left or right');
    await expect(bo.page.getByRole('form', { name: 'Next round' })).toContainText('Left or right', { timeout: 10_000 });
    // Every phone goes into the round by itself.
    await ann.page.getByRole('button', { name: 'Play Left or right' }).click();
    const players: Page[] = [ann.page, bo.page, cy.page];
    for (const page of players) await expect(page.getByRole('button', { name: 'Got it!' })).toBeVisible({ timeout: 15_000 });
    await expect(bo.page.getByRole('button', { name: 'Leader tools' })).toHaveCount(0);
    for (const page of players) await page.getByRole('button', { name: 'Got it!' }).click();
    await ann.page.getByRole('button', { name: /^Start \(3 of 3 ready\)$/ }).click();
    // While everyone plays, the leader's tools wait in the ☰ menu of the round bar.
    await ann.page.getByRole('button', { name: 'Leader tools' }).click();
    await expect(ann.page.getByRole('button', { name: 'End now and count the results' })).toBeVisible({ timeout: 15_000 });
    await ann.page.keyboard.press('Escape');
    await ann.page.getByRole('button', { name: /Left/ }).click({ timeout: 15_000 });
    await bo.page.getByRole('button', { name: /Left/ }).click({ timeout: 15_000 });
    await cy.page.getByRole('button', { name: /Right/ }).click({ timeout: 15_000 });
    // Everyone answered: the round closes by itself a moment later.
    await ann.page.getByRole('button', { name: 'Show the results' }).click();
    await expect(bo.page.getByText(/Waiting for the leader to go back to the lobby/)).toBeVisible();
    // No screen watches an arcade round: every phone shows everyone's results under its own.
    for (const page of players) {
      const results = page.getByRole('region', { name: 'Round results' });
      await expect(results.getByRole('heading', { name: 'Places' })).toBeVisible();
      for (const name of ['Ann', 'Bo', 'Cy']) await expect(results.getByRole('listitem').filter({ hasText: name })).toHaveCount(1);
    }
    await ann.page.getByRole('button', { name: 'Back to the lobby' }).click();

    // Everyone is back in the lobby with the round's results and the running total.
    for (const page of players) {
      await expect(page.getByRole('button', { name: /Scores$/ })).toBeVisible({ timeout: 15_000 });
      const totals = (await openScores(page)).getByRole('region', { name: 'Total in this lobby' });
      await expect(totals.getByRole('listitem').first()).toContainText(/(Ann|Bo).*10 points · 1 win · 1 played/);
    }
    await expect(cy.page.getByRole('dialog', { name: 'Scores' }).getByRole('region', { name: /Round 1: Left or right/ })).toContainText('Cy');
    // Without opening Scores, the lobby shows the round's top three.
    await cy.page.keyboard.press('Escape');
    await expect(cy.page.getByRole('article', { name: /Round 1: Left or right/ }).getByRole('listitem')).toHaveCount(3);
    await cy.page.screenshot({ path: test.info().outputPath('lobby-after-round.png') });
  } finally { await Promise.all([ann, bo, cy].map(entry => entry.context.close())); }
});

test('the arcade wears the join screen look the owner chose in admin', async ({ browser, page, baseURL }) => {
  const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('region', { name: 'Your games' })).toBeVisible();
  const save = (look: unknown) => page.evaluate(async body => (await fetch('/api/host/site-look', { method: 'POST', headers: { 'x-party-request': '1', 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(), look);
  expect(await save({ theme: { colors: { background: '#123456', accent: '#ff5500' } } })).toMatchObject({ ok: true });
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const arcade = await guest.newPage(); await arcade.goto(`${baseURL}/?arcade`);
    const main = arcade.locator('main.arcade');
    await expect(main).toHaveAttribute('style', /--r-bg1:\s*#123456/);
    await expect(main).toHaveAttribute('style', /--r-accent:\s*#ff5500/);
  } finally { await guest.close(); await save({}); }
});

test('Arcade publishes the full game catalog and plays a pool duel and a TV-only dots round', async ({ page: leader, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Uses separate browser sessions for players and the TV.');
  test.setTimeout(90_000);
  const guest = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
  const tvContext = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
  try {
    const friend = await guest.newPage();
    await leader.goto('/?arcade');
    await leader.getByLabel('Your name').fill('Alex');
    await leader.getByRole('button', { name: 'Open a lobby' }).click();
    await friend.goto(await inviteLink(leader));
    await friend.getByLabel('Your name').fill('Jo');
    await friend.getByRole('button', { name: 'Join the lobby' }).click();
    await expect(leader.getByRole('button', { name: 'Players 2' })).toBeVisible();
    await leader.getByRole('button', { name: /Change$/ }).click();
    const choices = leader.getByRole('dialog', { name: 'Choose a game' });
    await expect(choices.getByRole('group', { name: 'Minigames' }).getByRole('button')).toHaveCount(MINIGAME_KEYS.length);
    await expect(choices.getByRole('group', { name: 'Head-to-head' }).getByRole('button')).toHaveCount(HEAD_TO_HEAD_KEYS.length);
    await choices.getByRole('button', { name: '8-ball pool', exact: true }).click();
    await leader.getByRole('button', { name: 'Play 8-ball pool' }).click();
    await leader.getByRole('button', { name: 'Start duel' }).click();
    await expect(friend.getByRole('img', { name: 'Pool table' })).toBeVisible();
    await friend.getByRole('button', { name: 'Give up', exact: true }).click();
    await friend.getByRole('button', { name: 'Yes, give up' }).click();
    await leader.getByRole('button', { name: 'Back to the lobby' }).click();
    await expect((await openScores(leader)).getByRole('region', { name: 'Round 1: 8-ball pool' })).toContainText(/1\. Alex/);
    await leader.keyboard.press('Escape');

    await pickGame(leader, 'Count the Dots');
    await leader.getByRole('button', { name: 'Play Count the Dots' }).click();
    await expect(friend.getByRole('button', { name: 'Got it!' })).toBeVisible();
    const displayRoute = `${new URL(friend.url()).origin}/api/arcade/rounds/${new URL(friend.url()).searchParams.get('room')}/display`;
    const denied = await friend.request.post(displayRoute, { headers: { 'x-party-request': '1', origin: baseURL! }, data: {} });
    expect(denied.ok()).toBe(false);
    await leader.getByRole('button', { name: 'Set up shared screen' }).click();
    const screen = await tvContext.newPage();
    await screen.goto((await leader.getByRole('link', { name: 'Open shared screen' }).getAttribute('href'))!);
    await friend.getByRole('button', { name: 'Got it!' }).click();
    await leader.getByRole('button', { name: 'Got it!' }).click();
    await leader.getByRole('button', { name: 'Start (2 of 2 ready)' }).click();
    const board = screen.getByRole('img', { name: 'Dot pattern' });
    await expect(board).toBeVisible();
    await expect(friend.getByRole('img', { name: 'Dot pattern' })).toHaveCount(0);
    await expect(leader.getByRole('img', { name: 'Dot pattern' })).toHaveCount(0);
    const guess = friend.getByRole('textbox', { name: 'How many dots?' });
    await guess.fill(String(await board.locator('span').count()));
    await guess.press('Enter');
    await expect(friend.getByText(/Guess saved/)).toBeVisible();
  } finally { await Promise.all([guest.close(), tvContext.close()]); }
});

test('the leader picks a graph from the library, and Play again starts the same game anew for everyone', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Two phones are emulated in separate contexts below.');
  test.setTimeout(120_000);
  const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })).newPage();
  const ann = await phone(); const bo = await phone();
  try {
    await ann.goto(`${baseURL}/?arcade`); await ann.getByLabel('Your name').fill('Ann');
    await ann.getByRole('button', { name: 'Open a lobby' }).click();
    await bo.goto(await inviteLink(ann)); await bo.getByLabel('Your name').fill('Bo'); await bo.getByRole('button', { name: 'Join the lobby' }).click();
    await expect(ann.getByRole('button', { name: 'Players 2' })).toBeVisible({ timeout: 10_000 });

    // Draw the Graph: random from all collections, or one chart (questions only; the answers stay on the server).
    await pickGame(ann, 'Draw the Graph');
    await ann.getByRole('button', { name: /^Graph: Random from all collections/ }).click();
    const sheet = ann.getByRole('dialog', { name: 'Choose a graph' });
    await expect(sheet.getByRole('group', { name: 'Built in' }).getByRole('button', { name: /fictional library/ })).toBeVisible();
    await sheet.getByRole('button', { name: /^Random from all collections/ }).click();
    await expect(bo.getByRole('form', { name: 'Next round' })).toContainText('Random from all collections', { timeout: 10_000 });

    await ann.getByRole('button', { name: 'Play Draw the Graph' }).click();
    for (const page of [ann, bo]) await page.getByRole('button', { name: 'Got it!' }).click({ timeout: 15_000 });
    await ann.getByRole('button', { name: /^Start \(2 of 2 ready\)$/ }).click();
    await ann.getByRole('button', { name: 'Leader tools' }).click();
    await ann.getByRole('button', { name: 'End now and count the results' }).click({ timeout: 15_000 });
    await ann.getByRole('button', { name: 'Show the results' }).click();

    // Play again: both phones go through the lobby straight into round 2, a new room.
    const first = new URL(ann.url()).searchParams.get('room');
    await ann.getByRole('button', { name: 'Play again' }).click();
    for (const page of [ann, bo]) {
      await expect(page.getByRole('button', { name: 'Got it!' })).toBeVisible({ timeout: 20_000 });
      expect(new URL(page.url()).searchParams.get('room')).not.toBe(first);
    }
  } finally { await Promise.all([ann.context().close(), bo.context().close()]); }
});
