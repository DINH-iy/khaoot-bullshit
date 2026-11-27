import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import pg from 'pg';

test('Health can retry active updates, clear old finished-room updates and review reports', async ({ page, request, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Uses a dedicated browser-test database.');
  const token = process.env['LOCAL_OWNER_TOKEN'];
  const connectionString = process.env['DATABASE_URL'];
  if (!token || !connectionString || process.env['NODE_ENV'] !== 'test'
    || !/^\/network_e2e_[a-f0-9]+_test$/.test(new URL(connectionString).pathname)) throw new Error('Dedicated E2E database required');
  const db = new pg.Client({ connectionString });
  await db.connect();
  const headers = { origin: baseURL!, 'x-party-request': '1' };
  const endpoint = '/api/host/admin/health/recover';
  try {
    const denied = await request.post(endpoint, { headers, data: { action: 'clear-finished-updates' } });
    expect(denied.status()).toBe(401);
    expect((await page.request.post('/api/host/claim', { headers, data: { token } })).ok()).toBe(true);
    await page.goto('/?host=1');
    await page.getByRole('button', { name: 'Open room for Timed quiz' }).click();
    await expect(page.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ })).toBeVisible();
    const open = new URL(page.url()).searchParams.get('room')!;
    const closed = randomUUID();
    await page.goto('/?admin=health');
    await db.query(`INSERT INTO game_sessions (id, "gameVersionId", "hostId", status, "updatedAt", "endedAt")
      SELECT $1, "gameVersionId", "hostId", 'FINISHED', now(), now() FROM game_sessions WHERE id = $2`, [closed, open]);
    const pending = randomUUID(), obsolete = randomUUID(), recent = randomUUID();
    await db.query(`INSERT INTO outbox_events (id,"sessionId",revision,"eventIndex",audience,"audienceKey",type,payload,attempts,"createdAt")
      VALUES ($1,$2,999,0,'HOST','host','session.changed','{}',5,now()-interval '2 days'),
      ($3,$4,999,0,'HOST','host','session.changed','{}',5,now()-interval '2 days'),
      ($5,$4,999,1,'HOST','host','session.changed','{}',0,now())`, [pending, open, obsolete, closed, recent]);
    const report = randomUUID(), finishedLog = randomUUID(), newerReport = randomUUID();
    const log = (id: string, reason: string) => db.query(`INSERT INTO device_logs (id,source,reason,summary,role,details)
      VALUES ($1,'DEVICE',$2,'Health test report','player','{}')`, [id, reason]);
    await log(report, 'problem');
    await log(finishedLog, 'game_over');
    await page.getByRole('button', { name: 'Check again' }).click();
    const rooms = page.locator('.health-part').filter({ has: page.getByRole('heading', { name: /Rooms and updates/ }) });
    await expect(rooms.getByText('Old updates from finished rooms')).toBeVisible();
    const retry = rooms.getByRole('button', { name: 'Retry failed updates' });
    await expect(retry).toBeVisible();
    if (process.env['ADMIN_SCREENSHOTS']) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.screenshot({ path: join(process.env['ADMIN_SCREENSHOTS'], 'health-recovery.png'), fullPage: true });
    }
    await retry.click();
    await expect(page.getByText(/Queued 1 updates? for another try/)).toBeVisible();
    expect((await db.query('SELECT attempts FROM outbox_events WHERE id = $1', [pending])).rows[0].attempts).toBe(0);

    await rooms.getByRole('button', { name: 'Clear old updates', exact: true }).click();
    await rooms.getByRole('button', { name: 'Cancel' }).click();
    expect((await db.query('SELECT id FROM outbox_events WHERE id = $1', [obsolete])).rowCount).toBe(1);
    await rooms.getByRole('button', { name: 'Clear old updates', exact: true }).click();
    await rooms.getByRole('button', { name: 'Clear old updates now' }).click();
    await expect(page.getByText(/Cleared 1 old updates?/)).toBeVisible();
    expect((await db.query('SELECT id FROM outbox_events WHERE id = ANY($1::uuid[])', [[pending, obsolete, recent]])).rows.map(row => row.id).sort()).toEqual([pending, recent].sort());

    const review = page.getByRole('button', { name: 'Mark reports as reviewed' });
    await expect(review).toBeEnabled();
    await log(newerReport, 'problem');
    await review.click();
    await expect(page.getByText(/Marked \d+ reports? as reviewed/)).toBeVisible();
    const rows = (await db.query('SELECT id, "reviewedAt" FROM device_logs WHERE id = ANY($1::uuid[])', [[report, finishedLog, newerReport]])).rows;
    expect(rows.find(row => row.id === report).reviewedAt).toBeInstanceOf(Date);
    expect(rows.find(row => row.id === finishedLog).reviewedAt).toBeNull();
    expect(rows.find(row => row.id === newerReport).reviewedAt).toBeNull();
    await page.getByRole('link', { name: 'Open device logs' }).click();
    await expect(page.getByRole('heading', { name: 'Device logs', level: 1 })).toBeVisible();
  } finally { await db.end(); }
});
