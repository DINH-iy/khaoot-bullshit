import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { POOL_CANVAS_WIDTH, POOL_RAIL, poolPocketCenter } from '../../apps/web/src/head-to-head/eight-ball/table.js';
import { POOL_HEIGHT, POOL_START_LINE, POOL_WIDTH } from '@party/contracts';
import { chooseOption, closeHostFold, closeRoundsByHand, openHostFold, openPhoneMenu } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test.use({ actionTimeout: 10_000 });

const cueStart = (POOL_RAIL + POOL_START_LINE) / POOL_CANVAS_WIDTH;
const cuePull = .19 * POOL_WIDTH / POOL_CANVAS_WIDTH;

test('8-ball plays as a phone challenge and a hosted round with a live TV table', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Uses CDP for the cue gesture.');
  test.setTimeout(70_000);
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const roomId = randomUUID();
  const url = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(url, { headers, data: { gameId, title: 'Pool night', startFrom: 'timed-quiz' } })).json()).data;
  const definition = { formatVersion: 2, title: 'Pool night', startNodeKey: 'pool', edges: [],
    nodes: [{ key: 'pool', stages: [{ key: 'main', kind: 'duel', prompt: '8-ball pool', durationMs: 30_000,
      pick: 'host', betMilli: '2000', matchSeconds: 60, contest: { kind: 'game', game: 'eight-ball' } }] }] };
  const saved = (await (await host.request.put(`${url}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  const configure = host.getByRole('button', { name: 'Configure pool', exact: true });
  const changeContest = host.getByRole('button', { name: 'Change game', exact: true });
  await expect(changeContest).toBeVisible();
  const [poolButton, gameButton] = await Promise.all([configure.boundingBox(), changeContest.boundingBox()]);
  expect(poolButton!.y).toBe(gameButton!.y);
  expect(gameButton!.x - (poolButton!.x + poolButton!.width)).toBeCloseTo(8);
  expect(gameButton!.height).toBeGreaterThanOrEqual(44);
  await changeContest.click();
  await expect(host.getByRole('dialog', { name: 'How is the duel won?' })).toBeVisible();
  await host.keyboard.press('Escape');
  const settings = host.getByRole('dialog', { name: 'Configure 8-ball pool' });
  await configure.click();
  await expect(settings.getByRole('button', { name: 'Team vs team' })).toBeVisible();
  await expect(settings.getByRole('spinbutton', { name: 'Match time (seconds)' })).toHaveValue('60');
  await settings.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(settings.getByRole('img', { name: 'Pool table preview' })).toBeVisible();
  await settings.getByLabel('Starting side').selectOption('right');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await host.request.post(`${url}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);
  await openHostFold(host, 'Shared screen');
  await host.getByRole('button', { name: 'Create display link' }).click();
  const link = (await host.getByRole('link', { name: 'Open shared display' }).getAttribute('href'))!;
  await closeHostFold(host);
  const tv = await host.context().newPage();
  const poolNotices: string[] = [];
  tv.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
    if (typeof payload === 'string' && payload.includes('"room.pool-shot"')) poolNotices.push(payload);
  }));
  await tv.setViewportSize({ width: 960, height: 540 });
  await tv.emulateMedia({ reducedMotion: 'no-preference' });
  await tv.goto(link);
  await expect(tv.getByRole('heading', { name: `Room ${code}` })).toBeVisible();
  const join = async (name: string) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await page.goto(`${baseURL}/?code=${code}`);
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Menu/ })).toBeVisible();
    return page;
  };
  const ada = await join('Ada'), bo = await join('Bo'), cy = await join('Cy');
  try {
    const challenges = async (page: typeof ada) => {
      await (await openPhoneMenu(page)).getByRole('button', { name: /^Challenge/ }).click();
      return page.getByRole('dialog', { name: 'Challenges' });
    };
    const outgoing = await challenges(ada);
    await outgoing.getByRole('button', { name: 'Challenge someone' }).click();
    await chooseOption(outgoing.locator('.challenge-form label').nth(0).getByRole('combobox'), { label: 'Bo' });
    await chooseOption(outgoing.locator('.challenge-form label').nth(1).getByRole('combobox'), 'eight-ball');
    await outgoing.getByRole('button', { name: 'Send challenge' }).click();
    const incoming = await challenges(bo);
    await incoming.getByRole('button', { name: 'Accept' }).click();
    await outgoing.getByRole('button', { name: 'Open', exact: true }).click();
    const portraitTable = outgoing.getByRole('img', { name: 'Pool table' });
    await expect(portraitTable).toBeVisible();
    const portraitWidth = (await portraitTable.boundingBox())!.width;
    await ada.emulateMedia({ reducedMotion: 'no-preference' });
    await ada.evaluate(() => Object.defineProperty(screen.orientation, 'lock', { configurable: true, value: undefined }));
    await outgoing.getByRole('button', { name: 'Rotate table' }).click();
    const landscape = ada.getByRole('dialog', { name: 'Pool table' });
    const sidewaysTable = landscape.getByRole('img', { name: 'Pool table' });
    const power = landscape.getByRole('slider', { name: 'Power' });
    await expect(sidewaysTable).toBeInViewport({ ratio: 1 });
    await expect(power).toBeInViewport({ ratio: 1 });
    await expect(landscape.getByRole('button', { name: 'Shoot' })).toBeInViewport({ ratio: 1 });
    await expect(landscape.locator('.pool-landscape-frame')).toHaveCSS('transform', /^matrix\(0, 1, -1, 0,/);
    const rotated = (await sidewaysTable.boundingBox())!;
    expect(rotated.height).toBeGreaterThan(portraitWidth * 1.3);
    const rotatedX = rotated.x + rotated.width / 2;
    const shaftY = rotated.y + rotated.height * (cueStart - 90 / POOL_CANVAS_WIDTH);
    const touch = await ada.context().newCDPSession(ada);
    const movePath = '**/side/challenges/*/move';
    const pixel = (x: number, y: number) => sidewaysTable.evaluate((canvas, point) => {
      return Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(point.x, point.y, 1, 1).data);
    }, { x, y });
    const [pocketX, pocketY] = poolPocketCenter(1);
    expect((await pixel(POOL_RAIL + pocketX, POOL_RAIL + pocketY))[1]).toBeLessThan(25);
    expect((await pixel(POOL_RAIL + pocketX, POOL_RAIL + 7))[1]).toBeGreaterThan(60);
    const cueAtStart = async () => (await pixel(POOL_RAIL + POOL_START_LINE, POOL_RAIL + POOL_HEIGHT / 2))[0];
    expect(await cueAtStart()).toBeGreaterThan(200);

    // A rejected shot restores the confirmed table and gives the player control back.
    let rejectMove!: () => void;
    const rejectGate = new Promise<void>(resolve => { rejectMove = resolve; });
    await ada.route(movePath, async route => { await rejectGate; await route.abort(); }, { times: 1 });
    const shoot = landscape.getByRole('button', { name: 'Shoot' });
    try {
      await shoot.tap();
      await expect.poll(cueAtStart).toBeLessThan(100);
    } finally {
      rejectMove();
    }
    await expect(shoot).toBeEnabled();
    expect(await cueAtStart()).toBeGreaterThan(200);
    const aim = landscape.getByRole('slider', { name: 'Aim' });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rotatedX, y: shaftY }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(shoot).toBeEnabled();
    await expect(aim).toHaveAttribute('aria-valuenow', '0');
    // The other player sees the shooter's aim live, as a ghost.
    await aim.press('ArrowRight');
    await expect(incoming.getByRole('img', { name: 'Pool table' })).toHaveAttribute('data-ghost-angle', '0.25');
    await aim.press('ArrowLeft');
    await expect(incoming.getByRole('img', { name: 'Pool table' })).toHaveAttribute('data-ghost-angle', '0');

    let releaseMove!: () => void;
    const moveGate = new Promise<void>(resolve => { releaseMove = resolve; });
    await ada.route(movePath, async route => {
      await Promise.all([moveGate, new Promise<void>(resolve => setTimeout(resolve, 500))]);
      await route.continue();
    });
    await ada.evaluate(() => {
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.buffer?.duration === undefined || this.buffer.duration > .09) return start.apply(this, args);
        document.body.dataset['poolSounds'] = String(Number(document.body.dataset['poolSounds'] ?? 0) + 1);
        return start.apply(this, args);
      };
    });
    await sidewaysTable.evaluate(canvas => {
      const observer = new MutationObserver(() => {
        if (canvas.dataset['striking'] !== 'true') return;
        canvas.dataset['shotAtStrike'] = canvas.dataset['shot'];
        observer.disconnect();
      });
      observer.observe(canvas, { attributes: true, attributeFilter: ['data-striking'] });
    });
    try {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rotatedX, y: shaftY }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rotatedX, y: shaftY - rotated.height * 125 / POOL_CANVAS_WIDTH }] });
      await expect(aim).toHaveAttribute('aria-valuenow', '0');
      expect(Number(await power.getAttribute('aria-valuenow'))).toBeGreaterThan(75);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(sidewaysTable).toHaveAttribute('data-shot-at-strike', '0');
      await expect.poll(cueAtStart).toBeLessThan(100);
      await expect(sidewaysTable).toHaveAttribute('data-shot', '0');
      await expect(ada.locator('body')).toHaveAttribute('data-pool-sounds', /^[1-9]/);
    } finally {
      releaseMove();
    }
    await expect(incoming.getByRole('img', { name: 'Pool table' })).toHaveAttribute('data-shot', '1');
    await expect(sidewaysTable).toHaveAttribute('data-shot', '1');
    expect(await cueAtStart()).toBeLessThan(100);
    await ada.unroute(movePath);
    await ada.emulateMedia({ reducedMotion: 'reduce' });
    await landscape.getByRole('button', { name: 'Exit landscape' }).click();
    await ada.setViewportSize({ width: 667, height: 375 });
    await expect(outgoing.getByRole('button', { name: 'Shoot' })).toBeInViewport({ ratio: 1 });
    await incoming.getByRole('button', { name: 'Give up', exact: true }).click();
    await incoming.getByRole('button', { name: 'Yes, give up' }).click();
    await expect(outgoing.locator('.h2h-result')).toContainText('Ada');
    for (const sheet of [outgoing, incoming]) await sheet.getByRole('button', { name: 'Close', exact: true }).click();

    await host.getByRole('button', { name: 'Start the game' }).click();
    const pair = host.locator('.duel-pick-row label');
    await chooseOption(pair.nth(0).getByRole('combobox'), { label: 'Ada' });
    await chooseOption(pair.nth(1).getByRole('combobox'), { label: 'Bo' });
    await host.getByRole('button', { name: 'Open voting' }).click();
    await cy.getByRole('button', { name: 'Pick Ada' }).click();
    await host.getByRole('button', { name: 'Close voting' }).click();
    const table = (page: typeof ada) => page.getByRole('img', { name: 'Pool table' });
    await expect(table(tv)).toBeInViewport({ ratio: 1 });
    await expect(tv.getByRole('group', { name: 'Potted balls' })).toContainText('Ada');
    await expect(ada.getByRole('group', { name: 'Potted balls' })).toContainText('Bo');
    await expect(tv.locator('.session-bar')).toHaveCount(0);
    await expect(tv.getByRole('timer')).toBeVisible();
    const tvTable = (await table(tv).boundingBox())!;
    const tvTimer = (await tv.getByRole('timer').boundingBox())!;
    expect(tvTable.width).toBeGreaterThan(740);
    expect(tvTimer.y + tvTimer.height).toBeLessThanOrEqual(tvTable.y);
    await expect(table(ada)).toBeInViewport({ ratio: 1 });
    await expect(ada.getByRole('button', { name: 'Shoot' })).toBeInViewport({ ratio: 1 });
    await expect(table(bo)).toBeVisible();
    await expect(cy.getByText('Watch the shared screen', { exact: true })).toBeVisible();
    await expect(table(cy)).toHaveCount(0);
    const dropFrames = await tv.evaluateHandle(() => {
      const frames: number[] = [];
      const scale = CanvasRenderingContext2D.prototype.scale;
      CanvasRenderingContext2D.prototype.scale = function (x, y) {
        if (this.canvas.classList.contains('pool-table') && x > 0 && x < 1 && x === y) frames.push(performance.now());
        return scale.call(this, x, y);
      };
      return frames;
    });

    // Pull straight back from the cue ball to shoot toward the rack.
    const box = (await table(ada).boundingBox())!;
    const x = box.x + box.width * cueStart;
    const y = box.y + box.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - box.width * cuePull, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(table(tv)).toHaveAttribute('data-rolling', 'true');
    for (const page of [host, tv, ada, bo]) await expect(table(page)).toHaveAttribute('data-shot', '1');
    expect(poolNotices).toHaveLength(1);
    await expect(tv.getByRole('img', { name: 'Ball 13', exact: true })).toBeVisible();
    const dropped = await dropFrames.jsonValue();
    expect(dropped.length).toBeGreaterThan(2);
    expect(dropped.at(-1)! - dropped[0]!).toBeGreaterThan(95);
    await ada.setViewportSize({ width: 390, height: 667 });
    await expect(table(ada)).toHaveAttribute('data-shot', '1');
    await bo.getByRole('button', { name: 'Give up', exact: true }).click();
    await bo.getByRole('button', { name: 'Yes, give up' }).click();
    await expect(tv.locator('.duel-result')).toContainText('Ada');
    await expect(cy.locator('.duel-result')).toContainText('2');

    await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
    await configure.click();
    await settings.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(settings.getByLabel('Starting side')).toHaveValue('left');
    await settings.getByLabel('Starting side').selectOption('right');
    await settings.getByRole('button', { name: 'Match', exact: true }).click();
    await settings.getByRole('button', { name: 'Team vs team' }).click();
    await settings.getByRole('button', { name: 'Add Pick teams scene' }).click();
    await expect.poll(async () => {
      const data = (await (await host.request.get(`${url}/${gameId}`, { headers })).json()).data;
      const start = data.definition.startNodeKey;
      return {
        start: data.definition.nodes.find((node: { key: string }) => node.key === start)?.stages[0].kind,
        next: data.definition.edges.find((edge: { from: string }) => edge.from === start)?.to,
        position: data.definition.editor?.positions?.[start],
        pool: data.definition.nodes.find((node: { key: string }) => node.key === 'pool')?.stages[0],
      };
    }).toMatchObject({ start: 'teams', next: 'pool', position: { x: expect.any(Number), y: expect.any(Number) },
      pool: { pick: 'teams', contest: { settings: { start: { side: 'right', percent: 25 } } } } });
  } finally {
    await Promise.all([ada.close(), bo.close(), cy.close(), tv.close()]);
  }
});
