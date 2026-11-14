import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('a tester points at a button and reports it; the owner finds it with its file in the admin menu', async ({ browser, page, baseURL }) => {
  // Both browser projects share one database: each sends its own report.
  const title = `Join button feels slow (${test.info().project.name})`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Feedback' }).click();
  const panel = page.getByRole('dialog', { name: 'Feedback' });
  await expect(panel).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.feedback-panel').analyze()).violations).toEqual([]);
  await panel.getByRole('radio', { name: 'Something is broken' }).check();
  await panel.getByLabel('What went wrong?').fill(title);
  await panel.getByLabel(/Tell us more/).fill('Took a while after tapping.');

  // Pointing picks the element instead of pressing it: the join form is not sent.
  await panel.getByRole('button', { name: 'Point at something' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Tap or click the thing you mean' })).toBeVisible();
  await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByRole('listitem')).toContainText('JoinScreen@network/room-screen.tsx');
  await panel.getByLabel(/Your name/).fill('Tester Tess');
  await panel.getByRole('button', { name: 'Send' }).click();
  await expect(panel.getByRole('status')).toContainText('Thank you');

  // Players and strangers cannot read reports.
  await page.goto('/?admin');
  await expect(page.getByRole('alert')).toContainText('not signed in as the owner');

  const ownerContext = await browser.newContext(); const owner = await ownerContext.newPage();
  try {
    await owner.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await owner.getByRole('link', { name: 'Admin: feedback from testers' }).click();
    const item = owner.getByRole('listitem').filter({ has: owner.getByRole('heading', { name: title }) });
    await expect(item).toContainText('Tester Tess');
    await expect(item).toContainText('join screen');
    await expect(item).toContainText(/JoinScreen in apps\/web\/src\/network\/room-screen\.tsx:\d+/);
    expect((await new AxeBuilder({ page: owner }).analyze()).violations).toEqual([]);
    await item.getByLabel(`Status of ${title}`).selectOption('planned');
    await owner.reload();
    await expect(owner.getByLabel(`Status of ${title}`)).toHaveValue('planned');
  } finally { await ownerContext.close(); }
});
