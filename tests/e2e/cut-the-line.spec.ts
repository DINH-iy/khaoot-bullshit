import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { closeRoundsByHand } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Cut the Line takes a whole-percent cut on a phone and reveals its error', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The phone uses a separate narrow touch context.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'Precision night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = {
    formatVersion: 2, title: 'Precision night', startNodeKey: 'cut', edges: [],
    nodes: [{ key: 'cut', stages: [{ key: 'main', kind: 'minigame', prompt: 'Make the cut', game: 'cut-the-line', durationMs: 20_000, countdownSeconds: 1 }] }],
  };
  expect((await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await host.getByRole('button', { name: 'Configure minigame', exact: true }).click();
  const targets = host.getByRole('group', { name: 'Target percentage' });
  await targets.getByRole('button', { name: 'Exact' }).click();
  await host.getByRole('spinbutton', { name: 'Target percentage' }).fill('24');
  await host.getByRole('button', { name: 'Apply changes' }).click();
  await host.getByRole('button', { name: 'Try minigame' }).click();
  const practice = host.getByRole('dialog', { name: 'Preview' });
  const desktop = host.viewportSize()!;
  await host.setViewportSize({ width: 320, height: 568 });
  const idleFrame = await practice.locator('.phone-screen').boundingBox();
  expect(idleFrame!.height).toBeGreaterThan(380);
  await practice.getByRole('button', { name: 'Start practice' }).click();
  const practiceMarker = practice.getByRole('slider', { name: 'Cut position' });
  await expect(practiceMarker).toHaveValue('50');
  await expect(practiceMarker).toHaveClass(/slider-blade/);
  const endpoints = practice.locator('.cut-endpoints span');
  await expect(endpoints).toHaveText(['0%', '100%']);
  expect((await endpoints.first().boundingBox())!.x).toBeLessThan((await endpoints.last().boundingBox())!.x);
  await expect(practice.getByRole('button', { name: 'Lock in cut' })).toBeInViewport({ ratio: 1 });
  await expect(practice.getByRole('button', { name: 'Restart' })).toBeInViewport({ ratio: 1 });
  expect(await practice.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  await expect(practice.getByText('Cut at 24%')).toBeVisible();
  await practice.getByRole('button', { name: 'Lock in cut' }).click();
  await expect(practice.locator('.cut-result')).toContainText('26 percentage points off');
  await expect(practice.locator('.cut-result dd')).toHaveText(['24%', '50%']);
  await expect(practice.getByRole('button', { name: 'Restart' })).toBeInViewport({ ratio: 1 });
  await practice.getByRole('button', { name: 'Close', exact: true }).click();
  await host.setViewportSize(desktop);

  await host.getByRole('tab', { name: 'Look & feel' }).click();
  await host.getByLabel('Change the look of').click();
  await host.getByRole('option', { name: 'The whole game' }).click();
  await host.locator('summary').filter({ hasText: 'Sliders' }).click();
  const sliders = host.getByRole('group', { name: 'Sliders' });
  await expect(sliders.getByRole('button', { name: 'Blade' })).toHaveAttribute('aria-pressed', 'true');
  await sliders.getByRole('button', { name: 'Dial' }).click();
  const dial = host.getByRole('slider', { name: 'Try the dial' });
  await expect(dial).toHaveAttribute('aria-valuetext', '1723');
  await host.getByRole('button', { name: 'Next value' }).click();
  await expect(dial).toHaveAttribute('aria-valuetext', '1724');
  const readDraft = async () => (await (await host.request.get(`${games}/${gameId}`, { headers })).json()).data;
  await expect.poll(async () => (await readDraft()).definition.presentation?.theme?.sliderStyle).toBe('dial');
  const saved = await readDraft();
  expect((await host.request.post(`${games}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);

  const mobile = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  try {
    const phone = await mobile.newPage();
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill('Ada');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await host.getByRole('button', { name: 'Start the game' }).click();
    const marker = phone.getByRole('slider', { name: 'Cut position' });
    await expect(marker).toBeVisible();
    await expect(marker).toHaveClass(/slider-dial/);
    const targetLabel = phone.getByText(/^Cut at \d+%$/);
    await expect(targetLabel).toHaveText('Cut at 24%');
    await expect(host.getByText('Cut at 24%', { exact: true })).toBeVisible();
    await marker.tap({ position: { x: 20, y: 24 } });
    const tapped = Number(await marker.inputValue());
    expect(tapped).toBeLessThan(50);
    await marker.press('ArrowRight');
    await expect(marker).toHaveValue(String(tapped + 1));
    const cut = tapped + 1;
    const difference = Math.abs(cut - 24);
    await phone.getByRole('button', { name: 'Lock in cut' }).tap();
    await expect(phone.getByText(new RegExp(` · ${cut}%$`))).toBeVisible();
    await expect(host.locator('.cut-result')).toHaveCount(0);
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(host.locator('.cut-result dd')).toHaveText(['24%', `${cut}%`]);
    await host.addStyleTag({ content: '.mg-results { width: 350px; max-width: 100%; }' });
    const row = host.locator('.mg-podium li').first();
    await expect(row.locator('.mg-result-name strong')).toHaveText('Ada');
    const namesFit = await row.evaluate(element => {
      const name = element.querySelector('.mg-result-name strong')!;
      const measurement = element.querySelector('.mg-result-measurement')!;
      return name.scrollWidth <= name.clientWidth && measurement.getBoundingClientRect().top >= name.getBoundingClientRect().bottom;
    });
    expect(namesFit).toBe(true);
    const phoneResult = phone.locator('.cut-result');
    await expect(phoneResult.locator('dd')).toHaveText(['24%', `${cut}%`]);
    await expect(phoneResult.locator('p')).toHaveText(difference === 0 ? 'Exact match' : difference === 1 ? '1 percentage point off' : `${difference} percentage points off`);
  } finally {
    await mobile.close();
  }
});
