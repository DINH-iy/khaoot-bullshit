import { randomInt, randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, expect, it } from 'vitest';
import type { CommandReceipt } from '@party/contracts';
import { answer, db, fixture, hostCommand, prisma, service, start, testConnection } from './game-fixture.js';
import { parseDefinition } from '../../src/game/definition.js';

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

// A party vote between two routes that rejoin (format 2).
const routeGame = parseDefinition({
  formatVersion: 2, title: 'Recovery routes', startNodeKey: 'start',
  nodes: [
    { key: 'start', stages: [{ key: 'q', kind: 'challenge', prompt: 'Warm-up', durationMs: null, maxAwardMilli: '0' }] },
    { key: 'choose', stages: [{ key: 'pick', kind: 'route', prompt: 'Which way?', durationMs: null, options: [{ key: 'left', label: 'Left' }, { key: 'right', label: 'Right' }],
      decide: { method: 'players', tie: 'random', noVotes: 'random', counts: 'live' } }] },
    { key: 'left', stages: [{ key: 'q', kind: 'challenge', prompt: 'Left', durationMs: null, maxAwardMilli: '0' }] },
    { key: 'right', stages: [{ key: 'q', kind: 'challenge', prompt: 'Right', durationMs: null, maxAwardMilli: '0' }] },
  ],
  edges: [{ key: 'start-choose', from: 'start', to: 'choose' }, { key: 'choose-left', from: 'choose', to: 'left', option: 'left' }, { key: 'choose-right', from: 'choose', to: 'right', option: 'right' }],
});
async function atRouteVote() {
  const f = await fixture(3, routeGame); const first = await start(f);
  await hostCommand(f, 'stage.close', { stageRunId: first });
  const choice = (await hostCommand(f, 'stage.advance', { stageRunId: first })).stageRunId!;
  // An exact tie between two routes, so the close draws a recorded random pick.
  for (const [index, choiceKey] of [[0, 'left'], [1, 'right']] as const) await service.execute({ role: 'player', playerId: f.players[index]!.id }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId: choice, value: { kind: 'choice', choiceKey } });
  const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
  return { f, choice, close: { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type: 'stage.close', stageRunId: choice } };
}

it('rolls back a route decision killed before commit; the retried close decides exactly once', async () => {
  const { f, choice, close } = await atRouteVote();
  const name = `route_gate_${randomUUID().replaceAll('-', '')}`; const gateKey = randomInt(1, 2_000_000_000);
  const gate = new pg.Client({ connectionString: testConnection }); await gate.connect();
  const child = worker(name);
  try {
    await gate.query('SELECT pg_advisory_lock($1)', [gateKey]);
    await gate.query(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."sessionId" = '${f.sessionId}'::uuid THEN PERFORM pg_advisory_xact_lock(${gateKey}); END IF; RETURN NEW; END; $$`);
    await gate.query(`CREATE TRIGGER "${name}" AFTER INSERT ON route_decisions FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
    child.send({ actor: f.host, command: close });
    await waitFor(async () => (await gate.query("SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event = 'advisory'", [name])).rowCount ? true : null);
    await kill(child);
    await gate.query('SELECT pg_advisory_unlock($1)', [gateKey]);
    expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: choice } })).status).toBe('ACTIVE');
    expect(await prisma.routeDecision.count({ where: { stageRunId: choice } })).toBe(0);
    expect(await prisma.gameCommand.count({ where: { sessionId: f.sessionId, commandKey: close.commandId } })).toBe(0);
  } finally {
    await kill(child);
    await gate.query('SELECT pg_advisory_unlock($1)', [gateKey]);
    await gate.query(`DROP TRIGGER IF EXISTS "${name}" ON route_decisions`);
    await gate.query(`DROP FUNCTION IF EXISTS "${name}"()`);
    await gate.end();
  }
  const receipt = await service.execute(f.host, close);
  expect(await service.execute(f.host, close)).toEqual(receipt);
  expect(await prisma.routeDecision.count({ where: { stageRunId: choice } })).toBe(1);
  expect(await prisma.auditEvent.count({ where: { sessionId: f.sessionId, kind: 'stage.close', revision: receipt.revision } })).toBe(1);
}, 15000);

it('keeps a committed route decision after SIGKILL: replayed receipt, same random pick, and the saved route on resume', async () => {
  const { f, choice, close } = await atRouteVote();
  const child = worker(`route_commit_${randomUUID().replaceAll('-', '')}`);
  let receipt: CommandReceipt;
  try { const committed = receiptFrom(child); child.send({ actor: f.host, command: close }); receipt = await committed; } finally { await kill(child); }
  const saved = await prisma.routeDecision.findUniqueOrThrow({ where: { stageRunId: choice } });
  const restarted = worker(`route_restart_${randomUUID().replaceAll('-', '')}`);
  try { const replay = receiptFrom(restarted); restarted.send({ actor: f.host, command: close }); expect(await replay).toEqual(receipt); } finally { await kill(restarted); }
  expect(await prisma.routeDecision.findMany({ where: { stageRunId: choice } })).toEqual([saved]);
  // Startup recovery pauses running rooms; after the host resumes, the game follows the saved route.
  await hostCommand(f, 'session.pause'); await hostCommand(f, 'session.resume');
  const next = (await hostCommand(f, 'stage.advance', { stageRunId: choice })).stageRunId!;
  expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: next } })).nodeKey).toBe(saved.destinationNodeKey);
  expect(await prisma.stageRun.count({ where: { sessionId: f.sessionId, nodeKey: 'choose' } })).toBe(1);
}, 15000);
