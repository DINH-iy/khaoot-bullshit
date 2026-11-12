import { randomInt, randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, expect, it } from 'vitest';
import type { CommandReceipt } from '@party/contracts';
import { answer, db, fixture, hostCommand, prisma, service, start, testConnection } from './game-fixture.js';

afterAll(async () => { await db.close(); });
function worker(applicationName: string): ChildProcess {
  const url = new URL(testConnection); url.searchParams.set('application_name', applicationName);
  return fork(fileURLToPath(new URL('./command-worker.ts', import.meta.url)), [], {
    execArgv: ['--import', 'tsx'], env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString() }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
}
async function kill(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
}
async function waitFor<T>(check: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await check(); if (result !== null) return result;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Test condition timed out');
}
function receiptFrom(child: ChildProcess): Promise<CommandReceipt> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker did not commit')), 7000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('message', (message: { kind: string; receipt: CommandReceipt }) => {
      clearTimeout(timeout);
      if (message.kind === 'committed') resolve(message.receipt); else reject(new Error('Worker command failed'));
    });
  });
}

it('rolls back a killed process before commit and safely retries its original command', async () => {
  const f = await fixture(); const stageRunId = await start(f);
  const command = answer(f.sessionId, stageRunId);
  const actor = { role: 'player' as const, playerId: f.players[0]!.id };
  const name = `gate_${randomUUID().replaceAll('-', '')}`; const gateKey = randomInt(1, 2_000_000_000);
  const gate = new pg.Client({ connectionString: testConnection }); await gate.connect();
  const child = worker(name);
  try {
    await gate.query('SELECT pg_advisory_lock($1)', [gateKey]);
    // Gate AFTER the score INSERT, so killing the worker must undo a real score,
    // submission and command rather than merely killing an idle connection.
    await gate.query(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."sessionId" = '${f.sessionId}'::uuid THEN PERFORM pg_advisory_xact_lock(${gateKey}); END IF; RETURN NEW; END; $$`);
    await gate.query(`CREATE TRIGGER "${name}" AFTER INSERT ON score_entries FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
    child.send({ actor, command });
    await waitFor(async () => {
      const result = await gate.query("SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event = 'advisory'", [name]);
      return result.rowCount ? true : null;
    });
    await kill(child);
    await gate.query('SELECT pg_advisory_unlock($1)', [gateKey]);
    expect(await prisma.submission.count({ where: { stageRunId } })).toBe(0);
    expect(await prisma.scoreEntry.count({ where: { stageRunId } })).toBe(0);
    expect(await prisma.gameCommand.count({ where: { sessionId: f.sessionId, commandKey: command.commandId } })).toBe(0);
  } finally {
    await kill(child);
    await gate.query('SELECT pg_advisory_unlock($1)', [gateKey]);
    await gate.query(`DROP TRIGGER IF EXISTS "${name}" ON score_entries`);
    await gate.query(`DROP FUNCTION IF EXISTS "${name}"()`);
    await gate.end();
  }
  await service.execute(actor, command);
  expect(await prisma.scoreEntry.count({ where: { stageRunId } })).toBe(1);
}, 15000);

it('recovers an accepted answer and one score effect after SIGKILL with a lost client acknowledgement', async () => {
  const f = await fixture(); const stageRunId = await start(f);
  const actor = { role: 'player' as const, playerId: f.players[0]!.id }; const command = answer(f.sessionId, stageRunId);
  const child = worker(`committed_${randomUUID().replaceAll('-', '')}`);
  let receipt: CommandReceipt;
  try {
    const committed = receiptFrom(child); child.send({ actor, command }); receipt = await committed;
  } finally { await kill(child); }
  // No receipt is delivered to a phone. A fresh service process must replay the
  // stored receipt; restarting alone must never reconstruct/re-award points.
  const restarted = worker(`restart_${randomUUID().replaceAll('-', '')}`);
  try {
    const replay = receiptFrom(restarted); restarted.send({ actor, command });
    expect(await replay).toEqual(receipt);
  } finally { await kill(restarted); }
  expect(await prisma.submission.count({ where: { stageRunId } })).toBe(1);
  expect(await prisma.scoreEntry.count({ where: { stageRunId } })).toBe(1);
  expect(await prisma.auditEvent.count({ where: { sessionId: f.sessionId, kind: 'submission.submit' } })).toBe(1);
  expect(await prisma.outboxEvent.count({ where: { sessionId: f.sessionId, revision: receipt.revision, publishedAt: null } })).toBe(4);
  // Host-controlled recovery pauses before play resumes. Automatic startup/room
  // ownership orchestration belongs to the next multiplayer slice.
  await hostCommand(f, 'session.pause'); await hostCommand(f, 'session.resume');
}, 15000);
