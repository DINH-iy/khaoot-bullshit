import { randomUUID } from 'node:crypto';
import { ArcadeActSchema, StartArcadeRoundSchema, isMinigameKey, type ArcadeAction } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient, ArcadeMember } from '../generated/prisma/client.js';
import { contentHash, type GameDefinition } from '../game/definition.js';
import { GameError } from '../game/errors.js';
import type { Transaction } from '../game/model.js';
import type { createGameService } from '../game/service.js';
import { readSessionView } from '../game/views.js';
import { lockRoom, makeRoomCode, recordRoomChange, type Principal } from '../rooms/gateway.js';
import { joinToken, roomAssert, tokenHash } from '../rooms/security.js';
import { arcadeDefinition, arcadeRoundFits } from './definition.js';
import { ensureLeader, lockLobby, present, QUIET_MS, type Lobbies } from './lobbies.js';
import { recordResults, roundResults } from './results.js';

// Rounds: each is an ordinary room with one minigame scene, hosted by the
// arcade's own creator. Every present member gets a seat (and a player key the
// server keeps, handed out by `enter`) before the round starts, so nobody joins
// late. The leader runs the round through `act`, which carries out the matching
// host step; ending a round records its results for the lobby and the leaderboards.

const ARCADE = { issuer: 'urn:arcade', subject: 'arcade' };
const PLAYER_ACCESS_MS = 4 * 60 * 60 * 1000;
const HOST_STEPS: Record<Exclude<ArcadeAction, 'begin' | 'resume' | 'end'>, string> = {
  'confirm-teams': 'teams.confirm', 'shuffle-teams': 'teams.shuffle', start: 'stage.explained', close: 'stage.close', reveal: 'stage.reveal',
};
const seatKey = (memberId: string) => `arcade:${memberId}`;

/** Ends a room at once, closing a round still open, and tells its screens. */
async function finishRoom(tx: Transaction, sessionId: string, now: Date) {
  await lockRoom(tx, sessionId);
  const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId }, select: { status: true } });
  if (session.status === 'FINISHED') return;
  await tx.stageRun.updateMany({ where: { sessionId, status: 'ACTIVE' }, data: { status: 'CLOSED', closedAt: now, deadlineAt: null, pausedRemainingMs: null } });
  await tx.gameSession.update({ where: { id: sessionId }, data: { status: 'FINISHED', endedAt: now, currentNodeKey: null } });
  await recordRoomChange(tx, sessionId, 'arcade.round.ended');
}

