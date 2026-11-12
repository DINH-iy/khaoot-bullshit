import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the host adjusts proposed teams, a captain answers for the team, and team rounds alternate with solo and re-picked teams', async ({ browser, baseURL }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const [host, ada, ben, cleo] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page, Page, Page];
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await host.getByRole('radio', { name: /Team party/ }).check();
    await host.getByRole('button', { name: 'Open room' }).click();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    for (const [phone, name] of [[ada, 'Ada'], [ben, 'Ben'], [cleo, 'Cleo']] as const) {
      await phone.goto(`${baseURL}/?code=${roomCode}`);
      await phone.getByLabel('Your name').fill(name);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(host.getByText(`${name} · connected`, { exact: false })).toBeVisible();
    }
    await host.getByRole('button', { name: 'Start test round' }).click();

    // A random proposal appears everywhere; nobody can answer yet.
    await expect(ada.getByRole('region', { name: 'Team forming' })).toContainText('Teams were drawn at random');
    await expect(ada.getByText('Answers open once the host starts the round')).toBeVisible();
    const forming = host.getByRole('region', { name: 'Team forming' });
    for (const [name, team] of [['Ada', 'Red'], ['Ben', 'Red'], ['Cleo', 'Blue']] as const) {
      await forming.getByLabel(`Team for ${name}`).selectOption({ label: team });
      await expect(forming.getByLabel(`Team for ${name}`)).toHaveValue(team === 'Red' ? '0' : '1');
    }
    await forming.getByRole('button', { name: 'Make Ada captain' }).click();
    await expect(forming).toContainText('captain: Ada');
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page: ada }).analyze()).violations).toEqual([]);
    await forming.getByRole('button', { name: 'Start round with these teams' }).click();

    await expect(ada.getByText('You are in Red with Ben. Captain: you.')).toBeVisible();
    await expect(ben.getByText('Your captain Ada answers for Red.')).toBeVisible();
    await expect(ben.getByRole('button', { name: 'Save answer' })).toHaveCount(0);
    await expect(ada.getByRole('timer', { name: 'Time left' })).toHaveText(/left$/);
    await ada.getByRole('radio', { name: 'Nile', exact: true }).check();
    await ada.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(ben.getByText('Your team’s answer is saved on the server.')).toBeVisible();
    await cleo.getByRole('radio', { name: 'Amazon', exact: true }).check();
    await cleo.getByRole('button', { name: 'Save answer', exact: true }).click();
    await host.getByRole('button', { name: 'Close stage' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(ben.getByRole('region', { name: 'Round results' })).toContainText('Red · 10');
    // "both": Red gets 10 and so do Ada and Ben.
    const scores = ben.getByRole('region', { name: 'Scoreboard' });
    await expect(scores).toContainText('Red · Ada, Ben10');
    await expect(scores).toContainText('Ben (you)10');
    expect((await new AxeBuilder({ page: ben }).analyze()).violations).toEqual([]);

    // Solo override: no teams, everybody answers for themselves.
    await host.getByRole('button', { name: 'Next stage' }).click();
    await expect(ben.getByRole('radio', { name: '8', exact: true })).toBeVisible();
    await expect(ben.getByText('You are in', { exact: false })).toHaveCount(0);
    await host.getByRole('button', { name: 'Close stage' }).click();

    // One against the rest, for this round only, judged per side.
    await host.getByRole('button', { name: 'Next stage' }).click();
    const oneVsRest = host.getByRole('region', { name: 'Team forming' });
    await expect(oneVsRest).toContainText('Teams for this round');
    await expect(oneVsRest).toContainText('Soloist · 1 of 1');
    await oneVsRest.getByRole('button', { name: 'Start round with these teams' }).click();
    await host.getByRole('button', { name: 'Close stage' }).click();
    const judging = host.getByRole('group', { name: 'Judge teams' });
    await judging.getByLabel('Points for Soloist').fill('30');
    await judging.getByRole('button', { name: 'Award' }).first().click();
    await expect(judging).toContainText('Soloist · judged');
    await host.getByRole('button', { name: 'Reveal results' }).click();

    // Players pick new teams themselves.
    await host.getByRole('button', { name: 'Next stage' }).click();
    await expect(cleo.getByRole('region', { name: 'Team forming' })).toContainText('Pick your team.');
    await cleo.getByRole('button', { name: 'Join Red' }).click();
    await expect(cleo.getByRole('button', { name: 'You are in Red' })).toBeVisible();
    await ada.getByRole('button', { name: 'Join Blue' }).click();
    await ben.getByRole('button', { name: 'Join Blue' }).click();
    await expect(host.getByRole('region', { name: 'Team forming' })).toContainText('Ada, Ben');
    await host.getByRole('button', { name: 'Start round with these teams' }).click();
    await expect(cleo.getByText('You are in Red', { exact: false })).toBeVisible();
    for (const page of [host, ada]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { for (const context of contexts) await context.close().catch(() => undefined); }
});
