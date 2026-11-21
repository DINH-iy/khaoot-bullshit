import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { GRAPH_SAMPLES } from '@party/contracts';
import { closeHostFold, closeRoundsByHand, openHostFold } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('players finish the same graph in their own colors and the host reveals all guesses together', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'One player uses a separate touch context.');
  await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'Graph night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = {
    formatVersion: 2, title: 'Graph night', startNodeKey: 'graph', edges: [],
    nodes: [{ key: 'graph', stages: [{ key: 'main', kind: 'minigame', prompt: 'Draw the Graph', game: 'draw-the-graph',
      countdownSeconds: 0, durationMs: 60_000, settings: { graph: { visible: [16, 30, 50], hidden: [50, 50] } } }] }],
  };
  expect((await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await host.getByRole('button', { name: 'Configure minigame', exact: true }).click();
  const configuration = host.getByRole('dialog').filter({ has: host.getByRole('button', { name: 'Text & timing' }) });
  await expect(configuration.getByLabel('Reveal easing')).toHaveValue('ease-in');
  await configuration.getByLabel('Reveal easing').selectOption('ease-out');
  await expect(host.getByRole('checkbox', { name: 'Use my own graph' })).toBeChecked();
  await expect(host.getByLabel('Hidden values')).toHaveValue('50, 50');
  await configuration.getByRole('button', { name: 'Apply changes' }).click();
  const importData = host.getByRole('button', { name: 'Import graph data', exact: true });
  await importData.press('Space');
  await expect(configuration.getByRole('heading', { name: 'Choose a data source' })).toBeFocused();
  await expect(configuration.getByRole('button', { name: 'Start practice' })).toBeHidden();
  await configuration.getByRole('button', { name: 'Paste data', exact: true }).click();
  const pastedData = configuration.getByLabel('Paste CSV or spreadsheet cells');
  const previewPasted = configuration.getByRole('button', { name: 'Preview pasted data' });
  await pastedData.fill('Year,Views\n2010,100');
  await previewPasted.click();
  await expect(configuration.getByRole('alert')).toContainText('Could not read');
  await pastedData.fill('Year\tViews\tClicks\n2010\t100\t1\n2011\t250\t2\n2012\t350\t3\n2013\t500\t4');
  await previewPasted.click();
  await expect(configuration.getByRole('heading', { name: 'Review imported graph' })).toBeFocused();
  await expect(configuration.getByRole('img', { name: 'Review imported graph' })).toBeVisible();
  await configuration.getByRole('combobox', { name: 'Value column' }).selectOption({ label: 'Clicks' });
  const desktop = host.viewportSize()!;
  await host.setViewportSize({ width: 320, height: 568 });
  await expect(configuration.getByRole('button', { name: 'Use this data' })).toBeInViewport({ ratio: 1 });
  await host.setViewportSize(desktop);
  await configuration.getByRole('button', { name: 'Change data' }).click();
  await expect(pastedData).toHaveValue(/Year\tViews/);
  await configuration.getByRole('button', { name: 'Chart link' }).click();
  const sourceUrl = 'https://ourworldindata.org/grapher/life-expectancy';
  const csv = ['entity,code,year,life_expectancy',
    ...[2000, 2001, 2002, 2003, 2004].flatMap((year, index) => [`Netherlands,NLD,${year},${index + 70}`, `Belgium,BEL,${year},${index + 60}`]),
  ].join('\n');
  await host.route('**/api/host/graph-import', route => route.fulfill({ json: { ok: true, data: {
    csv, sourceUrl, metadata: { chart: { title: 'Life expectancy' }, columns: { life_expectancy: { unit: 'years', citationShort: 'Example provider' } } },
  } } }));
  await host.getByLabel('Our World in Data chart URL').fill(sourceUrl);
  await host.getByRole('button', { name: 'Preview chart from URL' }).click();
  await host.getByRole('combobox', { name: 'Value column' }).selectOption({ label: 'Belgium' });
  await host.getByRole('button', { name: 'Use this data' }).click();
  await expect(host.getByRole('link', { name: 'Open original data source' })).toHaveAttribute('href', sourceUrl);
  await configuration.getByRole('button', { name: 'Text & timing' }).click();
  const question = configuration.getByRole('textbox', { name: 'Question', exact: true });
  await expect(question).toHaveValue('Life expectancy — how did it change for Belgium?');
  await question.fill('How many views did the video get each year?');
  await configuration.getByRole('button', { name: 'Import graph data' }).click();
  await configuration.getByRole('button', { name: 'CSV file' }).click();
  await configuration.getByLabel('Upload CSV').setInputFiles({ name: 'views.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Year,Views\n2010,100\n2011,250\n2012,750\n2013,750\n2014,750') });
  const cut = host.getByRole('slider', { name: 'Last visible period', exact: false });
  await expect(cut).toHaveAttribute('aria-valuetext', '2012');
  await host.getByRole('button', { name: 'Previous value' }).click();
  await expect(cut).toHaveAttribute('aria-valuetext', '2011');
  await cut.press('ArrowRight');
  await host.getByRole('button', { name: 'Use this data' }).click();
  await host.getByLabel('Data source (shown at reveal)').fill('Example views dataset');
  await configuration.getByRole('button', { name: 'Apply changes' }).click();
  const readDraft = async () => (await (await host.request.get(`${games}/${gameId}`, { headers })).json()).data;
  await expect.poll(async () => (await readDraft()).definition.nodes[0].stages[0].settings).toMatchObject({
    revealEasing: 'ease-out', graph: { scale: { min: 0, max: 800 }, splitLabel: '2012', source: 'Example views dataset' },
  });
  await host.getByRole('button', { name: 'Try this scene' }).click();
  const practice = host.getByRole('dialog', { name: 'Preview' });
  await host.setViewportSize({ width: 320, height: 568 });
  await practice.getByRole('button', { name: 'Start practice' }).click();
  const submit = practice.getByRole('button', { name: 'Lock in line' });
  const restart = practice.getByRole('button', { name: 'Restart' });
  const graphController = practice.locator('.graph-controller');
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [667, 375]] as const) {
    await host.setViewportSize({ width, height });
    await expect(graphController).toBeInViewport({ ratio: 1 });
    await expect(submit).toBeInViewport({ ratio: 1 });
    await expect(restart).toBeInViewport({ ratio: 1 });
    expect(await practice.evaluate(element => element.scrollHeight - element.clientHeight), `${width} × ${height} vertical overflow`).toBe(0);
  }
  for (let step = 0; step < GRAPH_SAMPLES; step++) await graphController.press('ArrowRight');
  await submit.click();
  await expect(practice.getByRole('status')).toContainText('average error');
  await expect(practice.getByRole('status')).toHaveCSS('font-size', '18px');
  await expect(restart).toBeInViewport({ ratio: 1 });
  await practice.getByRole('button', { name: 'Close', exact: true }).click();
  await host.setViewportSize(desktop);
  const saved = await readDraft();
  expect((await host.request.post(`${games}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);
  await openHostFold(host, 'Shared screen');
  await host.getByRole('button', { name: 'Create display link' }).click();
  const displayUrl = (await host.getByRole('link', { name: 'Open shared display' }).getAttribute('href'))!;
  await closeHostFold(host);
  const display = await host.context().newPage();
  await display.emulateMedia({ reducedMotion: 'no-preference' });
  await display.goto(displayUrl);
  await expect(display.getByRole('heading', { name: `Room ${code}` })).toBeVisible();

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 720 }, isMobile: true, hasTouch: true });
  const keyboardContext = await browser.newContext({ viewport: { width: 320, height: 720 } });
  try {
    const touchPhone = await touchContext.newPage();
    const keyboardPhone = await keyboardContext.newPage();
    const phones = [[touchPhone, 'Ada'], [keyboardPhone, 'Sam']] as const;
    await Promise.all(phones.map(async ([phone, name]) => {
      await phone.goto(`${baseURL}/?code=${code}`);
      await phone.getByLabel('Your name').fill(name);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(phone.getByRole('heading', { name: 'You’re in!' })).toBeVisible();
    }));
    await host.getByRole('button', { name: 'Start the game' }).click();
    const drawing = (phone: typeof touchPhone) => phone.getByRole('group', { name: 'Partial line graph' });
    await expect(drawing(touchPhone)).toBeVisible();
    await expect(drawing(keyboardPhone)).toBeVisible();
    for (const page of [host, touchPhone, keyboardPhone]) {
      await expect(page.getByRole('heading', { name: 'How many views did the video get each year?' })).toBeVisible();
    }
    const path = (page: typeof host) => page.locator('.graph-past').evaluate((line: SVGPolylineElement) => {
      const cutoff = line.ownerSVGElement!.querySelector<SVGLineElement>('.graph-boundary')!;
      const top = cutoff.y1.baseVal.value;
      const bottom = cutoff.y2.baseVal.value;
      return Array.from(line.points, ({ x, y }) => [x, Math.round((bottom - y) / (bottom - top) * 100)]);
    });
    expect(await path(touchPhone)).toEqual(await path(keyboardPhone));
    expect(await path(host)).toEqual(await path(touchPhone));
    for (const phone of [touchPhone, keyboardPhone]) {
      const size = (await phone.locator('.graph-chart').boundingBox())!;
      expect(size.width).toBeGreaterThan(phone.viewportSize()!.width * .94);
      expect(size.height).toBeGreaterThan(size.width * .75);
      const clear = (await phone.getByRole('button', { name: 'Clear line' }).boundingBox())!;
      const submit = (await phone.getByRole('button', { name: 'Lock in line' }).boundingBox())!;
      expect(submit.y).toBe(clear.y);
      expect(submit.x + submit.width).toBeLessThanOrEqual(phone.viewportSize()!.width);
    }
    await expect(host.locator('[data-graph-answer]')).toHaveCount(0);
    await expect(host.getByText('Example views dataset', { exact: true })).toHaveCount(0);
    await expect(drawing(touchPhone).getByRole('button', { name: /colou?r/i })).toHaveCount(0);

    const lockTouch = touchPhone.getByRole('button', { name: 'Lock in line' });
    await expect(lockTouch).toBeDisabled();
    const area = (await touchPhone.locator('.graph-draw-area').boundingBox())!;
    const cd = await touchContext.newCDPSession(touchPhone);
    const start = { x: Math.round(area.x + area.width * .06), y: Math.round(area.y + area.height * (1 - 750 / 800)) };
    await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (const fraction of [.25, .5, .75, 1]) {
      await cd.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(area.x + fraction * area.width), y: start.y }] });
    }
    await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cd.detach();
    await expect(touchPhone.locator('.graph-reading')).toContainText('2014');
    await expect(touchPhone.locator('.graph-reading')).toContainText('Views');
    await expect(lockTouch).toBeEnabled();
    await lockTouch.tap();
    await expect(touchPhone.getByText('Line saved')).toBeVisible();
    await expect(host.locator('[data-graph-trace]')).toHaveCount(0);
    await expect(keyboardPhone.locator('[data-graph-trace]')).toHaveCount(0);

    const keys = drawing(keyboardPhone);
    for (let i = 0; i < 4; i++) await keys.press('ArrowUp');
    for (let i = 0; i < 24; i++) await keys.press('ArrowRight');
    await keyboardPhone.getByRole('button', { name: 'Lock in line' }).click();
    await expect(keyboardPhone.getByText('Line saved')).toBeVisible();
    const adaColor = await touchPhone.locator('[data-graph-trace]').getAttribute('stroke');
    const samColor = await keyboardPhone.locator('[data-graph-trace]').getAttribute('stroke');
    expect(adaColor).not.toBe(samColor);

    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.emulateMedia({ reducedMotion: 'no-preference' });
    await host.getByRole('button', { name: 'Reveal results' }).click();
    await expect(host.getByRole('img', { name: 'Actual line and player guesses' })).toBeVisible();
    await expect(host.locator('[data-graph-answer]')).toHaveCount(1);
    await expect(host.getByText('Example views dataset', { exact: true })).toBeVisible();
    await expect(host.locator('[data-graph-trace]')).toHaveCount(2);
    const revealedLines = host.locator('.graph-reveal-lines');
    await expect(revealedLines.locator('[data-graph-answer], [data-graph-trace]')).toHaveCount(3);
    const widths = await host.locator('.graph-reveal-sweep').evaluate(async (rect: SVGRectElement) => {
      const animation = rect.getAnimations()[0]!;
      animation.pause();
      await animation.ready;
      const widthAt = (time: number) => {
        animation.currentTime = time;
        return Number.parseFloat(getComputedStyle(rect).width);
      };
      const { delay, duration } = animation.effect!.getTiming();
      const span = Number(duration);
      const widths = [widthAt(delay), widthAt(delay + span / 2), widthAt(delay + span)];
      animation.finish();
      return widths;
    });
    expect(widths[0]).toBe(0);
    expect(widths[1]).toBeGreaterThan(widths[2]! * .65);
    expect(widths[2]).toBeGreaterThan(0);
    await expect(host.locator('.graph-label text')).toHaveText(['Sam', 'Ada']);
    await expect(host.locator('.mg-podium .first')).toContainText('Ada');
    expect(await host.locator('[data-graph-trace]').evaluateAll(lines => lines.map(line => line.getAttribute('stroke')))).toEqual([samColor, adaColor]);
    await expect(touchPhone.getByRole('img', { name: 'Actual line and player guesses' })).toBeVisible();
    await expect(touchPhone.locator('[data-graph-answer]')).toHaveCount(1);
    await expect(touchPhone.locator('[data-graph-trace]')).toHaveCount(1);
    await expect(touchPhone.locator('[data-graph-trace]')).toHaveAttribute('stroke', adaColor!);
    await expect(touchPhone.getByRole('slider')).toHaveCount(0);
    await expect(touchPhone.getByRole('heading', { name: 'Places', exact: true })).toHaveCount(0);
    await expect(touchPhone.getByText('Points this round', { exact: true })).toHaveCount(0);

    const controls = host.getByRole('group', { name: 'Graph playback' });
    await controls.getByRole('button', { name: 'Replay lines' }).click();
    await controls.getByRole('button', { name: 'Pause drawing' }).click();
    await expect(controls.getByRole('button', { name: 'Resume drawing' })).toBeEnabled();
    const tvSweep = display.locator('.graph-reveal-sweep');
    await expect(tvSweep).toHaveCSS('animation-play-state', 'paused');
    const width = (element: SVGRectElement) => Number.parseFloat(getComputedStyle(element).width);
    const pausedAt = await tvSweep.evaluate(width);
    expect(pausedAt).toBeLessThan(widths[2]!);
    expect(await host.locator('.graph-reveal-sweep').evaluate(width)).toBeCloseTo(pausedAt);
    await expect(display.getByRole('group', { name: 'Graph playback' })).toHaveCount(0);
    await expect(touchPhone.getByRole('group', { name: 'Graph playback' })).toHaveCount(0);
    await controls.getByRole('button', { name: 'Resume drawing' }).click();
    await expect(tvSweep).toHaveCSS('animation-play-state', 'running');
    await controls.getByRole('button', { name: 'Show all lines' }).click();
    await expect(tvSweep).toHaveCSS('animation-play-state', 'paused');
    expect(await tvSweep.evaluate(width)).toBeCloseTo(widths[2]!);
    await expect(display.locator('.mg-podium .first')).toBeVisible();
  } finally {
    await Promise.all([touchContext.close(), keyboardContext.close(), display.close()]);
  }
});
