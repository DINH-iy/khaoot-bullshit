import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chooseOption, closeHostFold, openHostFold } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');
// A real 1 × 1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('scene translations, background motion and a YouTube clip work from editor to room', async ({ browser, page, context, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'This test sets up the game in the desktop editor.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.route('https://www.youtube-nocookie.com/embed/**', route => route.fulfill({ body: `<html lang="en"><title>Clip test</title><script>
    window.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.event === 'listening') {
        event.source.postMessage(JSON.stringify({event: 'initialDelivery', info: {playerState: 1}}), event.origin);
      }
      if (message.event === 'command') document.documentElement.dataset.playback = message.func;
    });
  </script></html>`, contentType: 'text/html' }));
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const gameId = randomUUID();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  expect((await page.request.post(`${baseURL}/api/host/games`, { headers, data: { gameId, title: 'Translated clip', startFrom: 'timed-quiz' } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?edit=${gameId}`);
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  const chrome = page.locator('.editor-header');
  const sidebar = page.locator('.scene-props');
  const headerColor = await chrome.evaluate(el => getComputedStyle(el).backgroundColor);
  const sidebarColor = await sidebar.evaluate(el => getComputedStyle(el).backgroundColor);
  await page.locator('summary').getByText('Translations', { exact: true }).click();
  await chooseOption(page.getByLabel('Text language'), 'nl');
  await page.getByLabel('Question or scene text').fill('Welke planeet heeft de meeste bekende manen?');
  await page.getByLabel('Saturn', { exact: true }).fill('Saturnus');
  const field = page.getByRole('group', { name: 'Picture, video or song' });
  await field.getByRole('button', { name: 'Add media' }).click();
  await page.getByRole('dialog', { name: 'Media library' }).getByRole('button', { name: 'Add YouTube video' }).click();
  const clip = page.getByRole('dialog', { name: 'Add YouTube video' });
  await clip.getByLabel('YouTube video link').fill('https://youtu.be/M7lc1UVf-VE');
  await clip.getByLabel('Start time (seconds)').fill('5');
  await clip.getByLabel('End time (seconds)').fill('3');
  await clip.getByRole('button', { name: 'Use this clip' }).click();
  await expect(clip.getByRole('alert')).toContainText('The end must be after the start.');
  await clip.getByLabel('End time (seconds)').fill('15');
  await clip.getByRole('button', { name: 'Use this clip' }).click();
  await expect(field.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=5');
  await page.getByRole('tab', { name: 'Look & feel' }).click();
  await page.getByLabel('Change the look of').click();
  await page.getByRole('option', { name: 'The whole game' }).click();
  await page.getByRole('button', { name: 'ASCII Terminal' }).click();
  await page.locator('summary').getByText('Shapes and background', { exact: true }).click();
  await page.getByRole('button', { name: 'Starlight' }).click();
  await page.getByRole('dialog', { name: 'Change “ASCII Terminal”?' }).getByRole('button', { name: 'Only change this look' }).click();
  await expect(page.locator('.room-preview.motion-starlight')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Texts', exact: true }).click();
  await chooseOption(page.getByLabel('Text language'), 'nl');
  await page.getByRole('searchbox', { name: 'Find a text' }).fill('Join room');
  await page.getByLabel('Join room', { exact: true }).fill('Speel deze quiz');
  await page.getByRole('button', { name: 'Joining', exact: true }).click();
  await expect(page.locator('.room-preview').getByRole('button', { name: 'Speel deze quiz' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  await expect(chrome).toHaveCSS('background-color', headerColor);
  await expect(sidebar).toHaveCSS('background-color', sidebarColor);
  await expect(page.locator('.scene-canvas .tv-screen')).toHaveCSS('color', 'rgb(219, 255, 230)');
  const devices = page.getByRole('group', { name: 'Preview device' });
  await devices.getByRole('button', { name: 'Phone', exact: true }).click();
  const themedPreview = page.getByRole('region', { name: 'Preview' }).locator('.phone-screen');
  await expect(themedPreview).toHaveCSS('color', 'rgb(219, 255, 230)');
  await expect(themedPreview.locator('.timer')).toHaveText('0:20 left');
  const game = (await (await page.request.get(`${baseURL}/api/host/games/${gameId}`, { headers })).json()).data;
  expect((await page.request.post(`${baseURL}/api/host/games/${gameId}/publish`, { headers, data: { expectedRevision: game.revision } })).ok()).toBe(true);
  const sessionId = randomUUID();
  expect((await page.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId, commandId: randomUUID() } })).ok()).toBe(true);
  const response = await page.goto(`${baseURL}/?room=${sessionId}`);
  expect(response?.headers()['content-security-policy']).toContain('https://www.youtube-nocookie.com');
  const code = (await page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'nl-NL' });
  const phone = await phoneContext.newPage();
  try {
    await phone.goto(`${baseURL}/?code=${code}`);
    const background = phone.locator('.room-join.motion-starlight');
    await expect(background).toBeVisible();
    expect(await background.evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('none');
    await phone.getByLabel('Je naam').fill('Clip fan');
    await phone.getByRole('button', { name: 'Speel deze quiz', exact: true }).click();
    await expect(page.getByText('Clip fan · connected', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Start the game' }).click();
    const player = (screen: typeof page) => screen.locator('.stage-media.youtube iframe');
    await expect(player(page)).toHaveAttribute('src', /\/M7lc1UVf-VE\?autoplay=1&playsinline=1&start=5&end=15&enablejsapi=1&origin=/);
    expect(await player(page).contentFrame().locator('html').evaluate(el => el.ownerDocument.title)).toBe('Clip test');
    expect((await player(page).boundingBox())!.height).toBeGreaterThanOrEqual(200);
    await expect(player(phone)).toHaveCount(0);
    await expect(phone.getByText('Welke planeet heeft de meeste bekende manen?', { exact: true })).toBeVisible();
    await expect(phone.getByRole('radio', { name: 'Jupiter', exact: true })).toBeVisible();
    await phone.getByRole('radio', { name: 'Saturnus', exact: true }).check();
    await phone.getByRole('button', { name: 'Antwoord opslaan', exact: true }).click();
    await expect(page.getByText(/1 of 1 answered/)).toBeVisible();
    await openHostFold(page, 'Shared screen & invite');
    await page.getByRole('button', { name: 'Create display link' }).click();
    const href = await page.getByRole('link', { name: 'Open shared display' }).getAttribute('href');
    await closeHostFold(page);
    const display = await context.newPage();
    await display.goto(href!);
    await expect(player(display)).toBeVisible();
    await expect(player(page)).toHaveCount(0);
    const embedded = player(display).contentFrame().locator('html');
    await expect(embedded).toBeAttached();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(embedded).toHaveAttribute('data-playback', 'pauseVideo');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(embedded).toHaveAttribute('data-playback', 'playVideo');
  } finally { await phoneContext.close(); }
});

test('an author puts a picture in a quiz question, and the room shows it with the question', async ({ browser, page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first; the phone view is checked below.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  const mine = page.getByRole('region', { name: 'Your games' });
  const name = `Picture quiz ${randomUUID().slice(0, 4)}`;
  await mine.getByLabel('Name of your new game').fill(name);
  await chooseOption(mine.getByLabel('Start from'), { label: 'A copy of Timed quiz' });
  await mine.getByRole('button', { name: 'Create game' }).click();
  await mine.getByRole('link', { name: `Edit ${name}` }).click();
  const gameId = new URL(page.url()).searchParams.get('edit')!;

  // The Scene editor, first scene: upload a picture in the media library and use it.
  await page.getByRole('tab', { name: 'Scene editor' }).click();
  const field = page.getByRole('group', { name: 'Picture, video or song' });
  const canvas = page.locator('.scene-canvas');
  await canvas.getByRole('button', { name: 'Add media' }).click();
  const library = page.getByRole('dialog', { name: 'Media library' });
  await expect(library.getByRole('tab', { name: 'All', exact: true })).toBeVisible();
  const uploadAction = await library.getByRole('button', { name: 'Upload a file' }).boundingBox();
  const youtubeAction = await library.getByRole('button', { name: 'Add YouTube video' }).boundingBox();
  expect(Math.abs(uploadAction!.y - youtubeAction!.y)).toBeLessThan(3);
  await library.locator('input[type=file]').setInputFiles({ name: 'Eiffel tower.png', mimeType: 'image/png', buffer: PNG });
  await expect(library).toHaveCount(0);
  await expect(field.getByRole('img', { name: 'Eiffel tower.png' })).toBeVisible();
  await expect(canvas.locator('.stage-media.image img')).toBeVisible();
  await field.getByRole('button', { name: 'Remove from this scene' }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Remove this media from the scene?' });
  await confirmation.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(canvas.locator('.stage-media.image img')).toBeVisible();
  await field.getByRole('button', { name: 'Remove from this scene' }).click();
  await confirmation.getByRole('button', { name: 'Remove from this scene' }).click();
  await expect(canvas.locator('.stage-media.image img')).toHaveCount(0);
  await canvas.getByRole('button', { name: 'Add media' }).click();
  await library.getByRole('listitem').filter({ hasText: 'Eiffel tower.png' }).getByRole('button', { name: 'Use this' }).click();
  await expect(canvas.locator('.stage-media.image img')).toBeVisible();
  await page.setViewportSize({ width: 1180, height: 900 });
  const position = () => canvas.locator('.scene-composition-body').evaluate(node => {
    const copy = node.querySelector('.composition-copy')!.getBoundingClientRect();
    const media = node.querySelector('.composition-media')!.getBoundingClientRect();
    return { copyLeft: copy.left, copyRight: copy.right, mediaLeft: media.left, mediaRight: media.right };
  });
  await field.getByRole('button', { name: 'Right of the text' }).click();
  await expect.poll(async () => { const result = await position(); return result.mediaLeft - result.copyRight; }).toBeGreaterThan(0);
  await field.getByRole('button', { name: 'Left of the text' }).click();
  await expect.poll(async () => { const result = await position(); return result.copyLeft - result.mediaRight; }).toBeGreaterThan(0);
  const sizes = [];
  for (const size of ['compact', 'standard', 'wide']) {
    await chooseOption(field.getByLabel('Media size'), size);
    sizes.push((await canvas.locator(`.media-${size} .composition-media`).boundingBox())!.width);
  }
  expect(sizes[0]).toBeLessThan(sizes[1]!);
  expect(sizes[1]).toBeLessThan(sizes[2]!);
  await page.setViewportSize({ width: 1440, height: 900 });
  await field.getByRole('button', { name: 'Above the text' }).click();
  await chooseOption(field.getByLabel('Media size'), 'wide');
  await expect(canvas.locator('.media-above.media-wide .composition-media')).toBeVisible();
  expect((await canvas.locator('.stage-media.image img').boundingBox())!.width).toBeGreaterThan(100);
  const devices = page.getByRole('group', { name: 'Preview device' });
  await devices.getByRole('button', { name: 'Phone', exact: true }).click();
  await expect(page.locator('.scene-stage .phone-screen .media-above.media-wide .stage-media img')).toBeVisible();
  await devices.getByRole('button', { name: 'Shared screen', exact: true }).click();
  await expect(field).toContainText('Shows on the shared screen and the phones.');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({ timeout: 10_000 });
  // The library lists it; a file a game uses cannot be removed.
  await canvas.getByRole('button', { name: 'Media settings' }).click();
  const crop = page.getByRole('dialog', { name: 'Crop picture' });
  await chooseOption(crop.getByLabel('Crop shape'), 'landscape');
  await expect(crop.locator('.stage-media.cropped')).toBeVisible();
  await crop.getByRole('button', { name: 'Use this', exact: true }).click();
  await expect(canvas.locator('.stage-media.cropped')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await field.getByRole('button', { name: 'Media settings' }).click();
  await crop.getByRole('button', { name: 'Back to library' }).click();
  await expect(library.getByText('In this scene', { exact: true })).toBeVisible();
  await expect(library.getByLabel('Credit', { exact: true })).toBeHidden();
  await library.locator('summary').getByText('Details', { exact: true }).click();
  await expect(library.getByLabel('Credit', { exact: true })).toBeVisible();
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
      const picture = screen.locator('.media-above.media-wide .stage-media.image.cropped img');
      await expect(picture).toBeVisible();
      expect(await picture.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1);
    }
  } finally { await phoneContext.close(); }
});

/** A tenth of a second of silence as a real WAV file. */
function silentWav(seconds = 0.1): Buffer {
  const samples = Math.round(44100 * seconds); const data = Buffer.alloc(samples * 2); const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(44100, 24); header.writeUInt32LE(88200, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('the Game menu opens the shared media library from the Flow editor', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const gameId = randomUUID();
  const games = `${baseURL}/api/host/games`;
  expect((await page.request.post(games, {
    headers, data: { gameId, title: `Standalone library ${gameId.slice(0, 4)}`, startFrom: 'timed-quiz' },
  })).ok()).toBe(true);

  // The video header is enough for listing and filtering. This test doesn't play it.
  for (const [name, data] of [['Library song.wav', silentWav()], ['Library clip.mp4', Buffer.from('0000ftypisom')]] as const) {
    expect((await page.request.post(`${baseURL}/api/host/media?name=${encodeURIComponent(name)}`, {
      headers: { ...headers, 'content-type': 'application/octet-stream' }, data,
    })).ok()).toBe(true);
  }

  await page.goto(`${baseURL}/?edit=${gameId}&view=flow`);
  await page.getByRole('button', { name: /^Game menu/ }).click();
  await page.getByRole('menuitem', { name: 'Media library' }).click();
  const library = page.getByRole('dialog', { name: 'Media library' });
  await expect(library.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(library.getByText('Library clip.mp4', { exact: true })).toBeVisible();
  await expect(library.getByText('Library song.wav', { exact: true })).toBeVisible();
  await library.locator('input[type=file]').setInputFiles({ name: 'Library photo.png', mimeType: 'image/png', buffer: PNG });
  await expect(library.getByRole('img', { name: 'Library photo.png' })).toBeVisible();
  await expect(library.getByRole('button', { name: 'Use this' })).toHaveCount(0);
  await library.getByRole('tab', { name: 'Pictures' }).click();
  await expect(library.getByText('Library song.wav', { exact: true })).toHaveCount(0);
  await expect(library.getByText('Library clip.mp4', { exact: true })).toHaveCount(0);
  await library.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Flow editor' })).toHaveAttribute('aria-selected', 'true');
  const draft = (await (await page.request.get(`${games}/${gameId}`, { headers })).json()).data;
  expect(draft.revision).toBe(0);
  await page.getByRole('button', { name: 'Editing: switch to view only' }).click();
  await page.getByRole('button', { name: /^Game menu/ }).click();
  await page.getByRole('menuitem', { name: 'Media library' }).click();
  await expect(library.getByRole('img', { name: 'Library photo.png' })).toBeVisible();
  await expect(library.getByRole('button', { name: 'Upload a file' })).toHaveCount(0);
  await expect(library.getByRole('button', { name: /^Remove / })).toHaveCount(0);
});

test('a song plays in one place only: the host screen when no shared screen is connected, and the phones are told to listen', async ({ browser, page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Set up from the desktop; the phone view is checked below.');
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const samples = silentWav(15);
  for (let offset = 44; offset < samples.length; offset += 2) {
    const index = (offset - 44) / 2;
    const amplitude = index < 44100 * 3.5 ? 4000 : 16000;
    samples.writeInt16LE(Math.round(amplitude * Math.sin(index / 12)), offset);
  }
  const song = (await (await page.request.post(`${baseURL}/api/host/media?name=Thinking%20music.wav`, { headers: { ...headers, 'content-type': 'application/octet-stream' }, data: samples })).json()).data;
  expect(song).toMatchObject({ kind: 'audio', contentType: 'audio/wav' });
  const gameId = randomUUID();
  expect((await page.request.post(`${baseURL}/api/host/games`, { headers, data: { gameId, title: `Song quiz ${gameId.slice(0, 4)}`, startFrom: 'timed-quiz' } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?edit=${gameId}&view=scene`);
  const parts = (await page.locator('.scene-edit-fields > .ed-section').boundingBox())!;
  const content = (await page.locator('.stage-fields > .ed-section').first().boundingBox())!;
  expect(parts.y + parts.height).toBeCloseTo(content.y, 0);
  await page.locator('.scene-canvas').getByRole('button', { name: 'Add media' }).click();
  const item = page.getByRole('dialog', { name: 'Media library' }).getByRole('listitem').filter({ hasText: 'Thinking music.wav' });
  await item.getByRole('button', { name: 'Cut clip' }).click();
  const cut = page.getByRole('dialog', { name: 'Cut clip' });
  await cut.getByLabel('Start time (seconds)').fill('2');
  await cut.getByLabel('End time (seconds)').fill('5');
  const waveform = cut.locator('.audio-waveform');
  await expect(waveform).toBeVisible();
  const path = (await waveform.locator('path').getAttribute('d'))!;
  expect(new Set([...path.matchAll(/,([\d.]+)/g)].map(point => point[1])).size).toBeGreaterThan(2);
  await cut.getByLabel('Show waveform').uncheck();
  await expect(waveform).toHaveCount(0);
  await cut.getByLabel('Show waveform').check();
  await cut.getByRole('button', { name: 'Use this', exact: true }).click();
  const canvasAudio = page.locator('.scene-canvas .scene-audio-player');
  const sidebar = page.getByRole('group', { name: 'Picture, video or song' });
  await expect(canvasAudio).toBeVisible();
  const play = sidebar.getByRole('button', { name: 'Play the song' });
  await expect(play).toHaveCSS('height', '44px');
  await expect(play.locator('svg')).toHaveCSS('width', '16px');
  await expect(play.locator('svg')).toHaveCSS('height', '16px');
  await play.click();
  await sidebar.getByRole('button', { name: 'Pause the song' }).click();
  await expect(sidebar.getByRole('button', { name: 'Play the song' })).toBeVisible();
  const size = (await sidebar.getByRole('combobox', { name: 'Media size' }).boundingBox())!;
  const checkbox = (await sidebar.getByLabel('Show waveform').boundingBox())!;
  expect(checkbox.y + checkbox.height / 2).toBeCloseTo(size.y + size.height / 2, 0);
  await sidebar.getByLabel('Show waveform').uncheck();
  await expect(canvasAudio.locator('.audio-waveform')).toHaveCount(0);
  await sidebar.getByLabel('Show waveform').check();
  await expect(canvasAudio.locator('.audio-waveform')).toBeVisible();
  await sidebar.getByRole('button', { name: 'Media settings' }).click();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(item.locator('.media-item-info')).toContainText('In this scene');
  const actions = await item.locator('.media-item-actions button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().y));
  expect(new Set(actions).size).toBe(1);
  await page.getByRole('dialog', { name: 'Media library' }).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  const saved = (await (await page.request.get(`${baseURL}/api/host/games/${gameId}`, { headers })).json()).data;
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
    const audio = page.locator('.stage-media.audio audio');
    await expect(audio).toHaveAttribute('src', `/api/media/${song.id}`);
    await expect(audio).toHaveJSProperty('paused', false);
    await expect(page.locator('.stage-media.audio .audio-waveform')).toBeVisible();
    await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(audio).toHaveJSProperty('paused', true);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(audio).toHaveJSProperty('paused', false);
    await expect(audio).toHaveJSProperty('paused', true, { timeout: 7_000 });
    await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBeCloseTo(5, 1);
    await expect(phone.locator('.stage-media.note')).toHaveText(/Listen: the song plays on the shared screen/);
    await expect(phone.locator('audio')).toHaveCount(0);
  } finally { await phoneContext.close(); }
});

test('authors can import audio, trim it, and add the clip to the playlist from the editor', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The editor is desktop first.');
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const gameId = randomUUID();
  const creation = await page.request.post(`${baseURL}/api/host/games`, { headers, data: { gameId, title: `Audio clip ${gameId.slice(0, 4)}`, startFrom: 'timed-quiz' } });
  expect(creation.ok()).toBe(true);

  // Replace external audio processing with playable fixtures. Library reads and game saves use the real API.
  async function storeFixture(name: string, seconds: number) {
    const saved = await page.request.post(`${baseURL}/api/host/media?name=${encodeURIComponent(name)}`, {
      headers: { ...headers, 'content-type': 'application/octet-stream' }, data: silentWav(seconds),
    });
    expect(saved.ok()).toBe(true);
    return saved.json();
  }
  await page.route('**/api/host/media/youtube', async route => {
    expect(route.request().postDataJSON()).toEqual({ url: 'https://youtu.be/a1_bc-DEF23', name: 'Sound source' });
    await route.fulfill({ json: await storeFixture('Sound source', 3) });
  });
  let clipId: string | undefined;
  await page.route('**/api/host/media/*/trim', async route => {
    expect(route.request().postDataJSON()).toEqual({ name: 'Sound source clip', start: 0.5, end: 2 });
    const clip = await storeFixture('Sound source clip', 1.5);
    clipId = clip.data.id;
    await route.fulfill({ json: clip });
  });

  await page.goto(`${baseURL}/?edit=${gameId}`);
  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('menuitem', { name: 'Game settings' }).click();
  const settings = page.locator('.game-settings-panel');
  await settings.locator('summary', { hasText: 'Music' }).click();
  await settings.getByRole('button', { name: 'Add a song' }).click();
  const library = page.locator('.media-library');
  await library.getByRole('button', { name: 'Import from YouTube' }).click();
  const desktop = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 440 });
  const box = await library.boundingBox();
  expect(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 360 && box.y + box.height <= 440).toBe(true);
  await expect(library.getByRole('button', { name: 'Import MP3' })).toBeInViewport({ ratio: 1 });
  await library.getByLabel('YouTube video link').fill('https://youtu.be/a1_bc-DEF23');
  await library.getByLabel('Track name').fill('Sound source');
  await expect(library.getByRole('checkbox')).toHaveCount(0);
  await library.getByRole('button', { name: 'Import MP3' }).click();
  if (desktop) await page.setViewportSize(desktop);
  await library.getByRole('listitem').filter({ hasText: 'Sound source' }).getByRole('button', { name: 'Trim', exact: true }).click();
  await expect(library.getByLabel('End (seconds)')).toHaveValue('3');
  await library.getByLabel('Start (seconds)').fill('0.5');
  await library.getByLabel('End (seconds)').fill('2');
  await library.getByRole('button', { name: 'Save MP3 copy' }).click();
  await library.getByRole('listitem').filter({ hasText: 'Sound source clip' }).getByRole('button', { name: 'Use this' }).click();
  await expect(settings.locator('.music-list')).toContainText('Sound source clip');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  const draft = (await (await page.request.get(`${baseURL}/api/host/games/${gameId}`, { headers })).json()).data;
  expect(draft.definition.music.tracks).toEqual([{ kind: 'audio', id: clipId }]);
});

test('background playlist advances in order, repeats, and follows the scene and host volume', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Set up from the desktop.');
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const upload = async (name: string, duration: number) => (await (await page.request.post(`${baseURL}/api/host/media?name=${encodeURIComponent(name)}`,
    { headers: { ...headers, 'content-type': 'application/octet-stream' }, data: silentWav(duration) })).json()).data;
  const song = await upload('Lobby loop.wav', 1.8);
  const next = await upload('Second song.wav', 1.8);
  const gameId = randomUUID();
  const draft = (await (await page.request.post(`${baseURL}/api/host/games`, { headers, data: { gameId, title: `Music quiz ${gameId.slice(0, 4)}`, startFrom: 'timed-quiz' } })).json()).data;
  // The playlist, and the first question plays it quieter.
  const definition = { ...draft.definition, music: { tracks: [{ id: song.id, kind: 'audio' }, { id: next.id, kind: 'audio' }] }, nodes: draft.definition.nodes.map((node: { key: string; stages: object[] }) => node.key === draft.definition.startNodeKey ? { ...node, stages: [{ ...node.stages[0], music: { mode: 'quiet' } }, ...node.stages.slice(1)] } : node) };
  const saved = (await (await page.request.put(`${baseURL}/api/host/games/${gameId}/draft`, { headers, data: { expectedRevision: draft.revision, definition } })).json()).data;
  expect((await page.request.post(`${baseURL}/api/host/games/${gameId}/publish`, { headers, data: { expectedRevision: saved.revision } })).ok()).toBe(true);
  const sessionId = randomUUID();
  expect((await page.request.post(`${baseURL}/api/host/rooms`, { headers, data: { gameId, sessionId, commandId: randomUUID() } })).ok()).toBe(true);
  await page.goto(`${baseURL}/?room=${sessionId}`);

  // In the lobby, on the host's screen (no shared screen): the playlist at the standard volume (60%).
  const music = page.locator('audio[aria-hidden=true]');
  await expect(music).toHaveAttribute('src', `/api/media/${song.id}`);
  const start = page.getByRole('button', { name: 'Start the music' });
  await expect.poll(async () => await start.isVisible() || await music.evaluate(element => !(element as HTMLAudioElement).paused)).toBe(true);
  if (await start.isVisible()) await start.click();
  const volume = () => music.evaluate(element => Math.round((element as HTMLAudioElement).volume * 100));
  await expect.poll(volume).toBe(60);
  // The song is named as it starts (its file name without the extension; no credit set).
  await expect(page.locator('.music-caption')).toContainText('Lobby loop');
  await expect(music).toHaveJSProperty('loop', false);
  await expect(music).toHaveAttribute('src', `/api/media/${next.id}`);
  await expect(page.locator('.music-caption')).toContainText('Second song');
  await expect(music).toHaveAttribute('src', `/api/media/${song.id}`);
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
  await chooseOption(mine.getByLabel('Start from'), { label: 'A copy of Timed quiz' });
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
