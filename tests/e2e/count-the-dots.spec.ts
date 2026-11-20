import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { closeHostFold, closeRoundsByHand, openHostFold } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Count the Dots shows one pattern on both displays and opens the phone field after it disappears', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The phone uses a separate narrow touch context.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'Dot night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = {
    formatVersion: 2, title: 'Dot night', startNodeKey: 'dots', edges: [],
    nodes: [{ key: 'dots', stages: [{ key: 'main', kind: 'minigame', prompt: 'Count carefully', game: 'count-the-dots',
      durationMs: 12_000, countdownSeconds: 1, settings: { viewSeconds: 4 } }] }],
  };
  const saved = (await (await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await expect(host.getByLabel('Dot viewing time')).toHaveValue('4');
  await expect(host.getByLabel('Guessing time')).toHaveValue('12');
  await host.getByRole('button', { name: 'Try minigame' }).click();
  const practice = host.getByRole('dialog', { name: 'Preview' });
  await practice.getByRole('button', { name: 'Start practice' }).click();
  const practiceBoard = practice.locator('.tv-screen').getByRole('img', { name: 'Dot pattern' });
  await expect(practiceBoard).toBeVisible();
  const practiceCount = await practiceBoard.locator('span').count();
  const practiceGuess = practice.getByRole('spinbutton', { name: 'How many dots?' });
  await expect(practiceGuess).toBeVisible();
  await expect(practiceBoard).toHaveCount(0);
  await practiceGuess.fill(String(practiceCount));
  await practiceGuess.press('Enter');
  await expect(practice.getByRole('status')).toHaveText(`${practiceCount} dots · ${practiceCount} · 0 off`);

  expect((await host.request.post(`${games}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);
  await openHostFold(host, 'Shared screen');
  await host.getByRole('button', { name: 'Create display link' }).click();
  const href = (await host.getByRole('link', { name: 'Open shared display' }).getAttribute('href'))!;
  await closeHostFold(host);
  const display = await host.context().newPage();
  const mobile = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  try {
    await display.goto(href);
    await expect(display.getByRole('heading', { name: `Room ${code}` })).toBeVisible();
    const phone = await mobile.newPage();
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill('Ada');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(host.getByText('Ada', { exact: true }).first()).toBeVisible();
    await host.getByRole('button', { name: 'Start the game' }).click();

    const board = (page: typeof host) => page.getByRole('img', { name: 'Dot pattern' });
    const guess = phone.getByRole('spinbutton', { name: 'How many dots?' });
    await expect(board(host)).toBeVisible();
    await expect(board(display)).toBeVisible();
    await expect(board(phone)).toHaveCount(0);
    await expect(guess).toHaveCount(0);
    const positions = (page: typeof host) => board(page).locator('span').evaluateAll(dots => dots.map(dot => dot.getAttribute('style')));
    const dots = await positions(host);
    expect(dots.length).toBeGreaterThan(0);
    expect(await positions(display)).toEqual(dots);

    await expect(guess).toBeVisible();
    await expect(board(display)).toHaveCount(0);
    await expect(board(host)).toHaveCount(0);
    await expect(board(phone)).toHaveCount(0);
    await guess.fill(String(dots.length - 1));
    await phone.getByRole('button', { name: 'Save answer' }).tap();
    await expect(phone.getByText(`Guess saved: ${dots.length - 1}`, { exact: true })).toBeVisible();
    await expect(phone.getByText(`${dots.length} dots`, { exact: true })).toHaveCount(0);
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(display.getByText(`${dots.length} dots`, { exact: true })).toBeVisible();
    await expect(display.locator('.mg-podium .first')).toContainText(`${dots.length - 1} · 1 off`);
    await expect(board(phone)).toHaveCount(0);
  } finally {
    await mobile.close();
    await display.close();
  }
});
