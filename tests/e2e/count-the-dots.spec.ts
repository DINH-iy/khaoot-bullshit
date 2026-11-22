import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { closeHostFold, closeRoundsByHand, openHostFold } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Count the Dots shows one pattern on both displays and accepts a guess while the dots are visible', async ({ page: host, browser, baseURL }) => {
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
      durationMs: 12_000, countdownSeconds: 1, settings: { viewSeconds: 6 } }] }],
  };
  expect((await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  const configure = host.getByRole('button', { name: 'Configure minigame', exact: true });
  const configuration = host.getByRole('dialog', { name: 'Configure minigame', exact: true });
  await expect(host.getByLabel('Dot viewing time')).toHaveCount(0);
  await configure.click();
  await expect(configuration.getByLabel('Reveal easing')).toHaveValue('ease-in');
  await configuration.getByRole('button', { name: 'Change minigame…' }).click();
  const picker = configuration.getByRole('dialog', { name: 'Choose the minigame' });
  const pickerViewport = host.viewportSize()!;
  await host.setViewportSize({ width: 1024, height: 600 });
  await picker.getByRole('button', { name: 'Precision', exact: true }).click();
  const selected = picker.getByRole('button', { name: /^Count the Dots Chosen/ });
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  expect(await selected.locator('small').evaluate(description => {
    const foreground = getComputedStyle(description).color;
    return foreground === getComputedStyle(description.closest('button')!).color;
  })).toBe(true);

  await picker.getByRole('button', { name: 'All', exact: true }).click();
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
    await host.setViewportSize(viewport);
    const header = picker.locator('.choice-header');
    const firstCard = picker.locator('.choice-card').first();
    const footer = picker.locator('.choice-footer');
    await expect(firstCard).toBeInViewport({ ratio: 1 });
    await expect(picker.getByRole('button', { name: 'Cancel' })).toBeInViewport({ ratio: 1 });
    const [top, card, bottom] = await Promise.all([header.boundingBox(), firstCard.boundingBox(), footer.boundingBox()]);
    expect(card!.y).toBeGreaterThanOrEqual(top!.y + top!.height);
    expect(bottom!.y).toBeGreaterThanOrEqual(card!.y + card!.height);
    const page = await footer.getByRole('status').textContent();
    await footer.getByRole('button', { name: 'Next' }).click();
    await expect(footer.getByRole('status')).not.toHaveText(page!);
    await footer.getByRole('button', { name: 'Previous' }).click();
    await expect(footer.getByRole('status')).toHaveText(page!);
  }
  await host.setViewportSize(pickerViewport);
  await picker.getByRole('button', { name: 'Speed', exact: true }).click();
  await picker.getByRole('button', { name: /^Speed run/ }).click();
  await configuration.getByRole('button', { name: 'Customize course' }).click();
  const tile = configuration.locator('.phone-screen .speed-run-board > span').nth(4);
  await expect(tile).toHaveClass(/wall/);
  await configuration.getByRole('button', { name: 'Row 1, column 5' }).click();
  await configuration.getByRole('button', { name: 'Apply course' }).click();
  await expect(tile).not.toHaveClass(/wall/);
  const desktop = host.viewportSize()!;
  await host.setViewportSize({ width: 360, height: 640 });
  await configuration.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(tile).toBeVisible();
  await expect(configuration.getByRole('button', { name: 'Apply changes' })).toBeInViewport({ ratio: 1 });
  await configuration.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(configure).toBeFocused();
  await host.setViewportSize(desktop);
  await configure.click();
  await configuration.getByLabel('Reveal easing').selectOption('ease-in-out');
  await expect(host.getByLabel('Dot viewing time')).toHaveValue('6');
  await configuration.getByRole('button', { name: 'Text & timing' }).click();
  await expect(host.getByLabel('Guessing time')).toHaveValue('12');
  await configuration.getByRole('button', { name: 'Settings', exact: true }).click();
  const dotCountOptions = host.getByRole('group', { name: 'Dot count' });
  await dotCountOptions.getByRole('button', { name: 'Random range' }).click();
  const minimum = host.getByRole('spinbutton', { name: 'Minimum' });
  await expect(minimum).toHaveValue('50');
  await expect(host.getByRole('spinbutton', { name: 'Maximum' })).toHaveValue('500');
  await minimum.fill('1');
  await expect(minimum).toHaveValue('1');
  await dotCountOptions.getByRole('button', { name: 'Exact' }).click();
  const dotCount = host.getByRole('spinbutton', { name: 'Dot count' });
  await expect(dotCount).toHaveAttribute('max', '500');
  await dotCount.fill('1');
  await expect(dotCount).toHaveValue('1');
  await dotCount.fill('500');
  await expect(dotCount).toHaveValue('500');
  await dotCount.fill('501');
  await expect(dotCount).toHaveValue('500');
  await dotCount.fill('100');
  await host.getByRole('checkbox', { name: 'Allow slight overlap' }).check();
  await configuration.getByRole('button', { name: 'Apply changes' }).click();
  const readDraft = async () => (await (await host.request.get(`${games}/${gameId}`, { headers })).json()).data;
  await expect.poll(async () => (await readDraft()).definition.nodes[0].stages[0].settings).toMatchObject({
    viewSeconds: 6, count: { mode: 'exact', value: 100 }, allowOverlap: true, revealEasing: 'ease-in-out',
  });
  const saved = await readDraft();
  await host.getByRole('button', { name: 'Try this scene' }).click();
  const practice = host.getByRole('dialog', { name: 'Preview' });
  await practice.getByRole('button', { name: 'Start practice' }).click();
  const practiceBoard = practice.locator('.tv-screen').getByRole('img', { name: 'Dot pattern' });
  await expect(practiceBoard).toBeVisible();
  const practiceCount = 100;
  await expect(practiceBoard.locator('span')).toHaveCount(practiceCount);
  const practiceGuess = practice.getByRole('textbox', { name: 'How many dots?' });
  await expect(practiceGuess).toBeVisible();
  await expect(practiceBoard).toBeVisible();
  await practiceGuess.fill(String(practiceCount));
  await practiceGuess.press('Enter');
  await expect(practice.getByRole('status')).toHaveText(`${practiceCount} dots`);
  await expect(practice.locator('.practice-result')).toHaveText(`${practiceCount} · 0 off`);

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
  await host.setViewportSize({ width: 1024, height: 600 });
  await display.setViewportSize({ width: 960, height: 540 });
  await host.emulateMedia({ reducedMotion: 'no-preference' });
  await display.emulateMedia({ reducedMotion: 'no-preference' });
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
    const guess = phone.getByRole('textbox', { name: 'How many dots?' });
    await expect(board(host)).toBeVisible();
    await expect(board(display)).toBeVisible();
    await expect(board(phone)).toHaveCount(0);
    await expect(board(host)).toBeInViewport({ ratio: 1 });
    await expect(board(display)).toBeInViewport({ ratio: 1 });
    await expect(guess).toBeEnabled();
    await expect(guess).toHaveAttribute('inputmode', 'numeric');
    const positions = (page: typeof host) => board(page).locator('span').evaluateAll(dots => dots.map(dot => dot.getAttribute('style')));
    const dots = await positions(host);
    expect(dots).toHaveLength(100);
    expect(await positions(display)).toEqual(dots);

    await guess.fill(String(dots.length - 1));
    await phone.getByRole('button', { name: 'Lock in count' }).tap();
    await expect(phone.getByText(`Guess saved: ${dots.length - 1}`, { exact: true })).toBeVisible();
    await expect(board(display)).toBeVisible();
    await expect(phone.getByText('Actual count', { exact: true })).toHaveCount(0);
    await expect(board(display)).toHaveCount(0);
    await expect(board(host)).toHaveCount(0);
    await host.getByRole('button', { name: 'Close answers' }).click();
    const progress = await Promise.all([host, display].map(page => page.evaluateHandle(() => {
      const history: number[] = [];
      const observer = new MutationObserver(() => {
        const reveal = document.querySelector('.mg-dot-reveal');
        if (!reveal) return;
        const count = reveal.querySelectorAll('.mg-dot-board > span').length;
        if (history.at(-1) !== count) history.push(count);
        if (reveal.querySelector('[role=status]')) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return history;
    })));
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(display.locator('.mg-dot-reveal')).toBeVisible();
    await expect(display.locator('.mg-podium')).toHaveCount(0);
    for (const page of [host, display]) {
      await expect(board(page)).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.mg-dot-reveal [role=status]')).toHaveText(`${dots.length} dots`);
      expect(await positions(page)).toEqual(dots);
    }
    for (const history of progress) {
      const counts = await history.jsonValue();
      expect(counts[0]).toBe(0);
      expect(counts.at(-1)).toBe(dots.length);
      expect(counts.length).toBeGreaterThan(2);
      expect(counts.every((count, index) => index === 0 || count > counts[index - 1]!)).toBe(true);
    }
    await expect(display.getByText(`${dots.length} dots`, { exact: true })).toBeVisible();
    await expect(display.locator('.mg-podium .first')).toContainText(`${dots.length - 1} · 1 off`);
    const phoneResult = phone.getByRole('region', { name: 'Results', exact: true });
    await expect(phoneResult.getByText('Actual count', { exact: true })).toBeVisible();
    await expect(phoneResult.getByText(String(dots.length), { exact: true })).toBeVisible();
    await expect(phoneResult.getByRole('status')).toContainText('1 off');
    await expect(phoneResult.getByText('Points this round', { exact: true })).toHaveCount(0);
    await expect(board(phone)).toHaveCount(0);
  } finally {
    await mobile.close();
    await display.close();
  }
});
