import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { GRAPH_SAMPLES } from '@party/contracts';
import { closeHostFold, closeRoundsByHand, openHostFold } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('players finish the same graph in their own colors and the host reveals all guesses together', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'One player uses a separate touch context.');
  await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(host.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
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
  const configuration = host.getByRole('dialog', { name: 'Draw the Graph', exact: true });
  await expect(configuration.getByLabel('Reveal easing')).toHaveValue('ease-in');
  await configuration.getByLabel('Reveal easing').selectOption('ease-out');
  await expect(host.getByRole('checkbox', { name: 'Use my own graph' })).toBeChecked();
  await configuration.getByText('Edit data and axis labels', { exact: true }).click();
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
  await expect(configuration.getByRole('img', { name: 'Review imported graph' })).toBeInViewport({ ratio: 1 });
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
  await host.setViewportSize({ width: 320, height: 568 });
  const previewTab = configuration.getByRole('button', { name: 'Preview', exact: true });
  const settingsTab = configuration.getByRole('button', { name: 'Settings', exact: true });
  await expect(previewTab).toBeVisible();
  expect((await previewTab.boundingBox())?.y).toBe((await settingsTab.boundingBox())?.y);
  await previewTab.click();
  await expect(configuration.getByRole('combobox', { name: 'Phone model' })).toBeInViewport({ ratio: 1 });
  await expect(configuration.locator('.phone-device')).toBeInViewport({ ratio: 1 });
  // The button is inside a scaled viewport, so Chromium rounds its intersection by a fraction of a pixel.
  await expect(configuration.getByRole('button', { name: 'Start practice' })).toBeInViewport({ ratio: .999 });
  await host.setViewportSize(desktop);
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
  await configuration.getByText('Edit data and axis labels', { exact: true }).click();
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
    await expect(graphController).toBeInViewport({ ratio: .9999 });
    await expect(submit).toBeInViewport({ ratio: .9999 });
    await expect(restart).toBeInViewport({ ratio: .9999 });
    expect(await practice.evaluate(element => element.scrollHeight - element.clientHeight), `${width} × ${height} vertical overflow`).toBe(0);
  }
  for (let step = 0; step < GRAPH_SAMPLES; step++) await graphController.press('ArrowRight');
  await submit.click();
  await expect(practice.getByRole('status')).toContainText('average error');
  await expect(practice.getByRole('status')).toHaveCSS('font-size', '18px');
  await expect(restart).toBeInViewport({ ratio: .9999 });
  await host.setViewportSize({ width: 1024, height: 600 });
  await practice.getByRole('button', { name: 'Shared screen' }).click();
  await expect(practice.locator('.tv-screen .graph-chart')).toBeInViewport({ ratio: 1 });
  await expect(practice.getByRole('button', { name: 'Start practice' })).toBeInViewport({ ratio: 1 });
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

