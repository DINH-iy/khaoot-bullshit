import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the owner creates a game, sees its problems per scene, publishes it and opens a room for it', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  await expect(mine.getByRole('button', { name: 'Create game' })).toBeVisible();
  const name = `Office party ${Date.now()}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByLabel('Start from').selectOption({ label: 'A copy of Friday Night Chaos' });
  await mine.getByRole('button', { name: 'Create game' }).click();
  await expect(mine).toContainText(`${name}Not published yet · Ready to publish`);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Break the draft the way an editor could (a route option without a connection), then look at the problems.
  const list = await page.request.get(`${baseURL}/api/host/games`, { headers: { 'x-party-request': '1' } });
  const game = (await list.json()).data.find((entry: { title: string }) => entry.title === name);
  const draft = (await (await page.request.get(`${baseURL}/api/host/games/${game.gameId}`, { headers: { 'x-party-request': '1' } })).json()).data;
  const broken = { ...draft.definition, edges: draft.definition.edges.filter((edge: { option?: string }) => edge.option !== 'physical') };
  const saved = await page.request.put(`${baseURL}/api/host/games/${game.gameId}/draft`, { headers: { 'x-party-request': '1', origin: baseURL! }, data: { expectedRevision: 0, definition: broken } });
  expect(saved.status()).toBe(200);
  await page.reload();
  await expect(mine).toContainText('2 problems to fix');
  await expect(mine.getByRole('button', { name: `Publish ${name}` })).toHaveCount(0);
  await mine.getByRole('button', { name: `Show problems in ${name}` }).click();
  const problems = mine.getByRole('list', { name: `Problems in ${name}` });
  await expect(problems).toContainText('Scene “choose”: A route option is not connected to a scene yet.');
  await expect(problems).toContainText('Scene “physical”: Nothing leads to this scene.');

  // Restore it, publish, and play the published version.
  const fixed = await page.request.put(`${baseURL}/api/host/games/${game.gameId}/draft`, { headers: { 'x-party-request': '1', origin: baseURL! }, data: { expectedRevision: 1, definition: draft.definition } });
  expect(fixed.status()).toBe(200);
  await page.reload();
  await mine.getByRole('button', { name: `Publish ${name}` }).click();
  await expect(mine).toContainText('Published version 1 · Ready to publish');
  await mine.getByRole('button', { name: `Open room for ${name}` }).click();
  await expect(page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ })).toBeVisible();
  await expect(page.getByText(`${name} · waiting to start`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
