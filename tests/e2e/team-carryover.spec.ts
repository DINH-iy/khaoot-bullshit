import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { closeRoundsByHand } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('teams made again start with the points the host types, and the end show crowns the winning team', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Hosted on the desktop.');
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext()));
  const [host, ada, ben] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page, Page];
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
    const gameId = randomUUID(); const roomId = randomUUID(); const games = `${baseURL}/api/host/games`;
    const text = JSON.stringify({ title: `Carry ${gameId.slice(0, 6)}`, awards: ['teamWinner', 'winner'], scenes: [
      { id: 't1', type: 'pick-teams', teams: 2, how: 'host', next: 'q1' },
      { id: 'q1', type: 'quiz', question: 'Longest river?', answers: ['Nile', 'Rhine'], correct: 'Nile', inTeams: true, next: 't2' },
      { id: 't2', type: 'pick-teams', teams: 2, how: 'host', scores: 'manual', next: 'q2' },
      { id: 'q2', type: 'quiz', question: 'Highest mountain?', answers: ['Everest', 'Vaalserberg'], correct: 'Everest', inTeams: true },
    ] });
    expect((await host.request.post(`${games}/import`, { headers, data: { gameId, text } })).ok()).toBe(true);
    const draft = (await (await host.request.get(`${games}/${gameId}`, { headers })).json()).data;
    expect((await host.request.post(`${games}/${gameId}/publish`, { headers, data: { expectedRevision: draft.revision } })).ok()).toBe(true);
    expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
    await host.goto(`${baseURL}/?room=${roomId}`);
    const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    await closeRoundsByHand(host);
    for (const [phone, name] of [[ada, 'Ada'], [ben, 'Ben']] as const) {
      await phone.goto(`${baseURL}/?code=${code}`);
      await phone.getByLabel('Your name').fill(name);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(host.getByText(`${name} · connected`, { exact: false })).toBeVisible();
    }
    await host.getByRole('button', { name: 'Start the game' }).click();
    const place = async (forming: ReturnType<Page['getByRole']>, name: string, team: string) => {
      await forming.getByRole('button', { name: new RegExp(`^${name}`) }).click();
      const put = forming.getByRole('button', { name: `Put ${name} in ${team}` });
      if (await put.count()) await put.click(); else await forming.getByRole('button', { name: new RegExp(`^${name}`) }).click();
      await expect(forming.locator('.team-column', { hasText: team })).toContainText(name);
    };
    let forming = host.getByRole('region', { name: 'Team forming' });
    await place(forming, 'Ada', 'Red'); await place(forming, 'Ben', 'Blue');
    await host.getByRole('button', { name: 'Start round with these teams' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await ada.getByRole('radio', { name: 'Nile', exact: true }).check();
    await ada.getByRole('button', { name: 'Save answer', exact: true }).click();
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();

    // Teams again: the host types what each team starts with; the phones see it too.
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    forming = host.getByRole('region', { name: 'Team forming' });
    await expect(forming).toContainText('Type the points each team starts with.');
    await place(forming, 'Ada', 'Red'); await place(forming, 'Ben', 'Blue');
    const blueStart = forming.getByLabel('Points Blue starts with');
    await blueStart.fill('25'); await blueStart.press('Enter');
    await expect(ben.getByRole('region', { name: 'Team forming' })).toContainText('Starts with 25 points');
    expect((await new AxeBuilder({ page: host }).include('.team-forming').analyze()).violations).toEqual([]);
    if (process.env['TEAM_SHOTS']) await forming.screenshot({ path: `${process.env['TEAM_SHOTS']}/start-totals.png` });
    await host.getByRole('button', { name: 'Start round with these teams' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await ada.getByRole('radio', { name: 'Everest', exact: true }).check();
    await ada.getByRole('button', { name: 'Save answer', exact: true }).click();
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();

    // Blue's typed 25 beats Red's 10 from this round: Blue wins the game.
    await host.getByRole('button', { name: /^(Next|Finish|End the game)/ }).first().click();
    const finale = ben.getByRole('region', { name: 'The awards' });
    await expect(finale.locator('.finale-stat')).toHaveText('Winning team');
    await expect(finale.locator('.finale-team')).toHaveText('Blue');
    await expect(finale).toContainText('Ben');
    await expect(finale).toContainText('25 points');
    expect((await new AxeBuilder({ page: ben }).include('.finale').analyze()).violations).toEqual([]);
    if (process.env['TEAM_SHOTS']) { await ben.setViewportSize({ width: 390, height: 844 }); await ben.screenshot({ path: `${process.env['TEAM_SHOTS']}/finale-team.png` }); }
  } finally { for (const context of contexts) await context.close().catch(() => undefined); }
});