test('the graph library lists other drafts and edits an imported graph in its original units', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  const screenshots = process.env['GRAPH_AUTHORING_SCREENSHOTS'];
  if (screenshots) await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const api = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const make = async (title: string) => {
    const gameId = randomUUID();
    const response = await page.request.post(api, { headers, data: { gameId, title, startFrom: null } });
    expect(response.ok()).toBe(true);
    return (await response.json()).data as { gameId: string; revision: number };
  };
  const sourceTitle = `Museum graphs ${randomUUID().slice(0, 8)}`;
  const source = await make(sourceTitle);
  const current = await make('Other game');
  const graph = { visible: [0, 25], hidden: [50, 75], scale: { min: 100, max: 500 }, yLabel: 'Visitors' };
  const definition = { title: sourceTitle, formatVersion: 2, startNodeKey: 'chart', edges: [],
    graphLibrary: Array.from({ length: 13 }, (_, index) => ({ key: `graph-${randomUUID()}`, question: `Exhibition ${index + 1}`, graph })),
    nodes: [{ key: 'chart', stages: [{ key: 'main', kind: 'minigame', game: 'draw-the-graph', prompt: 'How many museum visitors?',
      durationMs: 20_000, settings: { graph, revealEasing: 'ease-out' } }] }],
  };
  expect((await page.request.put(`${api}/${source.gameId}/draft`, { headers, data: { expectedRevision: source.revision, definition } })).ok()).toBe(true);

  await page.goto(`${baseURL}/?edit=${current.gameId}`);
  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('menuitem', { name: 'Graph library', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Graph library' });
  const search = library.getByRole('searchbox');
  await search.fill(sourceTitle);
  await expect(library.getByText('Page 1 of 2')).toBeVisible();
  const results = library.locator('.graph-library-results');
  const nextPage = library.getByRole('button', { name: 'Next page' });
  if (screenshots) await page.screenshot({ path: `${screenshots}/graph-library-paged.png` });
  await results.evaluate(element => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(() => results.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(search).toBeInViewport({ ratio: 1 });
  await expect(nextPage).toBeInViewport({ ratio: 1 });
  const lastRow = (await results.getByRole('listitem').last().boundingBox())!;
  const footer = (await library.locator('footer').boundingBox())!;
  expect(footer.y - (lastRow.y + lastRow.height)).toBeGreaterThanOrEqual(24);
  if (screenshots) await page.screenshot({ path: `${screenshots}/graph-library-pagination-padding.png` });
  await nextPage.click();
  await expect(library.getByText('Page 2 of 2')).toBeVisible();
  await expect.poll(() => results.evaluate(element => element.scrollTop)).toBe(0);
  await expect(library.getByRole('button', { name: /^Exhibition 13/ })).toBeVisible();
  await search.fill('How many museum visitors');
  const previewButton = library.getByRole('button', { name: 'Preview How many museum visitors?' });
  await previewButton.click();
  const preview = page.getByRole('dialog', { name: 'Preview', exact: true });
  await expect(preview.getByRole('combobox', { name: 'Phone model' })).toBeVisible();
  await expect(preview.locator('.phone-screen')).toContainText('How many museum visitors?');
  await preview.getByRole('button', { name: 'Shared screen', exact: true }).click();
  await expect(preview.locator('.tv-screen .graph-chart')).toBeVisible();
  await preview.getByRole('button', { name: 'Start practice' }).click();
  await expect(preview.locator('.tv-screen .graph-controller')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(library).toBeVisible();
  await expect(previewButton).toBeFocused();
  const practiced = (await (await page.request.get(`${api}/${source.gameId}`, { headers })).json()).data;
  expect(practiced.definition.nodes[0].stages[0].settings.graph).toEqual(graph);
  await library.getByRole('button', { name: /^Edit How many museum visitors/ }).click();
  const editor = page.getByRole('dialog', { name: 'Edit graph' });
  await editor.getByText('Edit data and axis labels', { exact: true }).click();
  const visible = editor.getByLabel('Visible values');
  await expect(visible).toHaveValue('100, 200');
  await visible.fill('125, 250');
  await visible.press('Tab');
  await editor.getByLabel('Hidden values').fill('320, 410');
  await editor.getByRole('button', { name: 'Save graph', exact: true }).click();
  await expect(library.getByRole('status')).toHaveText('Graph updated.');
  const saved = (await (await page.request.get(`${api}/${source.gameId}`, { headers })).json()).data;
  expect(saved.definition.nodes[0].stages[0].settings).toMatchObject({ revealEasing: 'ease-out',
    graph: { ...graph, visible: [6.25, 37.5], hidden: [expect.closeTo(55), 77.5] } });

  await library.getByRole('button', { name: /^Delete How many museum visitors/ }).click();
  const remove = page.getByRole('dialog', { name: 'Delete graph' });
  await expect(remove).toContainText('The scene will use the built-in sample graph.');
  await remove.getByRole('button', { name: 'Delete graph', exact: true }).click();
  await expect(library.getByRole('status').filter({ hasText: 'Graph deleted.' })).toBeVisible();
  const afterDelete = (await (await page.request.get(`${api}/${source.gameId}`, { headers })).json()).data.definition;
  expect(afterDelete.nodes).toHaveLength(1);
  expect(afterDelete.nodes[0].stages[0].settings).toEqual({ revealEasing: 'ease-out' });

  await page.goto(`${baseURL}/?edit=${source.gameId}&view=scene`);
  const importButton = page.getByRole('button', { name: 'Import graph data', exact: true });
  const configure = page.getByRole('button', { name: 'Configure minigame', exact: true });
  await expect(importButton).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const first = (await importButton.boundingBox())!;
  const second = (await configure.boundingBox())!;
  expect(Math.max(second.x - first.x - first.width, second.y - first.y - first.height)).toBeGreaterThanOrEqual(8);
});

test('a population link imports both countries and the cutoff and device previews stay usable', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Checks a wide editor layout.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const screenshots = process.env['GRAPH_AUTHORING_SCREENSHOTS'];
  if (screenshots) await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await page.request.post(games, { headers, data: { gameId, title: 'Population charts', startFrom: null } })).json()).data;
  const definition = { formatVersion: 2, title: 'Population charts', startNodeKey: 'chart', edges: [], nodes: [{ key: 'chart', stages: [
    { key: 'main', kind: 'minigame', prompt: 'Draw the Graph', game: 'draw-the-graph', durationMs: 30_000 },
  ] }] };
  expect((await page.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  const url = 'https://ourworldindata.org/grapher/population-with-un-projections?time=1950..2023&country=ROU~NLD';
  if (!process.env['GRAPH_IMPORT_LIVE']) {
    const csv = ['entity,code,year,population',
      ...Array.from({ length: 74 }, (_, index) => [`Netherlands,NLD,${1950 + index},${10_000_000 + index * 100_000}`, `Romania,ROU,${1950 + index},${17_000_000 + 80_000 * index}`]).flat(),
    ].join('\n');
    await page.route('**/api/host/graph-import', route => route.fulfill({ json: { ok: true, data: { csv, sourceUrl: url,
      metadata: { chart: { title: 'Population' }, columns: { population: { unit: 'people' } } },
    } } }));
  }

  await page.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('menuitem', { name: 'Graph library', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Graph library' });
  await library.getByRole('button', { name: 'Import data' }).click();
  const importer = page.getByRole('dialog', { name: 'Import graph data' });
  await importer.getByLabel('Our World in Data chart URL').fill(url);
  if (screenshots) await page.screenshot({ path: `${screenshots}/import-data.png` });
  await importer.getByRole('button', { name: 'Preview chart from URL' }).click();
  const series = importer.getByRole('combobox', { name: 'Value column' });
  await expect(series.locator('option')).toHaveText([/Netherlands/, /Romania/]);
  const cutoff = importer.getByRole('slider');
  const original = Number(await cutoff.getAttribute('aria-valuetext'));
  const dragCutoff = async (dialog: typeof importer, distance: number) => {
    const position = (await dialog.locator('[data-graph-cutoff]').evaluate(line => {
      const bounds = line.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y + bounds.height / 2 };
    }));
    await page.mouse.move(position.x, position.y);
    await page.mouse.down();
    await page.mouse.move(position.x + distance, position.y, { steps: 9 });
    await page.mouse.up();
  };
  await dragCutoff(importer, 55);
  expect(Number(await cutoff.getAttribute('aria-valuetext'))).toBeGreaterThan(original);
  if (screenshots) await page.screenshot({ path: `${screenshots}/import-series.png` });
  const previewButton = importer.getByRole('button', { name: 'Preview', exact: true });
  const importedYear = await cutoff.getAttribute('aria-valuetext');
  await previewButton.click();
  const graphPreview = page.getByRole('dialog', { name: 'Preview', exact: true });
  await expect(graphPreview.getByRole('button', { name: 'Phone', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(graphPreview.locator('.phone-screen .graph-chart')).toContainText(importedYear!);
  await expect(graphPreview.locator('[data-graph-answer]')).toHaveCount(0);
  if (screenshots) await page.screenshot({ path: `${screenshots}/graph-preview-phone.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  const phoneModel = graphPreview.getByRole('combobox', { name: 'Phone model' });
  await expect(phoneModel).toBeInViewport({ ratio: 1 });
  await phoneModel.click();
  await graphPreview.getByRole('option', { name: 'iPhone SE', exact: true }).click();
  const phoneFrame = graphPreview.locator('.phone-device');
  await expect(phoneFrame).toHaveAttribute('title', 'iPhone SE');
  await expect.poll(() => phoneFrame.evaluate(element => {
    const viewport = element.firstElementChild as HTMLElement;
    return [viewport.offsetWidth, viewport.offsetHeight];
  })).toEqual([375, 667]);
  await expect.poll(() => phoneFrame.evaluate(element => Math.abs(element.clientWidth / element.clientHeight - 375 / 667))).toBeLessThan(.005);
  await expect(phoneFrame).toBeInViewport({ ratio: 1 });
  if (screenshots) await page.screenshot({ path: `${screenshots}/graph-phone-model.png` });
  await expect(graphPreview.getByRole('button', { name: 'Start practice' })).toBeInViewport({ ratio: .999 });
  await graphPreview.getByRole('button', { name: 'Start practice' }).click();
  await expect(graphPreview.locator('.phone-screen .graph-controller')).toBeVisible();
  if (screenshots) await page.screenshot({ path: `${screenshots}/graph-practice-mobile.png` });
  await page.keyboard.press('Escape');
  await expect(graphPreview).toBeHidden();
  await expect(previewButton).toBeFocused();
  await expect(cutoff).toHaveAttribute('aria-valuetext', importedYear!);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await importer.getByRole('button', { name: 'Import all new series' }).click();
  await expect(importer.getByText('This series is already in the graph library.')).toBeVisible();
  await expect(importer.getByRole('button', { name: 'Use this data' })).toBeDisabled();
  await series.selectOption({ label: (await series.locator('option').last().innerText()) });
  await expect(importer.getByText('This series is already in the graph library.')).toBeVisible();
  await importer.getByRole('button', { name: 'Back to graphs' }).click();
  await expect(library.getByRole('button', { name: /^Population.*Netherlands/ })).toBeVisible();
  await expect(library.getByRole('button', { name: /^Population.*Romania/ })).toBeVisible();
  if (screenshots) {
    await library.getByRole('searchbox').fill('Population charts');
    await page.screenshot({ path: `${screenshots}/graph-library.png` });
  }
  const previewRomania = library.getByRole('button', { name: /^Preview Population.*Romania/ });
  await previewRomania.click();
  await expect(graphPreview.locator('.phone-screen')).toContainText('Romania?');
  if (screenshots) await page.screenshot({ path: `${screenshots}/graph-library-direct-preview.png` });
  await graphPreview.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(previewRomania).toBeFocused();
  const romaniaRow = library.getByRole('button', { name: /^Population.*Romania/ });
  await romaniaRow.click();
  await expect(graphPreview.locator('.phone-screen')).toContainText('Romania?');
  await expect(page.getByRole('dialog', { name: 'Edit graph' })).toHaveCount(0);
  await graphPreview.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(romaniaRow).toBeFocused();
  const editRomania = library.getByRole('button', { name: /^Edit Population.*Romania/ });
  await expect(editRomania).toHaveText('');
  await editRomania.click();
  const editor = page.getByRole('dialog', { name: 'Edit graph' });
  const editCutoff = editor.getByRole('slider');
  const before = Number(await editCutoff.getAttribute('aria-valuetext'));
  await dragCutoff(editor, -50);
  const year = Number(await editCutoff.getAttribute('aria-valuetext'));
  expect(year).toBeLessThan(before);
  await expect(editor.getByLabel('Visible values')).toBeHidden();
  if (screenshots) await page.screenshot({ path: `${screenshots}/edit-cutoff.png` });
  await editor.getByLabel('Graph question').fill('How did the population change in Romania?');
  await editor.getByRole('button', { name: 'Preview', exact: true }).click();
  await graphPreview.getByRole('button', { name: 'Shared screen' }).click();
  await expect(graphPreview.locator('.tv-screen .graph-chart')).toContainText(String(year));
  await expect(graphPreview.getByText('How did the population change in Romania?', { exact: true })).toBeVisible();
  if (screenshots) await page.screenshot({ path: `${screenshots}/graph-preview-shared.png` });
  await page.setViewportSize({ width: 1024, height: 600 });
  await expect(graphPreview.locator('.tv-screen .graph-chart')).toBeInViewport({ ratio: 1 });
  await expect(graphPreview.getByRole('button', { name: 'Start practice' })).toBeInViewport({ ratio: 1 });
  await graphPreview.getByRole('button', { name: 'Start practice' }).click();
  await expect(graphPreview.locator('.tv-screen .graph-controller')).toBeVisible();
  await graphPreview.getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(editor.getByLabel('Graph question')).toHaveValue('How did the population change in Romania?');
  await editor.getByRole('button', { name: 'Save graph' }).click();
  const readDraft = async () => (await (await page.request.get(`${games}/${gameId}`, { headers })).json()).data.definition;
  await expect.poll(async () => (await readDraft()).graphLibrary?.find((item: { question: string }) => item.question.endsWith('Romania?'))?.graph.splitLabel).toBe(String(year));
  expect((await readDraft()).nodes).toHaveLength(1);
  const removeRomania = library.getByRole('button', { name: 'Delete How did the population change in Romania?' });
  await removeRomania.click();
  const remove = page.getByRole('dialog', { name: 'Delete graph' });
  await expect(remove).toContainText('Scenes already using a copy keep their data.');
  if (screenshots) await page.screenshot({ path: `${screenshots}/delete-graph.png` });
  await remove.getByRole('button', { name: 'Cancel' }).click();
  await expect(removeRomania).toBeVisible();
  await removeRomania.click();
  await remove.getByRole('button', { name: 'Delete graph', exact: true }).click();
  await expect(library.getByRole('status').filter({ hasText: 'Graph deleted.' })).toBeVisible();
  await expect.poll(async () => (await readDraft()).graphLibrary.length).toBe(1);
  await library.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Configure minigame' }).click();
  const config = page.getByRole('dialog', { name: 'Draw the Graph' });
  await config.getByLabel('Choose a saved graph').selectOption({ label: (await config.getByLabel('Choose a saved graph').locator('option').nth(1).innerText()) });
  await expect(config.getByRole('button', { name: 'A draw', exact: true })).toHaveCount(0);
  const phone = config.locator('.phone-screen');
  await expect(config.getByRole('combobox', { name: 'Phone model' })).toContainText('iPhone SE');
  const fields = config.getByRole('region', { name: 'Settings' });
  await expect(config.getByRole('button', { name: 'Start practice' })).toBeInViewport({ ratio: .999 });
  expect((await phone.boundingBox())!.x).toBeGreaterThan((await fields.boundingBox())!.x + (await fields.boundingBox())!.width);
  expect(await phone.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-preview.png` });
  await config.getByRole('button', { name: 'Shared screen' }).click();
  const shared = config.locator('.configuration-preview .tv');
  await expect(config.getByRole('button', { name: 'Start practice' })).toBeInViewport({ ratio: 1 });
  const settingsBox = (await fields.boundingBox())!;
  const sharedBox = (await shared.boundingBox())!;
  expect(sharedBox.y + sharedBox.height).toBeLessThan(settingsBox.y);
  expect(await fields.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  expect(sharedBox.width).toBeGreaterThan((await config.boundingBox())!.width * .8);
  if (screenshots) await page.screenshot({ path: `${screenshots}/shared-screen-preview.png` });

  await page.setViewportSize({ width: 1024, height: 600 });
  const cutoffSlider = fields.getByRole('slider', { name: 'Last point shown to players' });
  const cutoffChart = fields.getByRole('img', { name: 'Graph with the answer' });
  const startPractice = config.getByRole('button', { name: 'Start practice' });
  await expect(cutoffSlider).toBeInViewport({ ratio: 1 });
  await expect(cutoffChart).toBeInViewport({ ratio: 1 });
  await expect(startPractice).toBeInViewport({ ratio: 1 });
  expect((await cutoffSlider.boundingBox())!.y).toBeLessThan((await fields.getByLabel('Choose a saved graph').boundingBox())!.y);
  if (screenshots) await page.screenshot({ path: `${screenshots}/compact-shared-screen.png` });
  await page.setViewportSize({ width: 900, height: 540 });
  await expect(cutoffSlider).toBeInViewport({ ratio: 1 });
  await expect(cutoffChart).toBeInViewport({ ratio: 1 });
  await startPractice.click();
  await expect(shared.locator('.graph-controller')).toBeVisible();
});
