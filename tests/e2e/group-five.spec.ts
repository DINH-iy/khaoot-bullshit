import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { chooseOption, closeHostFold, closeRoundsByHand, openHostFold, openPhoneMenu } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Speed run can be played on a phone with a lobby-selected score effect and final reactions', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The playing phone uses a separate narrow touch context.');
  test.setTimeout(70_000);
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const roomId = randomUUID();
  const url = `${baseURL}/api/host/games`;
  const draft = (await (await host.request.post(url, { headers, data: { gameId, title: 'Race night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = {
    formatVersion: 2, title: 'Race night', phoneEffects: true, startNodeKey: 'race', edges: [],
    nodes: [{ key: 'race', stages: [{ key: 'main', kind: 'minigame', prompt: 'Reach the flag', game: 'speed-run', durationMs: 45_000, countdownSeconds: 1 }] }],
  };
  const saved = (await (await host.request.put(`${url}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  expect((await host.request.post(`${url}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);
  await openHostFold(host, 'Room settings');
  await host.getByLabel('Allow player chat').check();
  await closeHostFold(host);

  const mobile = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const phone = await mobile.newPage();
  try {
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill('Ada');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await (await openPhoneMenu(phone)).getByRole('button', { name: 'Settings', exact: true }).click();
    const effects = phone.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(effects.getByRole('button', { name: 'Sound', exact: true })).toBeVisible();
    await chooseOption(effects.getByLabel('Score effect'), 'glow');
    await phone.keyboard.press('Escape');

    await (await openPhoneMenu(phone)).getByRole('button', { name: 'Chat', exact: true }).click();
    const chat = phone.getByRole('dialog', { name: 'Chat', exact: true });
    await chat.getByRole('textbox', { name: 'Message' }).fill('Good race!');
    await chat.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(chat.getByRole('log')).toContainText('Good race!');
    await chat.getByRole('button', { name: /Close/ }).click();
    await expect(chat).toHaveCount(0);

    await host.getByRole('button', { name: 'Start the game' }).click();
    const board = phone.getByRole('img', { name: /Obstacle course/ });
    await expect(board).toHaveAccessibleName('Obstacle course. Row 1, column 1');
    await expect(phone.getByRole('button', { name: 'Left', exact: true })).toHaveCount(0);
    const route = ['Down', 'Down', 'Right', 'Right', 'Down', 'Down', 'Right', 'Right', 'Right', 'Right'];
    for (const [step, direction] of route.entries()) {
      await phone.getByRole('button', { name: direction, exact: true }).click({ timeout: 10_000 });
      const positions = ['2, column 1', '3, column 1', '3, column 2', '3, column 3', '4, column 3', '5, column 3', '5, column 4', '5, column 5', '5, column 6', '5, column 7'];
      await expect(board).toHaveAccessibleName(`Obstacle course. Row ${positions[step]}`);
    }
    await expect(board).toHaveAccessibleName('Obstacle course. Row 5, column 7');
    await expect(phone.getByRole('status').filter({ hasText: /^\d+\.\d{2} s$/ })).toBeVisible();
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(phone.locator('.celebration-glow')).toBeVisible();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(host.getByRole('heading', { name: 'Final scores' })).toBeVisible();
    await (await openPhoneMenu(phone)).getByRole('button', { name: 'React', exact: true }).click();
    await phone.getByRole('button', { name: /Send GG EZ/ }).click();
    await expect(host.locator('.score-reaction')).toHaveText('GG EZ');
    await openHostFold(host, 'Room settings');
    await host.getByText('Chat moderation', { exact: true }).click();
    await host.getByRole('button', { name: 'Show on final scoreboard' }).click();
    await expect(host.locator('.score-reaction')).toHaveText('Good race!');
  } finally { await mobile.close().catch(() => undefined); }
});

test('Dutch editor diagnostics explain an unconnected scene', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The localized problem drawer is inspected on desktop.');
  await page.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const url = `${baseURL}/api/host/games`;
  const draft = (await (await page.request.post(url, { headers, data: { gameId, title: 'Edit warnings', startFrom: 'timed-quiz' } })).json()).data;
  const stage = { key: 'main', kind: 'info', title: 'Info', prompt: 'Info', durationMs: null };
  const definition = { formatVersion: 2, title: 'Edit warnings', startNodeKey: 'one', nodes: [{ key: 'one', stages: [stage] }, { key: 'two', stages: [stage] }], edges: [] };
  expect((await page.request.put(`${url}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  await page.evaluate(() => { localStorage.setItem('party_ui_language', 'nl'); localStorage.setItem('party.editor.problemsOpen', 'true'); });
  await page.goto(`${baseURL}/?edit=${gameId}`);
  const problems = page.locator('.problems-panel');
  await expect(problems).toBeVisible();
  const toggle = problems.locator('.problems-toggle');
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(problems).toContainText('Verbind deze scène met de rest van het spel of verwijder haar.');
});
