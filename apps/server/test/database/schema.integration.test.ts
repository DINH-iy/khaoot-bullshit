import { randomUUID, createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/database/client.js';

const connection = process.env['DATABASE_URL'];
if (!connection || !new URL(connection).pathname.endsWith('_test')) throw new Error('Database tests require a dedicated _test database.');
const db = createDatabase(connection, 3);
const prisma = db.client;

async function fixture() {
  const creator = await prisma.creator.create({ data: { issuer: 'https://identity.example/', subject: randomUUID() } });
  const game = await prisma.game.create({ data: { creatorId: creator.id, title: 'Test night' } });
  const definition = { schemaVersion: 1, startNodeKey: 'intro', nodes: [{ id: 'intro', type: 'information' }], edges: [] };
  await prisma.gameDraft.create({ data: { gameId: game.id, definition } });
  const version = await prisma.gameVersion.create({ data: { gameId: game.id, number: 1, definition, contentHash: createHash('sha256').update(JSON.stringify(definition)).digest('hex'), createdById: creator.id } });
  const session = await prisma.gameSession.create({ data: { gameVersionId: version.id, hostId: creator.id, roomCode: randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase() } });
  const player = await prisma.sessionPlayer.create({ data: { sessionId: session.id, displayName: 'Sam' } });
  const stage = await prisma.stageRun.create({ data: { sessionId: session.id, number: 1, nodeKey: 'question', stageKey: 'answers' } });
  return { creator, game, version, session, player, stage };
}
function commandData(sessionId: string) {
  return { sessionId, commandKey: randomUUID(), actorKey: 'host:test', type: 'submit', requestHash: 'a'.repeat(64), result: { saved: true } };
}
function submissionData(f: Awaited<ReturnType<typeof fixture>>) {
  return { sessionId: f.session.id, stageRunId: f.stage.id, playerId: f.player.id, actorKey: `player:${f.player.id}`, value: { answer: 'Canberra' } };
}
beforeAll(async () => { await db.check(); });
afterAll(async () => { await db.close(); });

describe('PostgreSQL schema guarantees', () => {
  it('keeps a running game on its published snapshot when the draft changes', async () => {
    const f = await fixture();
    await prisma.gameDraft.update({ where: { gameId: f.game.id }, data: { revision: { increment: 1 }, definition: { changed: true } } });
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.session.id }, include: { gameVersion: true } });
    expect(session.gameVersion.definition).toEqual(f.version.definition);
    expect(session.gameVersion.definition).not.toEqual({ changed: true });
    await expect(prisma.gameVersion.update({ where: { id: f.version.id }, data: { definition: { tampered: true } } })).rejects.toThrow();
    await expect(prisma.gameVersion.delete({ where: { id: f.version.id } })).rejects.toThrow();
  });
  it('prevents duplicate commands and duplicate accepted submissions', async () => {
    const f = await fixture();
    const data = commandData(f.session.id);
    await prisma.gameCommand.create({ data });
    await expect(prisma.gameCommand.create({ data })).rejects.toThrow();
    await prisma.submission.create({ data: submissionData(f) });
    await expect(prisma.submission.create({ data: submissionData(f) })).rejects.toThrow();
  });
  it('blocks cross-session players and mismatched actor identities', async () => {
    const a = await fixture();
    const b = await fixture();
    await expect(prisma.submission.create({ data: { ...submissionData(a), playerId: b.player.id, actorKey: `player:${b.player.id}` } })).rejects.toThrow();
    await expect(prisma.submission.create({ data: { ...submissionData(a), actorKey: 'host:forged' } })).rejects.toThrow();
  });
  it('requires one submission actor and only one active stage per session', async () => {
    const f = await fixture();
    await expect(prisma.submission.create({ data: { sessionId: f.session.id, stageRunId: f.stage.id, actorKey: 'none', value: {} } })).rejects.toThrow();
    await expect(prisma.stageRun.create({ data: { sessionId: f.session.id, number: 2, nodeKey: 'other', stageKey: 'answers' } })).rejects.toThrow();
    await prisma.stageRun.update({ where: { id: f.stage.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    await expect(prisma.stageRun.create({ data: { sessionId: f.session.id, number: 2, nodeKey: 'other', stageKey: 'answers' } })).resolves.toBeDefined();
  });
  it('keeps exact signed score values and rejects edits and duplicate awards', async () => {
    const f = await fixture();
    const command = await prisma.gameCommand.create({ data: commandData(f.session.id) });
    const amount = 9007199254740993n;
    const data = { sessionId: f.session.id, commandId: command.id, awardKey: randomUUID(), recipientPlayerId: f.player.id, stageRunId: f.stage.id, amountMilli: amount, kind: 'AWARD' as const, reason: 'Exactness test' };
    const score = await prisma.scoreEntry.create({ data });
    expect((await prisma.scoreEntry.findUniqueOrThrow({ where: { id: score.id } })).amountMilli).toBe(amount);
    await expect(prisma.scoreEntry.create({ data })).rejects.toThrow();
    await expect(prisma.scoreEntry.update({ where: { id: score.id }, data: { amountMilli: 1n } })).rejects.toThrow();
    await expect(prisma.scoreEntry.delete({ where: { id: score.id } })).rejects.toThrow();
    await expect(prisma.scoreEntry.create({ data: { ...data, awardKey: randomUUID(), recipientPlayerId: null } })).rejects.toThrow();
    const reversal = { ...data, awardKey: randomUUID(), amountMilli: -amount, kind: 'REVERSAL' as const, reversesEntryId: score.id };
    await prisma.scoreEntry.create({ data: reversal });
    await expect(prisma.scoreEntry.create({ data: { ...reversal, awardKey: randomUUID() } })).rejects.toThrow();
    const total = await prisma.scoreEntry.aggregate({ where: { sessionId: f.session.id }, _sum: { amountMilli: true } });
    expect(total._sum.amountMilli).toBe(0n);
  });
  it('preserves historical team lineups and allows only one captain per team', async () => {
    const f = await fixture();
    const other = await prisma.sessionPlayer.create({ data: { sessionId: f.session.id, displayName: 'Alex' } });
    const team = await prisma.sessionTeam.create({ data: { sessionId: f.session.id, name: 'Red' } });
    const first = await prisma.teamLineup.create({ data: { sessionId: f.session.id, number: 1 } });
    const second = await prisma.teamLineup.create({ data: { sessionId: f.session.id, number: 2 } });
    await prisma.teamMember.create({ data: { sessionId: f.session.id, lineupId: first.id, teamId: team.id, playerId: f.player.id, isCaptain: true } });
    await expect(prisma.teamMember.create({ data: { sessionId: f.session.id, lineupId: first.id, teamId: team.id, playerId: other.id, isCaptain: true } })).rejects.toThrow();
    await prisma.teamMember.create({ data: { sessionId: f.session.id, lineupId: second.id, teamId: team.id, playerId: other.id, isCaptain: true } });
    expect(await prisma.teamMember.count({ where: { lineupId: first.id, playerId: f.player.id } })).toBe(1);
    expect(await prisma.teamMember.count({ where: { lineupId: second.id, playerId: other.id } })).toBe(1);
  });
  it('rolls back command, submission, audit and outbox together on failure', async () => {
    const f = await fixture();
    const key = randomUUID();
    await expect(prisma.$transaction(async tx => {
      const command = await tx.gameCommand.create({ data: { ...commandData(f.session.id), commandKey: key } });
      await tx.submission.create({ data: submissionData(f) });
      await tx.auditEvent.create({ data: { sessionId: f.session.id, commandId: command.id, revision: 1, kind: 'answer.saved', details: {} } });
      await tx.outboxEvent.create({ data: { sessionId: f.session.id, revision: 1, audience: 'PLAYER', audienceKey: `player:${f.player.id}`, type: 'answer.saved', payload: { saved: true } } });
      throw new Error('Injected failure before commit');
    })).rejects.toThrow('Injected failure');
    expect(await prisma.gameCommand.count({ where: { sessionId: f.session.id } })).toBe(0);
    expect(await prisma.submission.count({ where: { sessionId: f.session.id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { sessionId: f.session.id } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { sessionId: f.session.id } })).toBe(0);
  });
  it('persists committed records across client recreation', async () => {
    const f = await fixture();
    await prisma.$transaction(async tx => {
      const command = await tx.gameCommand.create({ data: commandData(f.session.id) });
      await tx.submission.create({ data: submissionData(f) });
      await tx.auditEvent.create({ data: { sessionId: f.session.id, commandId: command.id, revision: 1, kind: 'answer.saved', details: {} } });
      await tx.outboxEvent.create({ data: { sessionId: f.session.id, revision: 1, audience: 'PLAYER', audienceKey: `player:${f.player.id}`, type: 'answer.saved', payload: { saved: true } } });
    });
    const fresh = createDatabase(connection!, 1);
    try {
      expect(await fresh.client.submission.count({ where: { sessionId: f.session.id } })).toBe(1);
      expect(await fresh.client.outboxEvent.count({ where: { sessionId: f.session.id, publishedAt: null } })).toBe(1);
      expect(await fresh.client.auditEvent.count({ where: { sessionId: f.session.id } })).toBe(1);
    } finally { await fresh.close(); }
  });
  it('saves a branch resolution only once and keeps it immutable', async () => {
    const f = await fixture();
    const command = await prisma.gameCommand.create({ data: commandData(f.session.id) });
    const data = { sessionId: f.session.id, stageRunId: f.stage.id, commandId: command.id, selectedEdgeKey: 'music', destinationNodeKey: 'music-round', reason: 'VOTE' as const, voteSnapshot: { music: 12, physical: 8 } };
    const decision = await prisma.routeDecision.create({ data });
    await expect(prisma.routeDecision.create({ data })).rejects.toThrow();
    await expect(prisma.routeDecision.update({ where: { id: decision.id }, data: { selectedEdgeKey: 'physical' } })).rejects.toThrow();
  });
});
