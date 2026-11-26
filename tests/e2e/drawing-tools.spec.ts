import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { closeRoundsByHand } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
const shots = process.env['DRAW_SHOTS'];
const shoot = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };

const definition = {
  formatVersion: 1, title: 'Art night', startNodeKey: 'art',
  nodes: [
    // A drawing round where the host gives the points once the drawings are shown.
    { key: 'art', stages: [{ key: 'main', kind: 'collect', prompt: 'Draw a cat', durationMs: null, input: { kind: 'drawing', maxStrokes: 400 }, scoring: { kind: 'judged', maxAwardMilli: '10000' } }] },
    { key: 'relay', stages: [{ key: 'main', kind: 'minigame', prompt: 'Pass the pencil!', game: 'relay-drawing', durationMs: 90_000,
      play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'count', teams: 2 }, formation: 'random' } }, answers: 'everyone', points: 'members' } }] },
  ],
  edges: [{ key: 'art-relay', from: 'art', to: 'relay' }],
};
// Draws a line across the pad between two points given as fractions of its size.
async function line(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.locator('.drawing-surface').boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]); await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(box.x + box.width * (from[0] + (to[0] - from[0]) * step / 8), box.y + box.height * (from[1] + (to[1] - from[1]) * step / 8));
  await page.mouse.up();
}
// The whole pad and its tools are on screen together, with no page scrolling needed.
async function fits(page: Page) {
  for (const part of ['.drawing-surface', '.drawing-colors', '.drawing-widths', '.drawing-actions']) await expect(page.locator(part)).toBeInViewport({ ratio: 1 });
  // …and above the floating menu bar.
  const tools = (await page.locator('.drawing-tools').boundingBox())!; const dock = (await page.locator('.phone-dock-buttons').boundingBox())!;
  expect(tools.y + tools.height).toBeLessThanOrEqual(dock.y);
  // The send button too, wherever it is.
  const send = (await page.getByRole('button', { name: 'Send my drawing' }).boundingBox())!;
  expect(send.y + send.height).toBeLessThanOrEqual(dock.y);
}

test('every drawing has the full toolbox with an eraser, and the host can give points for drawings', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The phones use separate narrow contexts.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID(); const roomId = randomUUID();
  const api = `${baseURL}/api/host/games`; const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(api, { headers, data: { gameId, title: 'Art night', startFrom: 'timed-quiz' } })).json()).data;
  expect((await host.request.put(`${api}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  const saved = (await (await host.request.get(`${api}/${gameId}`, { headers })).json()).data;
  expect((await host.request.post(`${api}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);

  const big = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const small = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  try {
    const [ada, bo] = [await big.newPage(), await small.newPage()];
    for (const [phone, name] of [[ada, 'Ada'], [bo, 'Bo']] as const) {
      await phone.goto(`${baseURL}/?code=${code}`);
      await phone.getByLabel('Your name').fill(name);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(host.getByText(`${name} · connected`, { exact: false })).toBeVisible();
    }
    await host.getByRole('button', { name: 'Start the game' }).click();

    // The drawing round: 16 colours, 4 sizes, the eraser, undo and start over, all on screen.
    for (const phone of [ada, bo]) {
      await expect(phone.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio')).toHaveCount(16);
      await expect(phone.getByRole('button', { name: 'Eraser' })).toBeVisible();
    }
    await line(ada, [0.2, 0.5], [0.8, 0.5]);
    await ada.getByRole('button', { name: 'Eraser' }).click();
    await expect(ada.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
    await line(ada, [0.5, 0.3], [0.5, 0.7]);
    // The eraser paints in the paper's white; picking a colour puts the pen back.
    await expect(ada.locator('.drawing-surface path')).toHaveCount(2);
    await expect(ada.locator('.drawing-surface path').nth(1)).toHaveAttribute('stroke', '#ffffff');
    await shoot(ada, '1-drawing-round');
    await ada.getByRole('radio', { name: 'Red' }).click();
    await expect(ada.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'false');
    await shoot(bo, '2-drawing-round-small-phone');
    await fits(bo);
    for (const phone of [ada, bo]) {
      if (phone === bo) await line(bo, [0.3, 0.3], [0.7, 0.7]);
      await phone.getByRole('button', { name: 'Send my drawing' }).click();
      await expect(phone.getByText('Your answer is in!')).toBeVisible();
    }

    // The host shows the drawings, then gives points under them; everyone sees them at once.
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();
    const judge = host.getByRole('group', { name: 'Judge players' });
    await expect(judge).toBeVisible();
    await judge.getByLabel('Points for Ada').fill('10');
    await judge.getByRole('button', { name: 'Award' }).first().click();
    await expect(judge.getByText('Ada', { exact: false }).first()).toBeVisible();
    await expect(host.getByRole('region', { name: 'Round results' })).toContainText('10');
    await shoot(host, '3-host-judging');

    // Pass the pencil: the same full toolbox (no more dropdowns), and it fits on both phones.
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await host.getByRole('button', { name: 'Start round with these teams' }).click();
    for (const phone of [ada, bo]) await expect(phone.getByText('Your turn! Add to the drawing')).toBeVisible({ timeout: 10_000 });
    for (const phone of [ada, bo]) {
      await expect(phone.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio')).toHaveCount(16);
      await expect(phone.getByRole('button', { name: 'Eraser' })).toBeVisible();
      await expect(phone.locator('select')).toHaveCount(0);
      await fits(phone);
    }
    await shoot(ada, '4-pass-the-pencil');
    await shoot(bo, '5-pass-the-pencil-small-phone');
  } finally {
    await big.close(); await small.close();
  }
});

// Bug report (25 November 2026): drawing your look in the lobby ran off the side of a narrow phone.
test('the look sheet and its drawing tools fit a narrow phone', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The phone is emulated in its own context below.');
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await host.getByRole('button', { name: 'Open room for Draw party' }).click();
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  for (const size of [{ width: 320, height: 640 }, { width: 360, height: 800 }]) {
    const phone = await (await browser.newContext({ viewport: size })).newPage();
    await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill(`Narrow ${size.width}`); await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await phone.getByRole('button', { name: 'Change my look' }).click();
    await phone.getByRole('dialog', { name: 'Your look' }).getByRole('tab', { name: 'Draw' }).click();
    // Every tool stays inside the sheet's content, so nothing is cut off or needs sideways scrolling.
    const outside = await phone.locator('.look-content').evaluate(content => {
      const box = content.getBoundingClientRect(); const style = getComputedStyle(content);
      const left = box.left + parseFloat(style.paddingLeft) - 1; const right = box.right - parseFloat(style.paddingRight) + 1;
      return [...content.querySelectorAll('.drawing-pad, .drawing-pad button, .drawing-surface')].filter(element => {
        const rect = element.getBoundingClientRect(); return rect.left < left || rect.right > right;
      }).map(element => element.getAttribute('aria-label') ?? element.className.toString());
    });
    expect(outside, `${size.width} px wide`).toEqual([]);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    await phone.context().close();
  }
});
