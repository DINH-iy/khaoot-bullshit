import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition, type GameDefinition } from '../../src/game/definition.js';
import { createGameService } from '../../src/game/service.js';
import { readSessionView } from '../../src/game/views.js';
import { db, fixture, prisma } from './game-fixture.js';

afterAll(async () => { await db.close(); });
type Fixture = Awaited<ReturnType<typeof fixture>>;
function world() { let now = Date.now(); return { service: createGameService(prisma, undefined, () => new Date(now)), advance: (ms: number) => { now += ms; } }; }
async function host(w: ReturnType<typeof world>, f: Fixture, type: string, extra: Record<string, unknown> = {}) {
  const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
  return w.service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type, ...extra });
}
const as = (f: Fixture, index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
const send = (w: ReturnType<typeof world>, f: Fixture, index: number, command: Record<string, unknown>) => w.service.execute(as(f, index), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, ...command });
/** A stored drawing row (the file itself is not needed by the game rules). */
const drawingAsset = (f: Fixture, index: number, stageRunId: string | null) => prisma.asset.create({ data: { sessionId: f.sessionId, playerId: f.players[index]!.id, stageRunId, kind: 'DRAWING', purpose: stageRunId ? 'ANSWER' : 'AVATAR', contentType: 'application/json', byteSize: 20, sha256: '0'.repeat(64) } });

