import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { closeRoundsByHand, expectPhoneScores } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the host adjusts proposed teams, a captain answers for the team, and team rounds alternate with solo and re-picked teams', async ({ browser, baseURL }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const [host, ada, ben, cleo] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page, Page, Page];
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await host.getByRole('button', { name: 'Open room for Team party' }).click();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    await closeRoundsByHand(host);
    for (const [phone, name] of [[ada, 'Ada'], [ben, 'Ben'], [cleo, 'Cleo']] as const) {
      await phone.goto(`${baseURL}/?code=${roomCode}`);
      await phone.getByLabel('Your name').fill(name);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(host.getByText(`${name} · connected`, { exact: false })).toBeVisible();
    }
    await host.getByRole('button', { name: 'Start the game' }).click();

    // A random proposal appears everywhere; nobody can answer yet.
    await expect(ada.getByRole('region', { name: 'Team forming' })).toContainText('Teams were drawn at random');
    await expect(ada.getByText('Answers open once the host starts the round')).toBeVisible();
    // The Pick teams scene: a coloured column per team. The host taps a player, then the team to put them in.
    const forming = host.getByRole('region', { name: 'Team forming' });
    for (const [name, team] of [['Ada', 'Red'], ['Ben', 'Red'], ['Cleo', 'Blue']] as const) {
      await forming.getByRole('button', { name: new RegExp(`^${name}`) }).click();
      const put = forming.getByRole('button', { name: `Put ${name} in ${team}` });
      if (await put.count()) await put.click(); else await forming.getByRole('button', { name: new RegExp(`^${name}`) }).click();
      await expect(forming.locator('.team-column', { hasText: team })).toContainText(name);
    }
    // Captains can be elected instead: the host switches, and teammates vote on their phones.
    await forming.getByRole('button', { name: 'Elected', exact: true }).click();
    await expect(ben.getByText('Vote for your captain: tap a teammate.')).toBeVisible();
    await expect(ben.getByRole('button', { name: 'Vote for Ben as captain' })).toHaveCount(0);
    await ben.getByRole('button', { name: 'Vote for Ada as captain' }).click();
    await expect(ben.getByText('You vote for Ada.', { exact: false })).toBeVisible();
    await expect(forming).toContainText('captain: Ada');
    await expect(forming.getByLabel('1 votes')).toBeVisible();
    if (process.env['TEAM_SHOTS']) { await ben.setViewportSize({ width: 390, height: 844 }); await ben.screenshot({ path: `${process.env['TEAM_SHOTS']}/phone-vote.png` }); await forming.screenshot({ path: `${process.env['TEAM_SHOTS']}/host-elected.png` }); }
    // Back to assigned: the votes are gone and the host names the captain.
    await forming.getByRole('button', { name: 'Assigned', exact: true }).click();
    await expect(ben.getByText('Vote for your captain: tap a teammate.')).toHaveCount(0);
    await forming.getByRole('button', { name: /^Ada/ }).click();
    await forming.getByRole('button', { name: 'Make Ada captain' }).click();
    await expect(forming).toContainText('captain: Ada');
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page: ada }).analyze()).violations).toEqual([]);
    // Red picks its winning celebration on a phone.
    // On a small phone the whole sheet fits one screen.
    await ben.setViewportSize({ width: 375, height: 667 });
    await ben.getByRole('button', { name: '🎉 Our celebration' }).click();
    const sheet = ben.getByRole('dialog', { name: 'Our celebration' });
    await sheet.getByRole('radio', { name: '🚀' }).click();
    await sheet.getByLabel('Cheer', { exact: true }).fill('GO RED');
    // One "+" tile for an own emoji: typed once, it shows on the tile and is chosen.
    await sheet.getByRole('radio', { name: 'Our own emoji' }).click();
    await sheet.getByLabel('Type or paste an emoji').fill('🦖');
    await sheet.getByRole('button', { name: 'OK' }).click();
    await expect(sheet.getByRole('radio', { name: 'Our own emoji: 🦖' })).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('radio', { name: '🚀' }).click();
    // A team can also upload its own sound (a short recording); it then plays instead of the game's sounds.
    await sheet.locator('input[type=file]').setInputFiles({ name: 'cheer.mp3', mimeType: 'audio/mpeg', buffer: Buffer.concat([Buffer.from('ID3'), Buffer.alloc(400, 1)]) });
    await expect(sheet.getByRole('radio', { name: 'Our own sound' })).toHaveAttribute('aria-checked', 'true');
    const fits = await sheet.evaluate(element => { const box = element.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight + 1 && [element, ...element.querySelectorAll('*')].every(node => node.scrollHeight <= node.clientHeight + 1 || getComputedStyle(node).overflowY === 'visible' || getComputedStyle(node).overflowY === 'hidden'); });
    expect(fits).toBe(true);
    if (process.env['TEAM_SHOTS']) await ben.screenshot({ path: `${process.env['TEAM_SHOTS']}/own-sound.png` });
    await sheet.getByRole('radio', { name: 'Air horn' }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(host.locator('.team-celebration-summary')).toContainText('🚀 GO RED');
    await ben.setViewportSize({ width: 1280, height: 720 });
    await host.getByRole('button', { name: 'Start round with these teams' }).click();

    // A player's team is a coloured flag in the round bar; the (i) says who is in it.
    await expect(ada.locator('.team-flag')).toContainText('Your team: Red');
    await ada.getByRole('button', { name: 'About this round' }).click();
    await expect(ada.getByRole('dialog', { name: 'About this round' })).toContainText('You are in Red with Ben. Captain: you.');
    await ada.keyboard.press('Escape');
    // The teams are set: the host moves on to the first round, played in them.
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(ben.getByText('Your captain Ada answers for Red.')).toBeVisible();
    await expect(ben.getByRole('button', { name: 'Save answer' })).toHaveCount(0);
    await expect(ada.getByRole('timer', { name: 'Time left' })).toHaveText(/left$/);
    await ada.getByRole('radio', { name: 'Nile', exact: true }).check();
    await ada.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(ben.getByText('Your team’s answer is in!')).toBeVisible();
    await cleo.getByRole('radio', { name: 'Amazon', exact: true }).check();
    await cleo.getByRole('button', { name: 'Save answer', exact: true }).click();
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(ben.getByRole('region', { name: 'Round results' })).toContainText('Red · 10');
    // Red won the round: its celebration shows on the host's screen (no shared screen here) and on Red's phones.
    await expect(host.locator('.team-celebration')).toContainText('Red wins!');
    await expect(host.locator('.team-celebration')).toContainText('GO RED');
    await expect(ben.locator('.team-celebration')).toContainText('Red wins!');
    await expect(cleo.locator('.team-celebration')).toHaveCount(0);
    if (process.env['TEAM_SHOTS']) await host.screenshot({ path: `${process.env['TEAM_SHOTS']}/celebration.png` });
    // "both": Red gets 10 and so do Ada and Ben.
    await expectPhoneScores(ben, 'Red · Ada, Ben10');
    await expectPhoneScores(ben, 'Ben (you)10');
    expect((await new AxeBuilder({ page: ben }).analyze()).violations).toEqual([]);

    // Solo override: no teams, everybody answers for themselves.
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(ben.getByRole('radio', { name: '8', exact: true })).toBeVisible();
    await expect(ben.locator('.team-flag')).toHaveCount(0);
    await host.getByRole('button', { name: 'Close answers' }).click();

    // One against the rest, for this round only, judged per side.
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    const oneVsRest = host.getByRole('region', { name: 'Team forming' });
    await expect(oneVsRest).toContainText('Teams for this round');
    await expect(oneVsRest).toContainText('Soloist · 1 of 1');
    await host.getByRole('button', { name: 'Start round with these teams' }).click();
    await host.getByRole('button', { name: 'Close answers' }).click();
    const judging = host.getByRole('group', { name: 'Judge teams' });
    await judging.getByLabel('Points for Soloist').fill('30');
    await judging.getByRole('button', { name: 'Award' }).first().click();
    await expect(judging).toContainText('Soloist · judged');
    await host.getByRole('button', { name: 'Reveal results' }).click();

    // Players pick new teams themselves.
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(cleo.getByRole('region', { name: 'Team forming' })).toContainText('Pick your team.');
    await cleo.getByRole('button', { name: 'Join Red' }).click();
    await expect(cleo.getByRole('button', { name: 'You are in Red' })).toBeVisible();
    await ada.getByRole('button', { name: 'Join Blue' }).click();
    await ben.getByRole('button', { name: 'Join Blue' }).click();
    const blue = host.getByRole('region', { name: 'Team forming' }).locator('.team-column', { hasText: 'Blue' });
    await expect(blue).toContainText('Ada'); await expect(blue).toContainText('Ben');
    await host.getByRole('button', { name: 'Start round with these teams' }).click();
    await expect(cleo.locator('.team-flag')).toContainText('Red');
    for (const page of [host, ada]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { for (const context of contexts) await context.close().catch(() => undefined); }
});
