import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
// A real 1 × 1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('an author puts a picture in a quiz question, and the room shows it with the question', async ({ browser, page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first; the phone view is checked below.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Picture quiz ${randomUUID().slice(0, 4)}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByLabel('Start from').selectOption({ label: 'A copy of Timed quiz' });
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();
  const gameId = new URL(page.url()).searchParams.get('edit')!;

  // The Scene editor, first scene: upload a picture in the media library and use it.
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  const field = page.getByRole('group', { name: 'Picture, video or song' });
  await field.getByRole('button', { name: 'Add a picture, video or song' }).click();
  const library = page.getByRole('dialog', { name: 'Media library' });
  await library.locator('input[type=file]').setInputFiles({ name: 'Eiffel tower.png', mimeType: 'image/png', buffer: PNG });
  await expect(library).toHaveCount(0);
  await expect(field.getByRole('img', { name: 'Eiffel tower.png' })).toBeVisible();
  await expect(field).toContainText('Shows on the shared screen and the phones.');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });
  // The library lists it; a file a game uses cannot be removed.
  await field.getByRole('button', { name: 'Change…' }).click();
  await expect(library.getByRole('button', { name: 'In this scene' })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.media-library').analyze()).violations).toEqual([]);
  page.once('dialog', dialog => void dialog.accept());
  await library.getByRole('button', { name: 'Remove Eiffel tower.png from the library' }).click();
  await expect(library.getByRole('alert')).toContainText('A game still uses this file');
  await library.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Play & publish' }).click(); await page.getByRole('menuitem', { name: 'Publish', exact: true }).click();
  await page.getByRole('button', { name: 'Play & publish' }).click(); await expect(page.getByRole('menuitem', { name: 'Play the published version ↗' })).toBeEnabled(); await page.keyboard.press('Escape');

  // A room of the published game: the host's screen (no shared screen connected) and a phone show the picture.
  const sessionId = randomUUID();
  expect((await page.request.post(`${baseURL}/api/host/rooms`, { headers: { 'x-party-request': '1', origin: baseURL! }, data: { gameId, sessionId, commandId: randomUUID() } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?room=${sessionId}`);
  const roomCode = (await page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const phone = await phoneContext.newPage();
  try {
    await phone.goto(`${baseURL}/?code=${roomCode}`);
    await phone.getByLabel('Your name').fill('Picture fan');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    // The host starts once the player shows up (as a host would); a start sent while the room changes is refused.
    await expect(page.getByText('Picture fan · connected', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Start the game' }).click();
    for (const screen of [page, phone]) {
      const picture = screen.locator('.stage-media.image img');
      await expect(picture).toBeVisible();
      expect(await picture.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1);
    }
  } finally { await phoneContext.close(); }
});

/** A tenth of a second of silence as a real WAV file. */
function silentWav(): Buffer {
  const samples = 4410; const data = Buffer.alloc(samples * 2); const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(44100, 24); header.writeUInt32LE(88200, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('a song plays in one place only: the host screen when no shared screen is connected, and the phones are told to listen', async ({ browser, page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Set up from the desktop; the phone view is checked below.');
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const song = (await (await page.request.post(`${baseURL}/api/host/media?name=Thinking%20music.wav`, { headers: { ...headers, 'content-type': 'application/octet-stream' }, data: silentWav() })).json()).data;
  expect(song).toMatchObject({ kind: 'audio', contentType: 'audio/wav' });
  const gameId = randomUUID();
  const draft = (await (await page.request.post(`${baseURL}/api/host/games`, { headers, data: { gameId, title: `Song quiz ${gameId.slice(0, 4)}`, startFrom: 'timed-quiz' } })).json()).data;
  const definition = { ...draft.definition, nodes: draft.definition.nodes.map((node: { key: string; stages: object[] }) => node.key === draft.definition.startNodeKey ? { ...node, stages: [{ ...node.stages[0], media: { id: song.id, kind: 'audio' } }, ...node.stages.slice(1)] } : node) };
  const saved = (await (await page.request.put(`${baseURL}/api/host/games/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  expect((await page.request.post(`${baseURL}/api/host/games/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  const sessionId = randomUUID();
  expect((await page.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId, commandId: randomUUID() } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?room=${sessionId}`);
  const roomCode = (await page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const phone = await phoneContext.newPage();
  try {
    await phone.goto(`${baseURL}/?code=${roomCode}`);
    await phone.getByLabel('Your name').fill('Listener');
    await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    // The host starts once the player shows up (as a host would); a start sent while the room changes is refused.
    await expect(page.getByText('Listener · connected', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expect(page.locator('.stage-media.audio audio')).toHaveAttribute('src', `/api/media/${song.id}`);
    await expect(phone.locator('.stage-media.note')).toHaveText(/Listen: the song plays on the shared screen/);
    await expect(phone.locator('audio')).toHaveCount(0);
  } finally { await phoneContext.close(); }
});

test('background music plays from the lobby on, follows the scene and the host’s volume, and stops when switched off', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Set up from the desktop.');
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const song = (await (await page.request.post(`${baseURL}/api/host/media?name=Lobby%20loop.wav`, { headers: { ...headers, 'content-type': 'application/octet-stream' }, data: silentWav() })).json()).data;
  const gameId = randomUUID();
  const draft = (await (await page.request.post(`${baseURL}/api/host/games`, { headers, data: { gameId, title: `Music quiz ${gameId.slice(0, 4)}`, startFrom: 'timed-quiz' } })).json()).data;
  // The playlist, and the first question plays it quieter.
  const definition = { ...draft.definition, music: { tracks: [{ id: song.id, kind: 'audio' }] }, nodes: draft.definition.nodes.map((node: { key: string; stages: object[] }) => node.key === draft.definition.startNodeKey ? { ...node, stages: [{ ...node.stages[0], music: { mode: 'quiet' } }, ...node.stages.slice(1)] } : node) };
  const saved = (await (await page.request.put(`${baseURL}/api/host/games/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  expect((await page.request.post(`${baseURL}/api/host/games/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  const sessionId = randomUUID();
  expect((await page.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId, commandId: randomUUID() } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?room=${sessionId}`);

  // In the lobby, on the host's screen (no shared screen): the playlist at the standard volume (60%).
  const music = page.locator('audio[aria-hidden=true]');
  await expect(music).toHaveAttribute('src', `/api/media/${song.id}`);
  const start = page.getByRole('button', { name: 'Start the music' });
  if (await start.isVisible()) await start.click();
  const volume = () => music.evaluate(element => Math.round((element as HTMLAudioElement).volume * 100));
  await expect.poll(volume).toBe(60);
  // The song is named as it starts (its file name without the extension; no credit set).
  await expect(page.locator('.music-caption')).toContainText('Lobby loop');
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect.poll(volume).toBe(18);
  // The host turns it up for the room, then switches it off.
  expect((await page.request.post(`${baseURL}/api/rooms/${sessionId}/settings`, { headers, data: { musicVolume: 100 } })).ok()).toBe(true);
  await expect.poll(volume).toBe(30);
  expect((await page.request.post(`${baseURL}/api/rooms/${sessionId}/settings`, { headers, data: { music: false } })).ok()).toBe(true);
  await expect(music).toHaveCount(0);
});

test('in the editor, a song goes on the game’s playlist and a scene chooses silence', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Music editor ${randomUUID().slice(0, 4)}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await mine.getByLabel('Start from').selectOption({ label: 'A copy of Timed quiz' });
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();
  const gameId = new URL(page.url()).searchParams.get('edit')!;

  await page.getByRole('button', { name: 'Game menu' }).click(); await page.getByRole('menuitem', { name: 'Game settings' }).click();
  const settings = page.locator('.game-settings-panel');
  await settings.locator('summary', { hasText: 'Music' }).click();
  await settings.getByRole('button', { name: 'Add a song' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a song' });
  await dialog.locator('input[type=file]').setInputFiles({ name: 'Quiz loop.wav', mimeType: 'audio/wav', buffer: silentWav() });
  await expect(dialog).toHaveCount(0);
  await expect(settings.locator('.music-list')).toContainText('Quiz loop.wav');
  await expect(settings.locator('summary', { hasText: 'Music' })).toContainText('1 song');
  await settings.getByRole('button', { name: 'Close' }).first().click();

  await page.getByRole('tab', { name: 'Scene editor' }).click();
  // A scene can have several parts, each with its own Music group: the first part's.
  const group = page.locator('.scene-props summary', { hasText: 'Music' }).first();
  if (!(await page.getByRole('group', { name: 'Music during this scene' }).first().isVisible())) await group.click();
  await page.getByRole('group', { name: 'Music during this scene' }).first().getByRole('button', { name: 'Silence', exact: true }).click();
  await expect(group).toContainText('Silence');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });
  const draft = (await (await page.request.get(`${baseURL}/api/host/games/${gameId}`, { headers: { 'x-party-request': '1' } })).json()).data;
  expect(draft.definition.music.tracks).toHaveLength(1);
  expect(draft.definition.nodes.some((node: { stages: { music?: { mode: string } }[] }) => node.stages.some(stage => stage.music?.mode === 'stop'))).toBe(true);
});
