import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('editors see only their own games and games shared with them; the owner sees every game with who made it', async ({ page, browser, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Editing is checked on the desktop.');
  await page.setViewportSize({ width: 1440, height: 900 });
  const headers = { 'x-party-request': '1', origin: baseURL! };
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const tag = randomUUID().slice(0, 6); const editorName = `Ed ${tag}`;
  const made = await page.request.post(`${baseURL}/api/host/people`, { headers, data: { name: editorName, canEdit: true } });
  const { key } = (await made.json()).data as { key: string };
  // The editor signs in with their personal key in their own browser and makes a game.
  const editorContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } }); const editor = await editorContext.newPage();
  try {
    expect((await editor.request.post(`${baseURL}/api/people/claim`, { headers, data: { token: key } })).ok()).toBe(true);
    const editorGame = `Ed quiz ${tag}`; const ownerGame = `Owner quiz ${tag}`;
    expect((await editor.request.post(`${baseURL}/api/host/games`, { headers, data: { gameId: randomUUID(), title: editorGame, startFrom: null } })).ok()).toBe(true);
    expect((await page.request.post(`${baseURL}/api/host/games`, { headers, data: { gameId: randomUUID(), title: ownerGame, startFrom: null } })).ok()).toBe(true);

    // The owner sees both, the editor's with its maker's name.
    await page.goto(`${baseURL}/?host=1`);
    const mine = page.getByRole('region', { name: 'Your games' });
    await expect(mine.locator('.my-game').filter({ hasText: editorGame })).toContainText(`by ${editorName}`);
    await expect(mine.locator('.my-game').filter({ hasText: ownerGame })).toBeVisible();
    // The editor sees only their own game.
    await editor.goto(`${baseURL}/?host=1`);
    const theirs = editor.getByRole('region', { name: 'Your games' });
    await expect(theirs.locator('.my-game').filter({ hasText: editorGame })).toContainText('by you');
    await expect(theirs.locator('.my-game').filter({ hasText: ownerGame })).toHaveCount(0);

    // The owner shares their game with the editor from the editor's Invite people panel.
    await mine.getByRole('link', { name: `Edit ${ownerGame}` }).click();
    await page.getByRole('button', { name: /^Game menu/ }).click();
    await page.getByRole('menuitem', { name: 'Invite people' }).click();
    const sharing = page.locator('.game-sharing');
    // Shared as Viewer: they may look and rehearse, not change, publish or remove it.
    await sharing.getByLabel(`Role of ${editorName} for this game`).click();
    await page.getByRole('option', { name: 'Viewer' }).click();
    await expect(sharing.getByRole('status')).toHaveText('Saved.');
    expect((await new AxeBuilder({ page }).include('.invite-panel').analyze()).violations).toEqual([]);
    if (process.env['TEAM_SHOTS']) await page.screenshot({ path: `${process.env['TEAM_SHOTS']}/sharing.png` });
    await editor.reload();
    await expect(theirs.locator('.my-game').filter({ hasText: ownerGame })).toContainText('by the owner · shared with you');
    await expect(theirs.locator('.my-game').filter({ hasText: ownerGame }).getByRole('button', { name: /^Remove/ })).toHaveCount(0);
    if (process.env['TEAM_SHOTS']) await editor.screenshot({ path: `${process.env['TEAM_SHOTS']}/editor-games.png` });
    await theirs.getByRole('link', { name: `Edit ${ownerGame}` }).click();
    await expect(editor.getByText('View only', { exact: true })).toBeVisible();
    expect((await editor.request.post(`${baseURL}/api/host/games/${new URL(editor.url()).searchParams.get('edit')}/archive`, { headers, data: {} })).status()).toBe(403);
  } finally { await editorContext.close(); }
});
