import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the party votes on a route, the host announces it, and both routes rejoin at the finale', async ({ browser, baseURL }) => {
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext()));
  const [host, ada, ben, cleo, late] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page, Page, Page, Page];
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await host.getByRole('radio', { name: /Friday Night Chaos/ }).check();
    await host.getByRole('button', { name: 'Open room' }).click();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    for (const [phone, name] of [[ada, 'Ada'], [ben, 'Ben'], [cleo, 'Cleo']] as const) {
      await phone.goto(`${baseURL}/?code=${roomCode}`);
      await phone.getByLabel('Your name').fill(name);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(host.getByText(`${name} · connected`, { exact: false })).toBeVisible();
    }
    await host.getByRole('button', { name: 'Start test round' }).click();
    await host.getByRole('button', { name: 'Close stage' }).click();
    await host.getByRole('button', { name: 'Next stage' }).click();

    // The vote: tiles on the phones; the host sees live counts, phones do not (this game shows counts at the announcement).
    await expect(ada.getByRole('heading', { name: 'Choose your challenge!' })).toBeVisible();
    // Pausing does not tell eligible voters they joined too late.
    await host.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(ada.getByText('paused', { exact: false }).first()).toBeVisible();
    await expect(ada.getByText('You joined after voting opened')).toHaveCount(0);
    await host.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    for (const [phone, label] of [[ada, 'Physical'], [ben, 'Physical'], [cleo, 'Music']] as const) {
      await phone.getByRole('radio', { name: label, exact: true }).check();
      await phone.getByRole('button', { name: 'Save answer', exact: true }).click();
      await expect(phone.getByText('Your vote is saved on the server.')).toBeVisible();
    }
    await cleo.reload();
    await expect(cleo.getByText('Your vote is saved on the server.')).toBeVisible();
    const hostRoute = host.getByRole('region', { name: 'Route choice' });
    await expect(hostRoute).toContainText('3 of 3 voted');
    await expect(hostRoute).toContainText('Physical · 2 votes');
    await expect(ada.getByRole('region', { name: 'Route choice' })).not.toContainText('Physical · ');
    // A player who joins during the vote does not vote on it.
    await late.goto(`${baseURL}/?code=${roomCode}`);
    await late.getByLabel('Your name').fill('Late');
    await late.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(late.getByText('You joined after voting opened')).toBeVisible();
    expect((await new AxeBuilder({ page: ada }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);

    await expect(ada.getByText('answers are locked')).toHaveCount(0);
    await host.getByRole('button', { name: 'Close stage' }).click();
    await expect(hostRoute).toContainText('The party goes: Physical (by vote). Reveal to announce it.');
    await expect(ada.getByText('Voting has closed. The host announces the route.')).toBeVisible();
    await host.getByRole('button', { name: 'Announce the route' }).click();
    await expect(ada.getByRole('region', { name: 'Route choice' })).toContainText('The party goes: Physical (by vote).');
    await expect(ada.getByRole('region', { name: 'Route choice' })).toContainText('Physical · 2 votes');
    await host.getByRole('button', { name: 'Next stage' }).click();
    await expect(ada.getByRole('heading', { name: /^Living Sculpture/ })).toBeVisible();
    await host.getByRole('button', { name: 'Close stage' }).click();
    await host.getByRole('button', { name: 'Next stage' }).click();
    await expect(ben.getByRole('heading', { name: /^Shared finale/ })).toBeVisible();
    expect(await ada.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { for (const context of contexts) await context.close().catch(() => undefined); }
});
