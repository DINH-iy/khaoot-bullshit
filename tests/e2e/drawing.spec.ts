import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

/** Draws on the first drawing pad of a page: a path of points given on the pad's 0–1 square. */
async function draw(page: Page, points: [number, number][]) {
  const pad = page.locator('.drawing-surface').first(); await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const;
  await page.mouse.move(...at(points[0]!)); await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...at(point), { steps: 2 });
  await page.mouse.up();
}
const circle = Array.from({ length: 40 }, (_, index) => { const angle = index / 39 * 2 * Math.PI; return [0.5 + 0.3 * Math.cos(angle), 0.5 + 0.3 * Math.sin(angle)] as [number, number]; });

test('players draw blind and vote, draw the roundest circle, and pass the pencil in teams', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Two phones are emulated in separate contexts below.');
  test.setTimeout(150_000);
  const open = async (size: { width: number; height: number }) => (await browser.newContext({ viewport: size, reducedMotion: 'reduce' })).newPage();
  const host = await open({ width: 1280, height: 900 });
  await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await host.getByRole('radio', { name: /Draw party/ }).check();
  await host.getByRole('button', { name: 'Open room', exact: true }).click();
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  const phones: Page[] = [];
  for (const name of ['Ada', 'Bo']) {
    const phone = await open({ width: 390, height: 844 }); await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill(name); await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(phone.getByRole('button', { name: 'Change my look' })).toBeVisible(); phones.push(phone);
  }
  const [ada, bo] = phones as [Page, Page];

  // A drawn picture as Ada's look; the host can take it away again.
  await ada.getByRole('button', { name: 'Change my look' }).click();
  const builder = ada.getByRole('dialog', { name: 'Your look' });
  await builder.getByRole('tab', { name: 'Draw' }).click();
  await draw(ada, [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7], [0.3, 0.3]]);
  await builder.getByRole('button', { name: 'Use this drawing' }).click();
  await expect(builder.getByRole('img', { name: 'Ada: a drawing' })).toBeVisible();
  await builder.getByRole('button', { name: 'Save my look' }).click();
  await expect(host.locator('.lobby-crowd .avatar-picture')).toHaveCount(1);
  await expect(host.locator('.lobby-crowd .avatar-picture path')).not.toHaveCount(0);
  await host.getByRole('button', { name: 'Remove the picture of Ada' }).click();
  await expect(host.locator('.lobby-crowd .avatar-picture')).toHaveCount(0);

  // Blind drawing: the strokes stay hidden until sent.
  await host.getByRole('button', { name: 'Start the game' }).click();
  for (const phone of phones) {
    await expect(phone.getByText('Drawing blind', { exact: false })).toBeVisible();
    await draw(phone, [[0.2, 0.2], [0.8, 0.3], [0.5, 0.8]]);
    await expect(phone.locator('.drawing-surface path')).toHaveCount(0);
    await phone.getByRole('button', { name: 'Send my drawing' }).click();
    await expect(phone.getByText('Your answer is in!')).toBeVisible();
  }
  expect((await new AxeBuilder({ page: ada }).analyze()).violations).toEqual([]);
  await host.getByRole('button', { name: 'Close answers' }).click();
  await host.getByRole('button', { name: 'Next', exact: true }).click();
  await ada.getByRole('radio', { name: /^Entry \d$/ }).first().check();
  await ada.getByRole('button', { name: 'Save vote' }).click();
  await host.getByRole('button', { name: 'Close answers' }).click();
  await host.getByRole('button', { name: 'Reveal results' }).click();
  await expect(host.getByRole('img', { name: /Entry from (Ada|Bo)/ }).first()).toBeVisible();

  // The doodle to finish is skipped; then the roundest circle.
  await host.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(ada.locator('.drawing-surface path')).not.toHaveCount(0); // the doodle is under the pad
  await host.getByRole('button', { name: 'Close answers' }).click();
  await host.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(ada.getByText('Draw one circle, in one go')).toBeVisible({ timeout: 10_000 });
  await draw(ada, circle);
  await expect(ada.getByRole('status').filter({ hasText: /\d+\.\d% round/ })).toBeVisible();
  await host.getByRole('button', { name: 'Close answers' }).click();
  await host.getByRole('button', { name: 'Reveal results' }).click();
  await expect(host.getByRole('img', { name: 'Circle by Ada' })).toBeVisible();

  // Pass the pencil: two teams of one; each draws its turn, then votes for the other team.
  await host.getByRole('button', { name: 'Next', exact: true }).click();
  await host.getByRole('button', { name: 'Start round with these teams' }).click();
  for (const phone of phones) await expect(phone.getByText('Your turn! Add to the drawing')).toBeVisible({ timeout: 10_000 });
  await draw(ada, [[0.1, 0.9], [0.9, 0.9], [0.5, 0.2], [0.1, 0.9]]);
  // Live: the shared screen shows Ada's stroke before her turn is sent.
  await expect(host.locator('.mg-relay-screen .drawing-view path')).toHaveCount(1);
  await ada.getByRole('button', { name: 'Send my drawing' }).click();
  // Bo draws with the keyboard: pen down, move, pen up.
  const pad = bo.getByRole('application', { name: "Your team's drawing, your turn" });
  await pad.focus(); await bo.keyboard.press('Space');
  for (let step = 0; step < 6; step++) await bo.keyboard.press('Shift+ArrowRight');
  for (let step = 0; step < 4; step++) await bo.keyboard.press('Shift+ArrowDown');
  await bo.keyboard.press('Enter');
  await expect(bo.locator('.drawing-surface path')).toHaveCount(1);
  await expect(host.locator('.mg-relay-screen .drawing-view path')).toHaveCount(2);
  // Bo's strokes are sent by themselves when the turn ends; then both vote.
  for (const phone of phones) await expect(phone.getByRole('group', { name: 'Vote for the best drawing' })).toBeVisible({ timeout: 25_000 });
  for (const phone of phones) { await phone.getByRole('radio').first().check(); await phone.getByRole('button', { name: 'Save vote' }).click(); await expect(phone.getByText('Your vote is in!')).toBeVisible(); }
  await host.getByRole('button', { name: 'Close answers' }).click();
  await host.getByRole('button', { name: 'Reveal results' }).click();
  const pictures = host.getByRole('region', { name: 'Round results' }).getByRole('img', { name: /^Drawing of / });
  await expect(pictures).toHaveCount(2);
  await expect(pictures.first().locator('path')).not.toHaveCount(0);
  expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
});