export function createRounds(client: PrismaClient, config: Config, service: ReturnType<typeof createGameService>, lobbies: Lobbies) {
  const creator = () => client.creator.upsert({ where: { issuer_subject: ARCADE }, create: ARCADE, update: {} });
  /** The arcade's stored version of a round's game, made once per distinct definition. */
  async function versionFor(creatorId: string, definition: GameDefinition) {
    const hash = contentHash(definition);
    return client.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('arcade-games', 0))::text AS locked`;
      const existing = await tx.gameVersion.findFirst({ where: { contentHash: hash, game: { creatorId } }, select: { id: true } });
      if (existing) return existing.id;
      const game = await tx.game.create({ data: { creatorId, title: definition.title } });
      return (await tx.gameVersion.create({ data: { gameId: game.id, createdById: creatorId, number: 1, definitionFormat: definition.formatVersion, definition, contentHash: hash }, select: { id: true } })).id;
    });
  }
  /** A host step in a round's room. Answers arriving meanwhile move the room's revision on, so a conflict is tried again. */
  async function hostStep(sessionId: string, hostId: string, type: string, extra: Record<string, unknown> = {}) {
    for (let attempt = 0; ; attempt++) {
      const { revision } = await client.gameSession.findUniqueOrThrow({ where: { id: sessionId }, select: { revision: true } });
      try { return await service.execute({ role: 'host', creatorId: hostId }, { formatVersion: 1, type, sessionId, commandId: randomUUID(), expectedRevision: revision, ...extra }); }
      catch (error) { if (!(error instanceof GameError && error.code === 'REVISION_CONFLICT') || attempt >= 4) throw error; }
    }
  }
  /**
   * Ends a round: a minigame still being played is closed and its results shown, then each player's result is
   * recorded (once) and the room ends, which brings every phone back to the lobby. A round that never got going
   * (teams still being made, the explanation still up) ends without results.
   */
  async function end(roundId: string, now = new Date()) {
    const round = await client.arcadeRound.findUniqueOrThrow({ where: { id: roundId }, include: { session: { select: { hostId: true, status: true } }, seats: { include: { member: { select: { personId: true } } } } } });
    let rows: ReturnType<typeof roundResults> = [];
    if (!round.endedAt && round.session.status !== 'FINISHED' && isMinigameKey(round.game)) {
      const host = { role: 'host' as const, creatorId: round.session.hostId };
      try {
        let stage = (await readSessionView(client, host, round.sessionId)).stage;
        if (stage?.status === 'ACTIVE' && !stage.teams?.forming && !stage.explain) { await hostStep(round.sessionId, round.session.hostId, 'stage.close', { stageRunId: stage.id }); stage = (await readSessionView(client, host, round.sessionId)).stage; }
        if (stage?.status === 'CLOSED' && !stage.revealed) await hostStep(round.sessionId, round.session.hostId, 'stage.reveal', { stageRunId: stage.id });
        rows = roundResults(await readSessionView(client, host, round.sessionId), round.game, round.seats.map(seat => ({ memberId: seat.memberId, playerId: seat.playerId, personId: seat.member.personId })));
      } catch (error) { if (!(error instanceof GameError)) throw error; /* Ends without the results that could not be shown. */ }
    }
    await client.$transaction(async tx => {
      await lockLobby(tx, round.lobbyId);
      const ended = await tx.arcadeRound.updateMany({ where: { id: round.id, endedAt: null }, data: { endedAt: now } });
      if (ended.count && isMinigameKey(round.game)) await recordResults(tx, round.id, round.game, rows);
      await finishRoom(tx, round.sessionId, now);
    });
  }

  return {
    end,
    /** The leader starts a round of a minigame for everyone present. A retry with the same round id is the same round. */
    async start(member: ArcadeMember, input: unknown, now = new Date()) {
      const parsed = StartArcadeRoundSchema.safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND');
      roomAssert(config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE'); const secret = config.ROOM_TOKEN_SECRET;
      const { roundId, game, teams } = parsed.data; const lobbyId = member.lobbyId;
      roomAssert(arcadeRoundFits(game, teams), 'INVALID_COMMAND');
      const existing = await client.arcadeRound.findUnique({ where: { id: roundId } });
      if (existing) { roomAssert(existing.lobbyId === lobbyId, 'INVALID_COMMAND'); return { roundId }; }
      const check = async (tx: Transaction) => {
        const lobby = await tx.arcadeLobby.findUniqueOrThrow({ where: { id: lobbyId } });
        roomAssert(!lobby.closedAt && now.getTime() - lobby.lastActiveAt.getTime() < QUIET_MS, 'ROOM_NOT_AVAILABLE');
        roomAssert(await ensureLeader(tx, lobbyId, now) === member.id, 'FORBIDDEN');
        roomAssert(await tx.arcadeRound.count({ where: { lobbyId, endedAt: null } }) === 0, 'ROUND_ON');
        const players = (await tx.arcadeMember.findMany({ where: { lobbyId, leftAt: null }, orderBy: { joinedAt: 'asc' } })).filter(entry => present(entry, now) || entry.id === member.id);
        roomAssert(players.length >= (teams?.count ?? 1), 'NOT_ENOUGH_PLAYERS');
        return players;
      };
      await client.$transaction(async tx => { await lockLobby(tx, lobbyId); await check(tx); });
      const host = await creator();
      const gameVersionId = await versionFor(host.id, arcadeDefinition(game, teams));
      await service.execute({ role: 'host', creatorId: host.id }, { formatVersion: 1, type: 'session.create', sessionId: roundId, commandId: roundId, expectedRevision: 0, mode: 'REHEARSAL', gameVersionId });
      await client.$transaction(async tx => {
        await lockLobby(tx, lobbyId); await lockRoom(tx, roundId);
        const players = await check(tx);
        const number = ((await tx.arcadeRound.aggregate({ where: { lobbyId }, _max: { number: true } }))._max.number ?? 0) + 1;
        await tx.gameSession.update({ where: { id: roundId }, data: { roomCode: makeRoomCode() } });
        await tx.arcadeRound.create({ data: { id: roundId, lobbyId, sessionId: roundId, number, game, teams: teams?.count ?? null, startedAt: now } });
        const expiresAt = new Date(now.getTime() + PLAYER_ACCESS_MS);
        for (const player of players) {
          const key = seatKey(player.id);
          const seat = await tx.sessionPlayer.create({ data: { sessionId: roundId, displayName: player.displayName, personId: player.personId, joinKeyHash: tokenHash(`${roundId}:${key}`), ...(player.look === null ? {} : { look: player.look as object }) } });
          await tx.playerCredential.create({ data: { sessionId: roundId, playerId: seat.id, tokenHash: tokenHash(joinToken(secret, roundId, key)), expiresAt } });
          await tx.arcadeSeat.create({ data: { roundId, memberId: player.id, playerId: seat.id } });
        }
        await recordRoomChange(tx, roundId, 'player.joined');
      });
      // Teams are made, or the minigame explains itself; the leader continues from the room. If this step fails, the leader can begin from there.
      await hostStep(roundId, host.id, 'session.start').catch(error => { if (!(error instanceof GameError)) throw error; });
      return { roundId };
    },
    /** A seated member's access to the room of the round being played. */
    async enter(member: ArcadeMember) {
      roomAssert(config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE');
      const round = await client.arcadeRound.findFirst({ where: { lobbyId: member.lobbyId, endedAt: null } }); roomAssert(round, 'ROOM_NOT_AVAILABLE');
      const seat = await client.arcadeSeat.findUnique({ where: { roundId_memberId: { roundId: round.id, memberId: member.id } } }); roomAssert(seat, 'ROOM_NOT_AVAILABLE');
      const token = joinToken(config.ROOM_TOKEN_SECRET, round.sessionId, seatKey(member.id));
      const credential = await client.playerCredential.findUnique({ where: { tokenHash: tokenHash(token) } });
      roomAssert(credential && !credential.revokedAt && credential.expiresAt.getTime() > Date.now(), 'ROOM_NOT_AVAILABLE');
      return { sessionId: round.sessionId, token, expiresAt: credential.expiresAt };
    },
    /** The leader's step in a round's room, taken as the room's host. */
    async act(principal: Principal, input: unknown, now = new Date()) {
      const parsed = ArcadeActSchema.safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND');
      roomAssert(principal.actor.role === 'player', 'FORBIDDEN');
      const round = await client.arcadeRound.findUnique({ where: { sessionId: principal.sessionId }, include: { session: { select: { hostId: true } } } });
      roomAssert(round && !round.endedAt, 'ROOM_NOT_AVAILABLE');
      const seat = await client.arcadeSeat.findUnique({ where: { playerId: principal.actor.playerId }, include: { member: true } });
      roomAssert(seat && seat.roundId === round.id && !seat.member.leftAt, 'FORBIDDEN');
      await lobbies.touch(seat.member, now);
      roomAssert(await client.$transaction(async tx => { await lockLobby(tx, round.lobbyId); return ensureLeader(tx, round.lobbyId, now); }) === seat.memberId, 'FORBIDDEN');
      const { action, stageRunId } = parsed.data;
      if (action === 'end') { await end(round.id, now); return; }
      const view = await readSessionView(client, { role: 'host', creatorId: round.session.hostId }, round.sessionId);
      if (action === 'begin') { roomAssert(view.status === 'LOBBY', 'INVALID_STATE'); await hostStep(round.sessionId, round.session.hostId, 'session.start'); return; }
      // A break or a server restart pauses the room; the leader continues it.
      if (action === 'resume') { roomAssert(view.status === 'PAUSED', 'INVALID_STATE'); await hostStep(round.sessionId, round.session.hostId, 'session.resume'); return; }
      roomAssert(view.stage && view.stage.id === stageRunId, 'INVALID_STATE');
      await hostStep(round.sessionId, round.session.hostId, HOST_STEPS[action], { stageRunId });
    },
    /** Closes lobbies nobody was seen in for 15 minutes; a round still open there ends without results. */
    async sweep(now = new Date()) {
      const quiet = await client.arcadeLobby.findMany({ where: { closedAt: null, lastActiveAt: { lt: new Date(now.getTime() - QUIET_MS) } }, select: { id: true }, take: 50 });
      for (const lobby of quiet) {
        await client.$transaction(async tx => {
          await lockLobby(tx, lobby.id);
          const open = await tx.arcadeRound.findMany({ where: { lobbyId: lobby.id, endedAt: null } });
          for (const round of open) { await tx.arcadeRound.update({ where: { id: round.id }, data: { endedAt: now } }); await finishRoom(tx, round.sessionId, now); }
          await tx.arcadeLobby.updateMany({ where: { id: lobby.id, closedAt: null, lastActiveAt: { lt: new Date(now.getTime() - QUIET_MS) } }, data: { closedAt: now } });
        });
      }
      return quiet.length;
    },
  };
}
export type Rounds = ReturnType<typeof createRounds>;
