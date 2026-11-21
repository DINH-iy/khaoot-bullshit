import { chooseOption } from './helpers.js';
import { randomUUID } from 'node:crypto';
import { HEAD_TO_HEAD_KEYS, MINIGAME_KEYS } from '@party/contracts';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

if (process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E environment required');

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
  const invite = page.getByRole('region', { name: 'Invite players' });
  const url = (await invite.getByRole('link').textContent())!;
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
    await expect(friend.getByRole('heading', { name: 'Players (2)' })).toBeVisible();
    await page.getByText('Lobby password · On', { exact: true }).click();
    await page.getByRole('button', { name: 'Remove password' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Lobby password removed' })).toBeVisible();
    await expect(invite.getByText('Share the password', { exact: false })).toHaveCount(0);
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
    const link = (await ann.page.getByRole('region', { name: 'Invite players' }).getByRole('link').textContent())!;
    expect(link).toMatch(/\/\?arcade=[0-9a-f-]{36}$/);

    // Bo follows the link; Cy finds the lobby on the arcade page.
    await bo.page.goto(link);
    await bo.page.getByLabel('Your name').fill('Bo');
    await bo.page.getByRole('button', { name: 'Join the lobby' }).click();
    await expect(bo.page.getByText('Waiting for Ann to pick a game…')).toBeVisible();
    await expect(ann.page.getByRole('region', { name: /Players \(2\)/ })).toContainText('Bo');

    // Locked: Cy cannot get in until Ann unlocks.
    await ann.page.getByRole('button', { name: 'Open: lock' }).click();
    await cy.page.goto(`${baseURL}/?arcade`);
    const card = cy.page.getByRole('listitem').filter({ hasText: title });
    await expect(card.getByRole('button', { name: 'Locked' })).toBeDisabled();
    await ann.page.getByRole('button', { name: 'Locked: unlock' }).click();
    await expect(card.getByRole('button', { name: 'Join' })).toBeEnabled({ timeout: 10_000 });
    await card.getByRole('button', { name: 'Join' }).click();
    await cy.page.getByLabel('Your name').fill('Cy');
    await cy.page.getByRole('button', { name: 'Join the lobby' }).click();
    await expect(ann.page.getByRole('region', { name: /Players \(3\)/ })).toBeVisible();
    expect((await new AxeBuilder({ page: ann.page }).analyze()).violations).toEqual([]);

    // Ann picks Left or right; every phone goes into the round by itself.
    await chooseOption(ann.page.getByRole('combobox', { name: 'Game', exact: true }), { label: 'Left or right' });
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
    await ann.page.getByRole('button', { name: 'Back to the lobby' }).click();

    // Everyone is back in the lobby with the round's results and the running total.
    for (const page of players) {
      const totals = page.getByRole('region', { name: 'Total in this lobby' });
      await expect(totals).toBeVisible({ timeout: 15_000 });
      await expect(totals.getByRole('listitem').first()).toContainText(/(Ann|Bo).*10 points · 1 win · 1 played/);
    }
    await expect(cy.page.getByRole('region', { name: /Round 1: Left or right/ })).toContainText('Cy');
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
    const invite = leader.getByRole('region', { name: 'Invite players' });
    await friend.goto((await invite.getByRole('link').textContent())!);
    await friend.getByLabel('Your name').fill('Jo');
    await friend.getByRole('button', { name: 'Join the lobby' }).click();
    await expect(leader.getByRole('heading', { name: 'Players (2)' })).toBeVisible();
    const picker = leader.getByRole('combobox', { name: 'Game', exact: true });
    await picker.click();
    await expect(leader.getByRole('group', { name: 'Minigames' }).getByRole('option')).toHaveCount(MINIGAME_KEYS.length);
    await expect(leader.getByRole('group', { name: 'Head-to-head' }).getByRole('option')).toHaveCount(HEAD_TO_HEAD_KEYS.length);
    await expect(leader.getByRole('option', { name: '8-ball pool', exact: true })).toHaveCount(1);
    await leader.getByRole('option', { name: '8-ball pool', exact: true }).click();
    await leader.getByRole('button', { name: 'Play 8-ball pool' }).click();
    await leader.getByRole('button', { name: 'Start duel' }).click();
    await expect(friend.getByRole('img', { name: 'Pool table' })).toBeVisible();
    await friend.getByRole('button', { name: 'Give up', exact: true }).click();
    await friend.getByRole('button', { name: 'Yes, give up' }).click();
    await leader.getByRole('button', { name: 'Back to the lobby' }).click();
    await expect(leader.getByRole('region', { name: 'Round 1: 8-ball pool' })).toContainText(/1\. Alex/);

    await chooseOption(picker, 'count-the-dots');
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
