import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('a minigame draw in one scene: the editor lists its games, the pencil sets each one, and the room plays the drawn game', async ({ page: host, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The editor is desktop first.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID(); const games = `${baseURL}/api/host/games`; const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(games, { headers, data: { gameId, title: 'Lucky draw', startFrom: 'timed-quiz' } })).json()).data;
  const definition = { formatVersion: 2, title: 'Lucky draw', startNodeKey: 'lucky', edges: [], nodes: [{ key: 'lucky', stages: [{ key: 'main', kind: 'minigame', prompt: 'Which minigame will it be?',
    game: 'reaction', durationMs: 20_000, draw: [{ game: 'reaction', durationMs: 20_000 }, { game: 'cut-the-line', durationMs: 20_000 }] }] }] };
  expect((await host.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  await host.getByRole('button', { name: 'Configure minigame', exact: true }).click();
  await expect(host.getByRole('button', { name: 'A draw', exact: true })).toHaveCount(0);
  const list = host.getByRole('group', { name: 'Games in the draw' });
  await expect(list.getByRole('combobox')).toHaveCount(2);
  // The pencil comes before the (red) remove button and opens that game's own time and settings.
  await list.getByRole('button', { name: 'Change the settings of Cut the Line' }).click();
  const settings = host.getByRole('dialog', { name: 'Cut the Line in the draw' });
  await settings.getByLabel('Time to play').fill('35');
  await settings.getByRole('group', { name: 'Target percentage' }).getByRole('button', { name: 'Exact' }).click();
  await settings.getByRole('spinbutton', { name: 'Target percentage' }).fill('42');
  await settings.getByRole('button', { name: 'Done' }).click();
  await host.getByRole('button', { name: 'Apply changes' }).click();
  await expect.poll(async () => (await (await host.request.get(`${games}/${gameId}`, { headers })).json()).data.definition.nodes[0].stages[0].draw[1])
    .toMatchObject({ game: 'cut-the-line', durationMs: 35_000, settings: { target: { mode: 'exact', value: 42 } } });
});

test('the Flow menu offers one shared continuation or a separate route per game', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await page.request.post(games, { headers, data: { gameId, title: 'Draw routes', startFrom: 'timed-quiz' } })).json()).data;
  const nodes = ['start', 'finish'].map(key => ({ key, stages: [{ key: 'main', kind: 'info', title: key, prompt: key, durationMs: null }] }));
  const definition = { formatVersion: 2, title: 'Draw routes', startNodeKey: 'start', nodes, edges: [{ key: 'start-to-finish', from: 'start', to: 'finish' }] };
  expect((await page.request.put(`${games}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?edit=${gameId}`);
  const addOnArrow = async () => {
    await page.locator('[data-edge="start-to-finish"] .edge-hit').dispatchEvent('pointerdown');
    await page.getByRole('button', { name: /Add a scene on (this|the) arrow/ }).click();
    await page.getByRole('tab', { name: 'Games', exact: true }).click();
  };
  await addOnArrow();
  await page.getByRole('menuitem', { name: /^Minigame draw Play one/ }).click();
  const draw = page.locator('.scene-card.kind-draw');
  await expect(draw).toContainText('Minigame draw');
  await expect(draw.locator('.port-out')).toHaveCount(1);
  await expect(draw.locator('.port-row')).toHaveCount(0);
  await expect(draw.locator('.card-problems')).toHaveCount(0);
  await expect(page.locator('.scene-card')).toHaveCount(3);
  await expect(page.locator('.edge-line')).toHaveCount(2);
  const load = async () => (await (await page.request.get(`${games}/${gameId}`, { headers })).json()).data;
  const sharedKey = await draw.getAttribute('data-scene');
  const edges = async () => (await load()).definition.edges as { from: string; to: string; option?: string }[];
  await expect.poll(async () => (await edges()).map(({ from, to, option }) => [from, to, option])).toEqual([
    ['start', sharedKey, undefined], [sharedKey, 'finish', undefined],
  ]);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await addOnArrow();
  await page.getByRole('menuitem', { name: /^Minigame draw with routes/ }).click();
  await expect(draw.locator('.port-row')).toHaveCount(3);
  await expect(draw.locator('.card-problems')).toHaveCount(0);
  await expect(page.locator('.scene-card')).toHaveCount(6);
  const routedKey = await draw.getAttribute('data-scene');
  await expect.poll(async () => {
    const saved = await edges();
    const branches = saved.filter(edge => edge.from === routedKey && edge.option);
    return branches.map(branch => saved.find(edge => edge.from === branch.to)?.to);
  }).toEqual(['finish', 'finish', 'finish']);

  await page.getByRole('button', { name: /^\d+%$/ }).click();
  await page.getByRole('menuitem', { name: 'Show the whole game' }).click();
  const frame = page.locator('.flow-group');
  await expect(frame).toBeVisible();
  const background = await frame.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 8; y < bounds.bottom - 8; y += 12) {
      for (let x = bounds.left + 6; x < bounds.right - 6; x += 12) {
        if (document.elementFromPoint(x, y) === element) return { x, y };
      }
    }
    throw new Error('No visible group background');
  });
  await page.mouse.click(background.x, background.y);
  await expect(frame).toHaveClass(/selected/);
  await expect(page.locator('.scene-card.selected')).toHaveCount(4);
  const inspector = page.getByRole('complementary', { name: '4 scenes selected' });
  const ungroup = await inspector.getByRole('button', { name: 'Ungroup' }).boundingBox();
  const duplicate = await inspector.getByRole('button', { name: 'Duplicate 4 scenes' }).boundingBox();
  expect(ungroup!.y).toBeCloseTo(duplicate!.y, 0);
  expect(ungroup!.x).toBeLessThan(duplicate!.x);
  const screenshots = process.env['FLOW_GROUP_SCREENSHOTS'];
  if (screenshots) await page.screenshot({ path: join(screenshots, 'flow-group-selected.png') });

  await inspector.getByRole('button', { name: 'Clear selection' }).click();
  await expect(frame.locator('.flow-group-name')).toHaveAttribute('aria-pressed', 'false');
  await frame.locator('.flow-group-name').press('Enter');
  await expect(page.locator('.scene-card.selected')).toHaveCount(4);

  const positions = () => page.locator('.scene-card').evaluateAll(cards => Object.fromEntries(cards.map(card => {
    const scene = card as HTMLElement;
    return [scene.dataset.scene!, { x: parseFloat(scene.style.left), y: parseFloat(scene.style.top) }];
  })));
  const before = await positions();
  const members = await page.locator('.scene-card.selected').evaluateAll(cards => cards.map(card => (card as HTMLElement).dataset.scene!));
  await page.mouse.move(background.x, background.y);
  await page.mouse.down();
  await page.mouse.move(background.x + 145, background.y + 40, { steps: 6 });
  await page.mouse.up();
  const after = await positions();
  const delta = { x: after[members[0]!]!.x - before[members[0]!]!.x, y: after[members[0]!]!.y - before[members[0]!]!.y };
  expect(delta.x).toBeGreaterThan(0);
  for (const [key, start] of Object.entries(before)) {
    expect(after[key]).toEqual(members.includes(key) ? { x: start.x + delta.x, y: start.y + delta.y } : start);
  }
  await expect(frame).toHaveClass(/selected/);
  if (screenshots) await page.screenshot({ path: join(screenshots, 'flow-group-moved.png') });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(positions).toEqual(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(positions).toEqual(after);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect.poll(positions).toEqual(after);

  await frame.getByRole('button', { name: 'Collapse group' }).click();
  await expect(frame).toHaveClass(/collapsed/);
  await expect(frame).toHaveClass(/scene-card/);
  await expect(frame.locator('.card-label')).toHaveText('Scene group');
  await expect(frame.locator('.card-line')).toHaveText('4 scenes');
  await expect(page.locator('.scene-card[data-scene]')).toHaveCount(2);
  await expect(page.locator('.collapsed-edge')).toHaveCount(2);
  await expect(page.locator('.collapsed-edge').filter({ hasText: '3 routes' })).toHaveCount(1);
  if (screenshots) await page.screenshot({ path: join(screenshots, 'flow-group-collapsed.png') });

  const collapsedBox = (await frame.boundingBox())!;
  const collapsedLeft = await frame.evaluate(element => (element as HTMLElement).style.left);
  await page.mouse.move(collapsedBox.x + 25, collapsedBox.y + collapsedBox.height - 7);
  await page.mouse.down();
  await page.mouse.move(collapsedBox.x + 125, collapsedBox.y + collapsedBox.height + 24, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => frame.evaluate(element => (element as HTMLElement).style.left)).not.toBe(collapsedLeft);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => frame.evaluate(element => (element as HTMLElement).style.left)).toBe(collapsedLeft);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(frame.getByRole('button', { name: 'Expand group' })).toHaveAttribute('aria-expanded', 'false');
  await frame.locator('.card-title').click({ button: 'right' });
  const groupMenu = page.getByRole('menu', { name: 'Group actions' });
  await groupMenu.getByRole('menuitem', { name: 'Rename group' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename group' });
  await rename.getByLabel('Group name').fill('Arcade rotation');
  if (screenshots) await page.screenshot({ path: join(screenshots, 'rename-group-dialog.png') });
  await rename.getByRole('button', { name: 'Save name' }).click();
  await expect(frame.locator('.card-title')).toHaveText('Arcade rotation');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(frame.locator('.card-title')).not.toHaveText('Arcade rotation');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(frame.locator('.card-title')).toHaveText('Arcade rotation');
  await frame.locator('.card-title').click({ button: 'right' });
  await groupMenu.getByRole('menuitem', { name: 'Group colour' }).click();
  const colours = page.getByRole('dialog', { name: 'Group colour' });
  await expect(colours.getByRole('button', { name: 'Default', exact: true })).toHaveAttribute('aria-pressed', 'true');
  if (screenshots) await page.screenshot({ path: join(screenshots, 'flow-group-colour-picker.png') });
  await colours.getByRole('button', { name: 'Teal', exact: true }).click();
  await expect(frame).toHaveAttribute('data-group-colour', 'teal');
  await expect(frame).toHaveCSS('border-top-color', 'rgb(24, 122, 116)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(frame).not.toHaveAttribute('data-group-colour');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(frame).toHaveAttribute('data-group-colour', 'teal');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(frame.locator('.card-title')).toHaveText('Arcade rotation');
  await expect(frame).toHaveAttribute('data-group-colour', 'teal');
  if (screenshots) await page.screenshot({ path: join(screenshots, 'flow-group-coloured-card.png') });
  await frame.getByRole('button', { name: 'Expand group' }).click();
  await expect(frame.locator('.flow-group-name')).toContainText('Arcade rotation');
  await expect(frame).toHaveCSS('border-top-color', 'rgb(24, 122, 116)');
  if (screenshots) await page.screenshot({ path: join(screenshots, 'flow-group-coloured-frame.png') });
  await frame.locator('.flow-group-name').click({ button: 'right' });
  await groupMenu.getByRole('menuitem', { name: 'Group colour' }).click();
  await expect(colours.getByRole('button', { name: 'Teal', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await colours.getByRole('button', { name: 'Default', exact: true }).click();
  await expect(frame).not.toHaveAttribute('data-group-colour');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(frame).toHaveAttribute('data-group-colour', 'teal');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await frame.locator('.flow-group-name').click({ button: 'right' });
  await groupMenu.getByRole('menuitem', { name: 'Group colour' }).click();
  await colours.getByRole('button', { name: 'Custom', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Custom', exact: true });
  await expect(picker.locator('input.color-alpha')).toHaveCount(0);
  await picker.locator('.color-code input').fill('#da405c');
  await picker.locator('.color-code input').press('Enter');
  if (screenshots) await page.screenshot({ path: join(screenshots, 'flow-group-custom-picker.png') });
  await page.keyboard.press('Escape');
  await colours.getByRole('button', { name: 'Apply custom colour' }).click();
  await expect(frame).toHaveCSS('border-top-color', 'rgb(218, 64, 92)');
  if (screenshots) await page.screenshot({ path: join(screenshots, 'flow-group-custom-frame.png') });
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(frame).toHaveAttribute('data-group-colour', '#da405c');
  await expect.poll(positions).toEqual(after);
  await expect(page.locator('.collapsed-edge')).toHaveCount(0);
  await expect(page.locator('.edge-line')).toHaveCount(7);

  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('menuitem', { name: 'Export as text' }).click();
  const text = await page.getByLabel('The game as text').inputValue();
  const imported = await page.request.post(`${games}/import`, { headers, data: { gameId: randomUUID(), text } });
  expect(imported.ok()).toBe(true);
  const layout = (await imported.json()).data.definition.editor.positions;
  expect(Object.values(layout).filter(position => {
    const member = position as { groupName?: string; groupColour?: string };
    return member.groupName === 'Arcade rotation' && member.groupColour === '#da405c';
  })).toHaveLength(4);
});
