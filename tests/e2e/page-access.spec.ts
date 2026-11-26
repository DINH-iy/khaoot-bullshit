import { expect, test } from '@playwright/test';

const id = '7ab4af42-05be-4e8e-9a81-3001de111fac';

test('admin waits for confirmed owner access and sends editors home', async ({ page }) => {
  let respond!: () => void;
  const pending = new Promise<void>(resolve => { respond = resolve; });
  await page.route('**/api/host/access', async route => {
    await pending;
    await route.fulfill({ json: { ok: true, data: { role: 'editor', localSignIn: false } } });
  });
  const privilegedRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/host/people')) privilegedRequests.push(request.url());
  });

  const checkingAccess = page.waitForRequest('**/api/host/access');
  await page.goto('/?admin=people');
  await checkingAccess;
  await expect(page.locator('.admin-page')).toHaveCount(0);
  respond();

  await expect(page).toHaveURL('/');
  expect(privilegedRequests).toEqual([]);
  await expect(page.locator('.room-join .join-card')).toBeVisible();
});

test('a denied or missing direct destination replaces itself with the home page', async ({ page }) => {
  const denied = new Map([
    ['/api/host/access', 'UNAUTHORIZED'],
    ['/api/host', 'UNAUTHORIZED'],
    [`/api/host/games/${id}`, 'NOT_FOUND'],
    [`/api/rooms/${id}`, 'UNAUTHORIZED'],
    [`/api/rooms/${id}/claim`, 'CREDENTIAL_EXPIRED'],
    [`/api/arcade/lobbies/${id}`, 'ROOM_NOT_AVAILABLE'],
  ]);
  await page.route('**/api/**', async route => {
    const code = denied.get(new URL(route.request().url()).pathname);
    if (code) await route.fulfill({ status: code === 'UNAUTHORIZED' ? 401 : 404, json: { ok: false, error: { code } } });
    else await route.continue();
  });

  for (const address of [
    '/?admin=people', '/?admin=packs', '/?admin=look', '/?host=1', `/?edit=${id}`, '/?edit=missing',
    `/?bench=${id}`, `/?room=${id}&display=1#access=${'x'.repeat(43)}`, `/?arcade=${id}`,
  ]) {
    await page.goto(address);
    await expect(page).toHaveURL('/');
    await expect(page.locator('.room-join .join-card')).toBeVisible();
  }
  await page.goBack();
  await expect(page).toHaveURL('/');
});

test('a temporary admin failure leaves a way to retry', async ({ page }) => {
  await page.route('**/api/host/access', route => route.fulfill({
    status: 500, json: { ok: false, error: { code: 'GAME_UNAVAILABLE' } },
  }));
  await page.goto('/?admin=people');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page).toHaveURL(/\?admin=people$/);
  await expect(page.locator('.admin-page')).toHaveCount(0);
});

test('a room socket denial returns home before a room renders', async ({ page }) => {
  let connected!: () => void;
  const connecting = new Promise<void>(resolve => { connected = resolve; });
  await page.route('**/socket.io/**', async route => {
    const request = route.request();
    const session = new URL(request.url()).searchParams.get('sid');
    const send = (body: string) => route.fulfill({ contentType: 'text/plain', body });
    if (!session) {
      await send('0' + JSON.stringify({ sid: 'room-test', upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 }));
    } else if (request.method() === 'POST') {
      await send('ok');
      connected();
    } else {
      await connecting;
      await send('44' + JSON.stringify({ message: 'Room access denied', data: { code: 'UNAUTHORIZED' } }));
    }
  });

  await page.goto(`/?room=${id}`);
  await expect(page).toHaveURL('/');
  await expect(page.locator('.session-bar')).toHaveCount(0);
  await expect(page.locator('.room-join .join-card')).toBeVisible();
});

test('the start page shows only links allowed by the current server role', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('party.ownerBrowser', '1'));
  await page.route('**/api/people/me', route => route.fulfill({ json: { ok: true, data: {
    person: { id, name: 'Editor', look: null, canEdit: true },
  } } }));
  let role: 'owner' | 'editor' | null = null;
  let resolveAccess!: () => void;
  const waiting = new Promise<void>(resolve => { resolveAccess = resolve; });
  await page.route('**/api/host/access', async route => {
    await waiting;
    await route.fulfill({ json: { ok: true, data: { role, localSignIn: false } } });
  });

  const ownerLink = page.getByRole('link', { name: 'Host a game instead' });
  const editorLink = page.getByRole('link', { name: 'Edit games' });
  const checking = page.waitForRequest('**/api/host/access');
  await page.goto('/');
  await checking;
  await page.getByText('More options', { exact: true }).click();
  await expect(ownerLink).toHaveCount(0);
  await expect(editorLink).toHaveCount(0);
  const checked = page.waitForResponse('**/api/host/access');
  resolveAccess();
  await checked;
  await expect(ownerLink).toHaveCount(0);
  await expect(editorLink).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in as owner' })).toHaveCount(0);

  const recheck = async () => { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); };
  role = 'editor';
  await recheck();
  await expect(editorLink).toHaveAttribute('href', '/?host=1#my-games');
  await expect(ownerLink).toHaveCount(0);

  role = 'owner';
  await recheck();
  await expect(ownerLink).toHaveAttribute('href', '/?host=1');
  await expect(editorLink).toHaveCount(0);

  role = null;
  const rechecked = page.waitForResponse('**/api/host/access');
  await recheck();
  await rechecked;
  await expect(ownerLink).toHaveCount(0);
  await expect(editorLink).toHaveCount(0);
});

test('the local owner action waits for sign-in before opening the host menu', async ({ page }) => {
  await page.route('**/api/host/access', route => route.fulfill({ json: { ok: true, data: { role: null, localSignIn: true } } }));
  let canClaim = false;
  await page.route('**/api/host/claim-local', route => canClaim
    ? route.fulfill({ json: { ok: true, data: {} } })
    : route.fulfill({ status: 403, json: { ok: false, error: { code: 'FORBIDDEN' } } }));
  await page.route('**/api/host', route => route.fulfill({ json: { ok: true, data: { role: 'owner', games: [], myGames: [], rooms: [] } } }));
  await page.goto('/');
  const signIn = page.getByRole('button', { name: 'Sign in as owner' });
  await signIn.click();
  await expect(page.getByRole('alert')).toContainText('Could not sign in as owner');
  await expect(page).toHaveURL('/');
  canClaim = true;
  await signIn.click();
  await expect(page).toHaveURL('/?host=1');
  await expect(page.getByRole('heading', { name: 'Built-in games' })).toBeVisible();
});
