import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chooseOption, closeRoundsByHand, expectPhoneScores, openHostFold, openHostTool } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('owner options sign in without a key on both localhost addresses', async ({ page, baseURL }) => {
  for (const hostname of ['127.0.0.1', 'localhost']) {
    const local = new URL(baseURL!);
    local.hostname = hostname;
    await page.goto(local.href);
    const headers = { origin: local.origin, 'x-party-request': '1', 'sec-fetch-site': 'same-origin' };
    expect((await page.request.get(new URL('/api/host', local).href, { headers })).status()).toBe(401);
    expect((await page.request.post(new URL('/api/host/claim-local', local).href, { headers: { ...headers, 'x-forwarded-for': '192.0.2.1' }, data: {} })).status()).toBe(403);
    await page.getByRole('link', { name: 'Owner options' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
    expect(new URL(page.url()).searchParams.has('localOwner')).toBe(false);
    const cookie = (await page.context().cookies(`${local.origin}/api/host`)).find(item => item.name === 'party_owner');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.value).not.toBe(ownerToken);
    expect((await page.request.get(new URL('/api/host/people', local).href, { headers })).status()).toBe(200);
    expect((await page.request.get(new URL('/api/host/people', local).href, { headers: { ...headers, forwarded: 'for=192.0.2.1' } })).status()).toBe(401);
  }
});

test('the test bench caps at four phones in two columns and keeps reactions inside a phone', async ({ page, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'The four-phone bench is exercised on the desktop.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await page.getByRole('radio', { name: /Timed quiz/ }).check();
  await page.getByRole('button', { name: 'Open room', exact: true }).click();
  await openHostFold(page, 'Shared screen & invite');
  const url = await page.getByRole('link', { name: 'Open test bench ↗' }).getAttribute('href');
  await page.evaluate(() => localStorage.setItem('party_bench_phones', '8'));
  await page.goto(url!);

  await expect(page.getByRole('button', { name: 'One phone more' })).toBeDisabled();
  const phones = page.locator('.bench-phone');
  await expect(phones).toHaveCount(4);
  const boxes = await phones.evaluateAll(items => items.map(item => item.getBoundingClientRect().toJSON() as DOMRect));
  expect(boxes[0]!.y).toBe(boxes[1]!.y);
  expect(boxes[2]!.y).toBe(boxes[3]!.y);
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
  expect(await page.locator('.bench-phones').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  const first = page.frameLocator('iframe[title="Phone of Player 1"]');
  await first.getByRole('button', { name: 'Send a reaction', exact: true }).click();
  const tray = first.getByRole('dialog', { name: 'Send a reaction' });
  await expect(tray).toBeVisible();
  expect(await tray.locator('.reaction-grid').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await tray.getByRole('button', { name: /TY FOR TUTORIAL/ }).click();
  const host = page.frameLocator('iframe[title="Host screen"]');
  await page.setViewportSize({ width: 1050, height: 900 });
  const manage = host.getByRole('button', { name: 'Manage Player 1', exact: true });
  await manage.click();
  const row = host.locator('.host-player-list > li').filter({ has: manage });
  await expect(row.getByLabel('Display name')).toHaveValue('Player 1');
  expect(await row.evaluate(item => {
    const header = item.querySelector('.host-player-row')!.getBoundingClientRect();
    const form = item.querySelector('form')!.getBoundingClientRect();
    const name = item.querySelector('.host-player-name')!;
    const text = document.createRange();
    text.selectNodeContents(name);
    return form.top >= header.bottom && form.right <= item.getBoundingClientRect().right
      && item.scrollWidth === item.clientWidth && text.getClientRects().length === 1;
  })).toBe(true);
  const reaction = host.locator('.reactions-overlay .reaction').filter({ hasText: 'TY FOR TUTORIAL' });
  await expect(reaction).toContainText('Player 1');
  expect(await reaction.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
  })).toBe(true);
});

test('an assigned host phone still answers and can close a round with immediate auto-reveal', async ({ browser, page, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await host.getByRole('radio', { name: /Timed quiz/ }).check();
    await host.getByRole('button', { name: 'Open room', exact: true }).click();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    await closeRoundsByHand(host);
    await page.goto(`/?code=${roomCode}`);
    await page.getByLabel('Your name').fill('Playing host');
    await page.getByRole('button', { name: 'Join room', exact: true }).click();

    await expect(host.getByText('Playing host · connected', { exact: false })).toBeVisible();
    const phonePicker = host.getByRole('combobox', { name: 'Host phone', exact: true });
    await chooseOption(phonePicker, { label: 'Playing host' });
    const menu = page.getByRole('button', { name: 'Host controls', exact: true });
    const controls = page.getByRole('dialog', { name: 'Host controls' });
    await menu.click();
    await controls.getByLabel('Automatically reveal results').click();
    await expect(controls.getByLabel('Reveal delay in seconds')).toHaveValue('0');
    await controls.getByRole('button', { name: 'Start the game' }).click();

    await page.getByRole('radio', { name: 'Saturn', exact: true }).check();
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    await menu.click();
    await controls.getByRole('button', { name: 'Close answers' }).click();
    await expect(page.getByRole('region', { name: 'Round results' })).toContainText('Correct answer: Saturn');
    await expect(host.getByRole('region', { name: 'Round results' })).toContainText('Correct answer: Saturn');
  } finally { await hostContext.close(); }
});

test('ranked ballots preserve the saved choices and advance result cards on the timer', async ({ browser, page: host, baseURL }) => {
  await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  const headers = { 'x-party-request': '1', origin: baseURL! };
  const gameId = randomUUID();
  const title = 'Ranked answers';
  const draft = await host.request.post('/api/host/games', { headers, data: { gameId, title, startFrom: null } });
  expect(draft.ok()).toBe(true);
  const definition = {
    formatVersion: 1, title, startNodeKey: 'write',
    nodes: [
      { key: 'write', stages: [{ kind: 'collect', key: 'write', prompt: 'Write a joke', durationMs: null, input: { kind: 'text', maxLength: 100 }, scoring: { kind: 'none' } }] },
      { key: 'vote', stages: [{ kind: 'vote', key: 'vote', prompt: 'Rank the jokes', durationMs: null, source: { nodeKey: 'write', stageKey: 'write' }, awardPerVoteMilli: '1000', voteMode: 'ranked', voteLimit: 2, resultCards: 4 }] },
    ],
    edges: [{ key: 'write-to-vote', from: 'write', to: 'vote' }],
  };
  const saved = await host.request.put(`/api/host/games/${gameId}/draft`, { headers, data: { expectedRevision: (await draft.json()).data.revision, definition } });
  expect(saved.ok(), await saved.text()).toBe(true);
  expect((await host.request.post(`/api/host/games/${gameId}/publish`, { headers, data: { expectedRevision: (await saved.json()).data.revision } })).ok()).toBe(true);
  const sessionId = randomUUID();
  expect((await host.request.post('/api/host/rooms', { headers, data: { gameId, sessionId, commandId: randomUUID() } })).ok()).toBe(true);
  await host.goto(`/?room=${sessionId}`);
  const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);

  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext({ viewport: { width: 375, height: 667 } })));
  try {
    const phones = await Promise.all(contexts.map(context => context.newPage()));
    const ada = phones[0]!; const bo = phones[1]!; const voter = phones[2]!;
    await Promise.all(phones.map(async (phone, i) => {
      await phone.goto(`${baseURL}/?code=${roomCode}`);
      await phone.getByLabel('Your name').fill(['Ada', 'Bo', 'Voter'][i]!);
      await phone.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(phone.getByRole('heading', { name: `Room ${roomCode}` })).toBeVisible();
    }));
    await host.getByRole('button', { name: 'Start the game' }).click();
    for (const [phone, joke] of [[ada, 'A joke about a seal'], [bo, 'A joke about a crab']] as const) {
      await phone.getByRole('textbox').fill(joke);
      await phone.getByRole('button', { name: 'Save answer' }).click();
      await expect(phone.getByText('Your answer is in!')).toBeVisible();
    }
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(ada.getByRole('checkbox', { name: /a seal/ })).toBeDisabled();
    await voter.getByRole('checkbox', { name: /a crab/ }).check();
    await expect(voter.getByRole('checkbox', { name: /^1\..*a crab/ })).toBeChecked();
    await voter.getByRole('checkbox', { name: /a seal/ }).check();
    await expect(voter.getByRole('checkbox', { name: /^2\..*a seal/ })).toBeChecked();
    await voter.getByRole('button', { name: 'Save vote' }).click();
    await expect(voter.locator('.saved-vote-badge')).toHaveCount(2);
    await voter.reload();
    await expect(voter.locator('.saved-vote-badge')).toHaveCount(2);
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Reveal results' }).click();

    const results = voter.getByRole('region', { name: 'Round results' });
    await expect(results.locator('.ballot-entry')).toHaveCount(1);
    await expect(results.locator('.ballot-entry')).toContainText('Bo · 2 pts');
    await expect(results.locator('.ballot-entry')).toContainText('Ada · 1 pts');
    await expect(results.locator('.result-card-controls')).toContainText('2 of 2');
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('owner opens a room from the host menu and stays in control of a timed stage', async ({ browser, page, baseURL }) => {
  // A signed-out local browser can sign in before seeing the games.
  await page.goto('/?host=1');
  await expect(page.getByRole('button', { name: 'Sign in as owner' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open room', exact: true })).toHaveCount(0);

  const hostContext = await browser.newContext(); const host = await hostContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await expect(host.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
    await expect(host).not.toHaveURL(/owner=/);
    expect(await host.evaluate(() => document.cookie)).not.toContain('party_');
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    await host.getByRole('radio', { name: /Timed quiz/ }).check();
    await host.getByRole('button', { name: 'Open room', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Start the game' })).toBeVisible();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    await closeRoundsByHand(host);

    await page.goto(`/?code=${roomCode}`);
    await page.getByLabel('Your name').fill('Phone player');
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(host.getByText('Phone player · connected', { exact: false })).toBeVisible();
    await host.getByRole('button', { name: 'Start the game' }).click();
    const playerTimer = page.getByRole('timer', { name: 'Time left' });
    await expect(playerTimer).toHaveText(/^0:(1\d|20) left$/);
    await expect(page.getByRole('toolbar', { name: 'Round tools' })).toHaveCount(0);

    await openHostTool(host, 'Set the time');
    await host.getByRole('button', { name: '+1 min' }).click();
    await expect(playerTimer).toHaveText(/^1:\d\d left$/);
    await host.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(playerTimer).toHaveText(/^Paused · 1:\d\d left$/);
    const frozen = await playerTimer.textContent();
    await page.waitForTimeout(1500);
    await expect(playerTimer).toHaveText(frozen!);
    await host.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(playerTimer).toHaveText(/^1:\d\d left$/);

    await expect(page.locator('fieldset.tiles').getByRole('radio')).toHaveCount(4);
    await page.getByRole('radio', { name: 'Saturn', exact: true }).check();
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // The host overrides the clock; the server then closes the stage by itself.
    await openHostTool(host, 'Set the time');
    await host.getByLabel('Time left (seconds)').fill('1');
    await host.getByRole('button', { name: 'Set time', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
    await expect(playerTimer).toHaveCount(0);
    await openHostTool(host, 'Reopen answers');
    await host.getByRole('button', { name: 'Reopen for 30 seconds' }).click();
    await expect(playerTimer).toHaveText(/^0:(2\d|30) left$/);
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    await openHostTool(host, 'Set the time');
    await host.getByRole('button', { name: 'Remove time limit' }).click();
    await expect(playerTimer).toHaveText('No time limit');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // Answer styles are set per round: tiles first, then a plain list, then ordering.
    await expect(page.locator('fieldset.tiles')).toHaveCount(0); // already answered; tiles were used above
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Pacific', exact: true })).toBeVisible();
    await expect(page.locator('fieldset.tiles')).toHaveCount(0);
    // Moving on revealed round one: the scoreboard now counts the correct Saturn answer.
    await expectPhoneScores(page, ['Phone player (you)10']);
    await page.getByRole('radio', { name: 'Pacific', exact: true }).check();
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(page.getByText('1 of 1 answered')).toBeVisible();
    await host.getByRole('button', { name: 'Close answers' }).click();
    // Locked but not revealed: no answer, no new points yet.
    await expect(page.getByText('answers are locked')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Round results' })).toHaveCount(0);
    await expectPhoneScores(page, ['Phone player (you)10']);
    await host.getByRole('button', { name: 'Reveal results' }).click();
    const results = page.getByRole('region', { name: 'Round results' });
    await expect(results).toContainText('Correct answer: Pacific');
    await expect(results).toContainText('You earned 10 points this round.');
    await expectPhoneScores(page, ['Phone player (you)20']);
    await expect(host.getByRole('button', { name: 'Reopen answers' })).toHaveCount(0);
    // The host fixes a score; the player sees it without any earlier entry being edited.
    await host.getByRole('button', { name: 'Correct scores' }).click();
    await host.getByLabel('Correct score for Phone player (+ or −)').fill('-3');
    await host.getByRole('button', { name: 'Correct score', exact: true }).click();
    await expectPhoneScores(page, ['Phone player (you)17']);
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('fieldset.tiles')).toBeVisible();
    await host.getByRole('button', { name: 'Close answers' }).click();
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    const items = page.locator('.order-list .order-label');
    await expect(items).toHaveCount(4);
    // The buttons also work without using a drag gesture.
    const wanted = ['Mouse', 'Wolf', 'Horse', 'Hippopotamus'];
    for (let target = 0; target < wanted.length; target++) {
      for (let guard = 0; guard < 4 && (await items.nth(target).textContent()) !== wanted[target]; guard++) await page.getByRole('button', { name: `Move ${wanted[target]} up` }).click();
    }
    await expect(items).toHaveText(wanted);
    await expect(page.getByRole('button', { name: 'Move Mouse up' })).toBeDisabled();
    await items.nth(1).scrollIntoViewIfNeeded();
    const from = (await items.nth(1).boundingBox())!;
    const to = (await items.nth(0).boundingBox())!;
    const points = [from, to].map(({ x, y, width, height }) => ({ x: Math.round(x + width / 2), y: Math.round(y + height / 2) }));
    if (test.info().project.name === 'android-chrome') {
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]!] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[1]!] });
      await expect(page.locator('.order-list [data-drop="before"]')).toContainText('Mouse');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else {
      await page.mouse.move(points[0]!.x, points[0]!.y);
      await page.mouse.down();
      await page.mouse.move(points[1]!.x, points[1]!.y, { steps: 4 });
      await expect(page.locator('.order-list [data-drop="before"]')).toContainText('Mouse');
      await page.mouse.up();
    }
    await expect(items).toHaveText(['Wolf', 'Mouse', 'Horse', 'Hippopotamus']);
    await page.getByRole('button', { name: 'Move Mouse up' }).click();
    await expect(items).toHaveText(wanted);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Your answer is in!')).toBeVisible();

    // The owner can always get back into the room from the menu.
    await host.getByRole('button', { name: 'Leave room', exact: true }).click();
    const leave = host.getByRole('alertdialog', { name: 'Leave the room?' });
    await expect(leave).toContainText('The room stays open');
    await leave.getByRole('button', { name: 'Stay' }).click();
    await expect(host.getByRole('heading', { name: `Room ${roomCode}` })).toBeVisible();
    await host.getByRole('button', { name: 'Leave room', exact: true }).click();
    await leave.getByRole('link', { name: 'OK, leave' }).click();
    await expect(page.getByText('Your answer is in!')).toBeVisible();
    await host.getByRole('button', { name: `Return to room ${roomCode}` }).click();
    await expect(host.getByRole('heading', { name: `Room ${roomCode}` })).toBeVisible();
    await expect(host.getByRole('button', { name: 'Close answers' })).toBeVisible();
  } finally { await hostContext.close(); }
});

test('the host goes back to the lobby: a fresh room with a new code, and the phone follows by itself', async ({ browser, page, baseURL }) => {
  const hostContext = await browser.newContext(); const host = await hostContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await host.getByRole('radio', { name: /Timed quiz/ }).check();
    await host.getByRole('button', { name: 'Open room', exact: true }).click();
    const firstCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    await page.goto(`/?code=${firstCode}`);
    await page.getByLabel('Your name').fill('Stays along');
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(host.getByText('Stays along · connected', { exact: false })).toBeVisible();
    await host.getByRole('button', { name: 'Start the game' }).click();
    await expect(page.getByRole('timer', { name: 'Time left' })).toBeVisible();
    // It asks first, then starts over in a new lobby; the phone moves along with its name.
    await host.getByRole('button', { name: 'Back to lobby' }).click();
    await host.getByRole('button', { name: 'Yes, back to lobby' }).click();
    await expect(host.getByRole('button', { name: 'Start the game' })).toBeVisible();
    const secondCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    expect(secondCode).not.toBe(firstCode);
    await expect(page.getByRole('heading', { name: `Room ${secondCode}` })).toBeVisible();
    await expect(host.getByText('Stays along · connected', { exact: false })).toBeVisible();
  } finally { await hostContext.close(); }
});

test('players can save the active look, leave the room, and see host moderation changes', async ({ browser, page, baseURL }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await host.getByRole('radio', { name: /Timed quiz/ }).check();
    await host.getByRole('button', { name: 'Open room', exact: true }).click();
    const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    await openHostFold(host, 'Room settings');
    await host.getByRole('switch', { name: /Players confirm their look/ }).check();
    await host.getByRole('dialog', { name: 'Room settings' }).getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto(`/?code=${code}`);
    await page.getByLabel('Your name').fill('Draw and leave');
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Room ${code}` })).toBeVisible();
    const room = page.url();
    const settings = () => page.getByRole('dialog', { name: 'Your look' });
    await page.getByRole('button', { name: 'Change my look' }).click();
    await settings().getByRole('tab', { name: 'Draw', exact: true }).click();
    const pad = settings().getByRole('application');
    await pad.focus();
    await pad.press('Space');
    await pad.press('ArrowRight');
    await pad.press('ArrowDown');
    await pad.press('Space');
    await settings().getByRole('button', { name: 'Save drawing' }).click();
    await expect(settings()).toHaveCount(0);
    await expect(host.locator('.lobby-seats .avatar-picture path')).not.toHaveCount(0);

    const picture = { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') };
    await page.getByRole('button', { name: 'Change my look' }).click();
    await settings().getByRole('tab', { name: 'Photo' }).click();
    await settings().locator('input[type=file]').setInputFiles(picture);
    await expect(settings().locator('.look-hero img')).toBeVisible();
    await settings().getByRole('tab', { name: 'Character' }).click();
    await settings().getByRole('button', { name: 'Save my look' }).click();
    await expect(host.locator('.lobby-seats .avatar-picture path')).not.toHaveCount(0);

    await page.getByRole('button', { name: 'Change my look' }).click();
    await settings().getByRole('tab', { name: 'Photo' }).click();
    await settings().locator('input[type=file]').setInputFiles(picture);
    await expect(settings().locator('.look-hero img')).toBeVisible();
    await settings().getByRole('button', { name: 'Save my look' }).click();
    await expect(host.locator('.lobby-seats .avatar-picture img')).toBeVisible();

    await host.getByRole('button', { name: 'Manage Draw and leave' }).click();
    await host.getByLabel('Display name', { exact: true }).fill('New display name');
    await host.getByRole('button', { name: 'Save name' }).click();
    await expect(host.getByRole('button', { name: 'Manage New display name' })).toBeVisible();
    const oldPhoto = await host.locator('.lobby-seats .avatar-picture img').getAttribute('src');
    await host.locator('.player-moderation input[type=file]').setInputFiles(picture);
    await host.getByRole('button', { name: 'Replace photo', exact: true }).click();
    await expect(host.locator('.lobby-seats .avatar-picture img')).not.toHaveAttribute('src', oldPhoto!);

    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const footer = page.locator('.phone-menu-footer');
    await expect(footer.getByRole('button')).toHaveText(['Settings', 'English', 'Leave room']);
    const leave = footer.getByRole('button', { name: 'Leave room', exact: true });
    await expect(leave).toHaveCSS('background-color', 'rgb(168, 32, 55)');
    await leave.click();
    const confirmation = page.getByRole('alertdialog', { name: 'Leave the room?' });
    await expect(confirmation.getByRole('button', { name: 'Stay' })).toBeFocused();
    await confirmation.getByRole('button', { name: 'Stay' }).click();
    await expect(page).toHaveURL(room);
    await leave.click();
    await confirmation.getByRole('link', { name: 'OK, leave' }).click();
    await expect(page).toHaveURL(new URL('/', baseURL).href);
    await page.goto(room);
    await expect(page.getByRole('heading', { name: `Room ${code}` })).toBeVisible();
    await openHostFold(host, 'Room settings');
    host.once('dialog', dialog => dialog.accept());
    await host.getByRole('button', { name: 'Close room', exact: true }).click();
    await expect(host).toHaveURL(new URL('/', baseURL).href);
    await expect(page).toHaveURL(new URL('/', baseURL).href);
    await expect(page.getByRole('button', { name: 'Join room', exact: true })).toBeVisible();
  } finally { await hostContext.close(); }
});
