import { randomUUID } from 'node:crypto';
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
  await expect(host.getByRole('group', { name: 'Plays' }).getByRole('button', { name: 'A draw' })).toHaveAttribute('aria-pressed', 'true');
  const list = host.getByRole('group', { name: 'Games in the draw' });
  await expect(list.getByRole('combobox')).toHaveCount(2);
  // The pencil comes before the (red) remove button and opens that game's own time and settings.
  await list.getByRole('button', { name: 'Change the settings of Cut the Line' }).click();
  const settings = host.getByRole('dialog', { name: 'Cut the Line in the draw' });
  await settings.getByLabel('Time to play').fill('35');
  await settings.getByRole('group', { name: 'Target percentage' }).getByRole('button', { name: 'Exact' }).click();
  await settings.getByRole('spinbutton', { name: 'Target percentage' }).fill('42');
  await host.screenshot({ path: '/private/tmp/claude-501/-Users-dinnyvanhuizen-Projects-khaoot-bullshit/bc186d07-022f-42a3-a49f-ebef257f7bdc/scratchpad/draw-pencil.png' });
  await settings.getByRole('button', { name: 'Done' }).click();
  await host.getByRole('button', { name: 'Apply changes' }).click();
  await expect.poll(async () => (await (await host.request.get(`${games}/${gameId}`, { headers })).json()).data.definition.nodes[0].stages[0].draw[1])
    .toMatchObject({ game: 'cut-the-line', durationMs: 35_000, settings: { target: { mode: 'exact', value: 42 } } });
});