describe('drawings', () => {
  it('plays a drawing round and a vote on the drawings, anonymous until the vote is revealed', async () => {
    const definition = parseDefinition({ formatVersion: 1, title: 'Draw', startNodeKey: 'draw', edges: [],
      nodes: [{ key: 'draw', stages: [{ key: 'pic', kind: 'collect', prompt: 'Draw a cat', durationMs: null, input: { kind: 'drawing', maxStrokes: 100, blind: true }, scoring: { kind: 'none' } },
        { key: 'vote', kind: 'vote', prompt: 'Best cat?', durationMs: null, source: { nodeKey: 'draw', stageKey: 'pic' }, awardPerVoteMilli: '5000' }] }] });
    const w = world(); const f = await fixture(2, definition);
    const draw = (await host(w, f, 'session.start')).stageRunId!;
    const mine = await drawingAsset(f, 0, draw); const theirs = await drawingAsset(f, 1, draw);
    // Someone else's drawing cannot be handed in.
    await expect(send(w, f, 0, { type: 'submission.submit', stageRunId: draw, value: { kind: 'drawing', assetId: theirs.id } })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await send(w, f, 0, { type: 'submission.submit', stageRunId: draw, value: { kind: 'drawing', assetId: mine.id } });
    await send(w, f, 1, { type: 'submission.submit', stageRunId: draw, value: { kind: 'drawing', assetId: theirs.id } });
    await host(w, f, 'stage.close', { stageRunId: draw });
    const vote = (await host(w, f, 'stage.advance', { stageRunId: draw })).stageRunId!;
    const ballot = (await readSessionView(prisma, as(f, 0), f.sessionId)).stage!.ballot!;
    expect(ballot.map(entry => entry.content)).toEqual(expect.arrayContaining([{ kind: 'drawing', assetId: mine.id }, { kind: 'drawing', assetId: theirs.id }]));
    expect(JSON.stringify(ballot)).not.toContain(f.players[1]!.id);
    await send(w, f, 0, { type: 'submission.submit', stageRunId: vote, value: { kind: 'vote', submissionId: ballot.find(entry => !entry.own)!.submissionId } });
    await host(w, f, 'stage.close', { stageRunId: vote }); await host(w, f, 'stage.reveal', { stageRunId: vote });
    expect((await readSessionView(prisma, as(f, 0), f.sessionId)).standings).toEqual([{ playerId: f.players[1]!.id, amountMilli: '5000' }]);
  });

  it('lets only the right team member add a turn to Pass the pencil, in time, then votes for another team', async () => {
    const definition: GameDefinition = parseDefinition({ formatVersion: 2, title: 'Relay', startNodeKey: 'relay', edges: [],
      nodes: [{ key: 'relay', stages: [{ key: 'play', kind: 'minigame', prompt: 'Draw a castle', game: 'relay-drawing', settings: { secondsPerTurn: 10, voteSeconds: 30 }, durationMs: null, placementMilli: ['10000'],
        play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'count', teams: 2 }, formation: 'host' } }, answers: 'everyone', points: 'members' } }] }] });
    const w = world(); const f = await fixture(4, definition);
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    for (const [index, team] of [[0, 0], [1, 0], [2, 1], [3, 1]] as const) await host(w, f, 'teams.assign', { stageRunId, playerId: f.players[index]!.id, teamIndex: team });
    await host(w, f, 'teams.confirm', { stageRunId });
    const relay = (await readSessionView(prisma, f.host, f.sessionId)).stage!.minigame!.relay!;
    expect(relay.turns).toBe(2);
    const teamOf = (index: number) => relay.teams.find(team => team.drawers.includes(f.players[index]!.id))!;
    const first = teamOf(0).drawers[0]!; const firstIndex = f.players.findIndex(player => player.id === first);
    const second = teamOf(0).drawers[1]!; const secondIndex = f.players.findIndex(player => player.id === second);
    w.advance(3000 + 2000); // turn 1 of 2
    const part = await drawingAsset(f, firstIndex, stageRunId); const wrong = await drawingAsset(f, secondIndex, stageRunId);
    await expect(send(w, f, secondIndex, { type: 'minigame.part', stageRunId, turn: 0, assetId: wrong.id })).rejects.toMatchObject({ code: 'INELIGIBLE' });
    await send(w, f, firstIndex, { type: 'minigame.part', stageRunId, turn: 0, assetId: part.id });
    await expect(send(w, f, firstIndex, { type: 'minigame.part', stageRunId, turn: 0, assetId: (await drawingAsset(f, firstIndex, stageRunId)).id })).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    // Too late for turn 1 once turn 2 is well under way; and no voting before the last turn ends.
    w.advance(10_000 + 5000);
    await expect(send(w, f, secondIndex, { type: 'minigame.part', stageRunId, turn: 0, assetId: wrong.id })).rejects.toMatchObject({ code: 'INELIGIBLE' });
    await expect(send(w, f, 0, { type: 'submission.submit', stageRunId, value: { kind: 'minigame', value: 0, teamId: teamOf(2).teamId } })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const view = (await readSessionView(prisma, as(f, 2), f.sessionId)).stage!.minigame!.relay!;
    expect(view.teams.find(team => team.teamId === teamOf(0).teamId)!.parts).toEqual([{ turn: 0, assetId: part.id }]);
    expect((await readSessionView(prisma, as(f, 2), f.sessionId)).stage!.submittedCount).toBe(0); // turns are not answers
    w.advance(10_000);
    await expect(send(w, f, 0, { type: 'submission.submit', stageRunId, value: { kind: 'minigame', value: 0, teamId: teamOf(0).teamId } })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' }); // own team
    await send(w, f, 0, { type: 'submission.submit', stageRunId, value: { kind: 'minigame', value: 0, teamId: teamOf(2).teamId } });
    await host(w, f, 'stage.close', { stageRunId }); await host(w, f, 'stage.reveal', { stageRunId });
    const answer = (await readSessionView(prisma, as(f, 0), f.sessionId)).stage!.reveal!.answer;
    expect(answer).toMatchObject({ kind: 'minigame', entries: [{ teamId: teamOf(2).teamId, value: 1, place: 1 }, { teamId: teamOf(0).teamId, value: 0, place: 2 }] });
    // Points go to the winning team's members.
    expect(await prisma.scoreEntry.count({ where: { sessionId: f.sessionId, recipientPlayerId: { in: [f.players[2]!.id, f.players[3]!.id] }, amountMilli: 10000n } })).toBe(2);
  });

  it('accepts only your own stored picture, and lets the host take it away', async () => {
    const definition = parseDefinition({ formatVersion: 1, title: 'Pics', startNodeKey: 'a', edges: [], nodes: [{ key: 'a', stages: [{ key: 'b', kind: 'info', title: 'Hi', prompt: 'Hi', durationMs: null }] }] });
    const w = world(); const f = await fixture(2, definition);
    const look = { color: 1, body: 'cat', eyes: 'dots', mouth: 'smile', hat: 'none', extra: 'none' };
    const mine = await drawingAsset(f, 0, null); const theirs = await drawingAsset(f, 1, null);
    await expect(send(w, f, 0, { type: 'player.look', look: { ...look, picture: { assetId: theirs.id, kind: 'drawing' } } })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    await expect(send(w, f, 0, { type: 'player.look', look: { ...look, picture: { assetId: mine.id, kind: 'photo' } } })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    await send(w, f, 0, { type: 'player.look', look: { ...look, picture: { assetId: mine.id, kind: 'drawing' } } });
    await expect(send(w, f, 1, { type: 'player.removePicture', playerId: f.players[0]!.id, expectedRevision: 0 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await host(w, f, 'player.removePicture', { playerId: f.players[0]!.id });
    expect((await prisma.sessionPlayer.findUniqueOrThrow({ where: { id: f.players[0]!.id } })).look).toEqual(look);
  });
});
