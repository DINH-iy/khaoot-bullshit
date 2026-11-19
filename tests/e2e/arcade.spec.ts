import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

if (process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E environment required');

test('the arcade: a guest opens a lobby, friends join by link, the leader locks it and runs a round, and everyone is back with the totals', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const phone = async () => { const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); return { context, page: await context.newPage() }; };
  const [ann, bo, cy] = await Promise.all([phone(), phone(), phone()]);
  try {
    // From the start page into the arcade, and a lobby of one's own.
    await ann.page.goto(`${baseURL}/`);
    await ann.page.getByRole('link', { name: 'Arcade: play minigames with friends' }).click();
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
    await expect(bo.page.getByText('Waiting for Ann to pick a minigame…')).toBeVisible();
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
    await ann.page.getByLabel('Minigame').selectOption({ label: 'Left or right' });
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
