import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the owner makes a role, chooses what it may do, and a person with it gets exactly that', async ({ page, browser, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Roles are set on the desktop.');
  await page.setViewportSize({ width: 1440, height: 900 });
  const headers = { 'x-party-request': '1', origin: baseURL! };
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const tag = randomUUID().slice(0, 6); const roleName = `Quizmaster ${tag}`;

  await page.goto(`${baseURL}/?admin=roles`);
  await page.getByLabel('New role').fill(roleName);
  await page.getByRole('button', { name: 'Add role' }).click();
  const card = page.getByRole('region', { name: `Role ${roleName}` });
  await expect(card).toBeVisible();
  await card.getByRole('checkbox', { name: /Host real rooms/ }).check();
  await expect(page.getByRole('region', { name: `Role ${roleName}` }).getByRole('checkbox', { name: /Host real rooms/ })).toBeChecked();
  expect((await new AxeBuilder({ page }).include('.role-cards').analyze()).violations).toEqual([]);
  if (process.env['TEAM_SHOTS']) await page.screenshot({ path: `${process.env['TEAM_SHOTS']}/roles.png`, fullPage: true });

  // A person with this role may host, but not make games (the role does not allow it).
  const roles = (await (await page.request.get(`${baseURL}/api/host/roles`, { headers })).json()).data.roles as { id: string; name: string }[];
  const roleId = roles.find(role => role.name === roleName)!.id;
  const made = await page.request.post(`${baseURL}/api/host/people`, { headers, data: { name: `Host ${tag}`, roleId } });
  const { key } = (await made.json()).data as { key: string };
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } }); const person = await context.newPage();
  try {
    expect((await person.request.post(`${baseURL}/api/people/claim`, { headers, data: { token: key } })).ok()).toBe(true);
    await person.goto(`${baseURL}/?host=1`);
    await expect(person.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
    await expect(person.getByRole('button', { name: 'New game', exact: true })).toHaveCount(0);
    expect((await person.request.post(`${baseURL}/api/host/games`, { headers, data: { gameId: randomUUID(), title: 'Not allowed', startFrom: null } })).status()).toBe(403);
    // The role cannot be removed while someone has it.
    await page.reload();
    await expect(card).toContainText('1 person');
    await expect(card.getByRole('button', { name: 'Remove role' })).toBeDisabled();
  } finally { await context.close(); }
});
