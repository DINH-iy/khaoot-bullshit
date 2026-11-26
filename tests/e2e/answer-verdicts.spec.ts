import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { closeRoundsByHand } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('the host counts a wrong answer as correct after the reveal, and the player sees it with the points', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Hosted on the desktop.');
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext({ viewport: { width: 390, height: 844 } })]);
  const [host, ada, ben] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page, Page];
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await expect(host.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
    const gameId = randomUUID(); const roomId = randomUUID(); const games = `${baseURL}/api/host/games`;
    const text = JSON.stringify({ title: `Verdicts ${gameId.slice(0, 6)}`, scenes: [
      { id: 'q1', type: 'quiz', question: 'Capital of Australia?', answers: ['Canberra', 'Sidney'], correct: 'Canberra' }] });
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
    for (const [phone, answer] of [[ada, 'Canberra'], [ben, 'Sidney']] as const) {
      await phone.getByRole('radio', { name: answer, exact: true }).check();
      await phone.getByRole('button', { name: 'Save answer', exact: true }).click();
    }
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();

    // "Sidney" was meant as Sydney… and the question was disputed: the host counts Ben's answer as correct.
    await host.getByText('Check the answers (2)').click();
    const checks = host.locator('.answer-checks');
    await expect(checks.locator('.answer-check', { hasText: 'Ben' })).toContainText('✗ wrong');
    await checks.getByRole('button', { name: 'Count as correct: Ben' }).click();
    await expect(checks.locator('.answer-check', { hasText: 'Ben' })).toContainText('✓ counted as correct by you');
    await expect(ben.getByText('The host counted your answer as correct.')).toBeVisible();
    await expect(ben.locator('.results-own')).toContainText('+10');
    expect((await new AxeBuilder({ page: host }).include('.answer-checks').analyze()).violations).toEqual([]);
    if (process.env['TEAM_SHOTS']) { await checks.screenshot({ path: `${process.env['TEAM_SHOTS']}/answer-checks.png` }); await ben.screenshot({ path: `${process.env['TEAM_SHOTS']}/phone-verdict.png` }); }
    // Undo: back to the round's own scoring.
    await checks.getByRole('button', { name: 'Undo: Ben' }).click();
    await expect(checks.locator('.answer-check', { hasText: 'Ben' })).toContainText('✗ wrong');
    await expect(ben.getByText('The host counted your answer as correct.')).toHaveCount(0);
  } finally { for (const context of contexts) await context.close().catch(() => undefined); }
});
