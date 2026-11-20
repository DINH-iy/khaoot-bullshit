import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the owner groups people in admin and adds a whole group to a room at once', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Admin and hosting are checked on the desktop.');
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const tag = randomUUID().slice(0, 4);
  const [ann, bo, cy] = ['Ann', 'Bo', 'Cy'].map(name => `${name} ${tag}`);
  for (const name of [ann, bo, cy]) expect((await page.request.post(`${baseURL}/api/host/people`, { headers: { 'x-party-request': '1', origin: baseURL! }, data: { name } })).ok()).toBe(true);

  // Admin → People → Groups: make a group and tick who is in it.
  await page.goto(`${baseURL}/?admin=people&tab=groups`);
  await expect(page.getByRole('tab', { name: 'Groups' })).toHaveAttribute('aria-selected', 'true');
  const groupName = `Friday club ${tag}`;
  await page.getByLabel('Name').fill(groupName);
  await page.getByRole('button', { name: 'Make group' }).click();
  const group = page.locator('.group-card').filter({ has: page.getByRole('heading', { name: groupName, exact: true }) });
  await group.getByRole('button', { name: 'Done' }).click();
  await group.getByRole('button', { name: 'Add people' }).click();
  const members = page.getByRole('group', { name: `Who is in ${groupName}` });
  await members.getByRole('searchbox').fill(tag);
  await members.getByLabel(ann).click(); await expect(members.getByLabel(ann)).toBeChecked();
  await members.getByLabel(bo).click(); await expect(members.getByLabel(bo)).toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(group).toContainText('2 people');
  await group.getByRole('button', { name: 'Done' }).click();
  await expect(group).toContainText(`${ann}, ${bo}`);

  // In a room: Add people, tick the group, and both are on the list (Cy is not).
  await page.goto(`${baseURL}/?host=1`);
  await page.getByRole('radio', { name: /Timed quiz/ }).check();
  await page.getByRole('button', { name: 'Open room', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start the game' })).toBeVisible();
  await page.getByRole('button', { name: 'Add people', exact: true }).click();
  // The room's list is the server's: the tick shows once the room has saved it.
  const groupBox = page.locator('.group-picker').getByLabel(new RegExp(groupName));
  await groupBox.click(); await expect(groupBox).toBeChecked();
  const added = page.locator('.expected-list');
  await expect(added).toContainText(ann); await expect(added).toContainText(bo); await expect(added).not.toContainText(cy);
  // Unticking the group takes its members off again.
  await groupBox.click(); await expect(groupBox).not.toBeChecked();
  await expect(page.locator('.expected-list')).toHaveCount(0);
});
