import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { closeRoundsByHand } from './helpers.js';

const token = process.env['LOCAL_OWNER_TOKEN'];
if (!token || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
const shots = process.env['DRAW_SHOTS'];
const shoot = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };

// Players make the teams and each team may pick its own colour; then a quiz round in those teams.
const definition = {
  formatVersion: 1, title: 'Colour teams', startNodeKey: 'pick',
  nodes: [
    { key: 'pick', stages: [{ key: 'teams', kind: 'teams', prompt: 'Pick your teams', durationMs: null, form: { split: { kind: 'count', teams: 2 }, formation: 'players', colors: 'teams' } }] },
    { key: 'quiz', stages: [{ key: 'main', kind: 'collect', prompt: 'Two plus two?', durationMs: null, input: { kind: 'choice', layout: 'tiles', options: [{ key: 'four', label: '4' }, { key: 'five', label: '5' }] },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'four', awardMilli: '1000' }, play: { kind: 'teams', lineup: { kind: 'game' }, answers: 'everyone', points: 'team' } }] },
  ],
  edges: [{ key: 'pick-quiz', from: 'pick', to: 'quiz' }],
};

test('teams pick their colour from a set, the host picks any colour, and a player’s page wears the team colour', async ({ page: host, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The phones use separate narrow contexts.');
  await host.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(host.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID(); const roomId = randomUUID();
  const api = `${baseURL}/api/host/games`; const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await host.request.post(api, { headers, data: { gameId, title: 'Colour teams', startFrom: 'timed-quiz' } })).json()).data;
  expect((await host.request.put(`${api}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  const saved = (await (await host.request.get(`${api}/${gameId}`, { headers })).json()).data;
  expect((await host.request.post(`${api}/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  expect((await host.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId: roomId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`${baseURL}/?room=${roomId}`);
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);

  const phones = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })));
  try {
    const [ada, ben] = await Promise.all(phones.map(context => context.newPage())) as [Page, Page];
    for (const [phone, name] of [[ada, 'Ada'], [ben, 'Ben']] as const) {
      await phone.goto(`${baseURL}/?code=${code}`);
      await phone.getByLabel('Your name').fill(name);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(host.getByText(`${name} · connected`, { exact: false })).toBeVisible();
    }
    await host.getByRole('button', { name: 'Start the game' }).click();
    await ada.getByRole('button', { name: 'Join Red' }).click();
    await ben.getByRole('button', { name: 'Join Blue' }).click();

    // Ada's team picks teal from the set; Blue's colour is taken for her.
    const swatches = ada.getByRole('radiogroup', { name: 'Your team’s colour' });
    await expect(swatches.getByRole('radio', { name: /Blue \(another team’s\)/ })).toBeDisabled();
    await swatches.getByRole('radio', { name: 'Teal', exact: true }).click();
    await expect(swatches.getByRole('radio', { name: 'Teal', exact: true })).toHaveAttribute('aria-checked', 'true');
    // Named after its colour, the team follows it: Red is now Teal.
    await expect(ada.getByRole('button', { name: 'You are in Teal' })).toBeVisible();
    await shoot(ada, 'teams-1-player-picks');
    // Ben's phone has no say over Red's colour.
    await expect(ben.getByRole('radiogroup', { name: 'Your team’s colour' }).getByRole('radio', { name: /Teal/ })).toBeDisabled();

    // The host picks any colour for Blue with the picker.
    await host.getByRole('button', { name: 'Colour of Blue' }).click();
    const picker = host.getByRole('dialog', { name: 'Colour of Blue' });
    await picker.getByRole('button', { name: 'HEX', exact: true }).click();
    await picker.getByLabel('Hex code').fill('#123456');
    await picker.getByLabel('Hex code').press('Enter');
    await picker.getByLabel('Hex code').press('Escape');
    await shoot(host, 'teams-2-host');
    await expect(ben.locator('.team-column.mine')).toHaveCSS('--team', '#123456');

    // Once the teams are made: each phone wears its team colour along the top, and the chip shows only the colour.
    await host.getByRole('button', { name: 'Start round with these teams' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(ada.getByRole('heading', { name: 'Two plus two?' })).toBeVisible();
    await expect(ada.locator('main.room')).toHaveCSS('border-top-color', 'rgb(43, 179, 163)');
    await expect(ben.locator('main.room')).toHaveCSS('border-top-color', 'rgb(18, 52, 86)');
    await expect(ada.locator('.team-flag')).toHaveCSS('background-color', 'rgb(43, 179, 163)');
    expect(await ada.locator('.team-flag').evaluate(chip => [...chip.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim())).toBe('');
    await shoot(ada, 'teams-3-phone-in-team');
  } finally {
    await Promise.all(phones.map(context => context.close()));
  }
});

test('the author renames teams in the editor; more teams get free standard names, and standard names are not stored', async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The editor is desktop first.');
  await page.goto(`${baseURL}/?host=1#owner=${token}`);
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
  const gameId = randomUUID(); const api = `${baseURL}/api/host/games`; const headers = { 'x-party-request': '1', origin: baseURL! };
  const draft = (await (await page.request.post(api, { headers, data: { gameId, title: 'Named teams', startFrom: 'timed-quiz' } })).json()).data;
  expect((await page.request.put(`${api}/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).ok()).toBe(true);
  const form = async () => (await (await page.request.get(`${api}/${gameId}`, { headers })).json()).data.definition.nodes[0].stages[0].form;
  await page.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  const names = page.getByRole('group', { name: 'Team names' });
  await expect(names.getByLabel('Team 1')).toHaveAttribute('placeholder', 'Red');
  await names.getByLabel('Team 2').fill('Sharks');
  await expect.poll(async () => (await form()).names).toEqual(['Red', 'Sharks']);
  // A third team: its name is a standard one nobody has.
  await page.getByLabel('Number of teams').fill('3');
  await expect.poll(async () => (await form()).names).toEqual(['Red', 'Sharks', 'Blue']);
  // The same name twice is pointed out.
  await names.getByLabel('Team 3').fill('sharks');
  await expect(names.getByRole('alert')).toContainText('same name');
  await names.getByLabel('Team 3').fill('Jets');
  await expect(names.getByRole('alert')).toHaveCount(0);
  await shoot(page, 'team-names-editor');
  // Back to the standard names: no own names are kept.
  for (const index of [2, 3]) await names.getByLabel(`Team ${index}`).fill('');
  await expect.poll(async () => (await form()).names).toBeUndefined();
  await names.getByLabel('Team 1').fill('Sharks');
  await expect.poll(async () => (await form()).names).toEqual(['Sharks', 'Blue', 'Green']);
});
