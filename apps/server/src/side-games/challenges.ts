import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Server } from 'socket.io';
import { ChallengeListSchema, ChallengeMoveSchema, ChallengeSchema, GameIdSchema, NewChallengeSchema, type HeadToHeadKey } from '@party/contracts';
import type { PrismaClient, SideChallenge } from '../generated/prisma/client.js';
import type { Transaction } from '../game/model.js';
import { IllegalMove, type Seat as BoardSeat } from '../head-to-head/engine.js';
import { matchOutcome, matchView, playMove, readMatch, resignMatch, startMatch, type MatchState } from '../head-to-head/match.js';
import { RoomError, roomAssert } from '../rooms/security.js';
import { balanceOf, entryFor, lockWallet, startWallet, type Seat } from './wallet.js';

// Challenges between two players of a room, on their phones: rock paper scissors,
// tic-tac-toe, chess or any other game in the head-to-head registry. The
// challenger may put up a stake: when the other accepts, both put it in; the
// winner takes both, a draw gives them back. Moves follow the side-game rules:
// refused while the game needs the player. Rows only live as long as the room
// (see cleanUpChallenges): the game and its replay go with it.
interface Access {
  seatOf(request: FastifyRequest): Promise<{ seat: Seat; enabled: boolean; paused: boolean }>;
  fail(reply: FastifyReply, error: unknown): unknown;
}
const OPEN = ['INVITED', 'PLAYING'];
const MAX_OPEN_INVITES = 3;

export function registerChallenges(app: FastifyInstance, client: PrismaClient, access: Access, io: Server | undefined) {
  const base = '/api/rooms/:sessionId/side/challenges';
  /** Tells both players' phones that a challenge changed; they fetch the list again. */
  const notify = (row: Pick<SideChallenge, 'id' | 'sessionId' | 'challengerId' | 'opponentId'>) => {
    for (const playerId of [row.challengerId, row.opponentId]) io?.to(`player:${row.sessionId}:${playerId}`).emit('side.challenge', { challengeId: row.id });
  };
  const view = (row: SideChallenge, me: string) => {
    const match = readMatch(row.state); roomAssert(match, 'INVALID_STATE');
    const seat: BoardSeat = row.challengerId === me ? 0 : 1;
    return ChallengeSchema.parse({ id: row.id, game: row.game, stake: row.stake, status: row.status, challengerId: row.challengerId, opponentId: row.opponentId,
      mine: seat === 0 ? 'challenger' : 'opponent', view: matchView(match, row.status === 'PLAYING' || row.status === 'FINISHED' ? seat : null), updatedAt: row.updatedAt.toISOString() });
  };
  const idOf = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { challengeId?: string }).challengeId); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  const seatRow = (tx: Transaction, sessionId: string, playerId: string) => tx.sessionPlayer.findFirstOrThrow({ where: { id: playerId, sessionId }, select: { id: true, sessionId: true, personId: true } });
  /** Both wallets locked in a fixed order, so two challenges between the same pair never wait on each other. */
  const lockBoth = async (tx: Transaction, a: Seat, b: Seat) => { for (const seat of [a, b].sort((x, y) => (x.personId ?? x.id) < (y.personId ?? y.id) ? -1 : 1)) await lockWallet(tx, seat); };
  /** One challenge at a time: every change to it holds its lock and reads it fresh. */
  const locked = async (tx: Transaction, id: string, me: Seat) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`challenge:${id}`}, 0))::text AS locked`;
    const row = await tx.sideChallenge.findUnique({ where: { id } });
    roomAssert(row && row.sessionId === me.sessionId && (row.challengerId === me.id || row.opponentId === me.id), 'NOT_FOUND');
    return row;
  };
  /** A finished game pays out: the winner takes both stakes; a draw returns each. */
  const finish = async (tx: Transaction, row: SideChallenge, match: MatchState) => {
    const outcome = matchOutcome(match); if (!outcome) return;
    const [challenger, opponent] = await Promise.all([seatRow(tx, row.sessionId, row.challengerId), seatRow(tx, row.sessionId, row.opponentId)]);
    if (row.stake > 0) {
      await lockBoth(tx, challenger, opponent);
      const pay = (seat: Seat, amount: number) => ({ ...entryFor(seat), game: row.game, reason: 'PAYOUT' as const, amount });
      await tx.chipEntry.createMany({ data: outcome.kind === 'win' ? [pay(outcome.seat === 0 ? challenger : opponent, row.stake * 2)] : [pay(challenger, row.stake), pay(opponent, row.stake)] });
    }
    await tx.sideChallenge.update({ where: { id: row.id }, data: { status: 'FINISHED' } });
  };

  app.get(base, async (request, reply) => {
    try {
      const { seat } = await access.seatOf(request);
      const rows = await client.sideChallenge.findMany({ where: { sessionId: seat.sessionId, OR: [{ challengerId: seat.id }, { opponentId: seat.id }] }, orderBy: { createdAt: 'desc' }, take: 20 });
      const { balance } = await client.$transaction(tx => balanceOf(tx, seat));
      return { ok: true, data: ChallengeListSchema.parse({ challenges: rows.map(row => view(row, seat.id)), balance }) };
    } catch (error) { return access.fail(reply, error); }
  });

  app.post(base, async (request, reply) => {
    try {
      const parsed = NewChallengeSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { challengeId, opponentId, game, stake, settings } = parsed.data;
      const { seat, enabled, paused } = await access.seatOf(request);
      roomAssert(enabled, 'SIDE_GAMES_OFF'); roomAssert(!paused, 'SIDE_GAMES_PAUSED');
      const match = startMatch(game as HeadToHeadKey, settings); roomAssert(match, 'INVALID_COMMAND');
      const row = await client.$transaction(async tx => {
        // A repeated tap returns the same challenge.
        const earlier = await tx.sideChallenge.findUnique({ where: { id: challengeId } });
        if (earlier) { roomAssert(earlier.challengerId === seat.id, 'INVALID_COMMAND'); return earlier; }
        roomAssert(opponentId !== seat.id, 'INVALID_COMMAND');
        roomAssert(await tx.sessionPlayer.count({ where: { id: opponentId, sessionId: seat.sessionId, leftAt: null } }) === 1, 'NOT_FOUND');
        roomAssert(await tx.sideChallenge.count({ where: { sessionId: seat.sessionId, status: { in: OPEN }, OR: [{ challengerId: seat.id, opponentId }, { challengerId: opponentId, opponentId: seat.id }] } }) === 0, 'ALREADY_SUBMITTED');
        roomAssert(await tx.sideChallenge.count({ where: { sessionId: seat.sessionId, challengerId: seat.id, status: 'INVITED' } }) < MAX_OPEN_INVITES, 'RATE_LIMITED');
        await lockWallet(tx, seat); await startWallet(tx, seat);
        roomAssert((await balanceOf(tx, seat)).balance >= stake, 'NOT_ENOUGH_CHIPS');
        return tx.sideChallenge.create({ data: { id: challengeId, sessionId: seat.sessionId, challengerId: seat.id, opponentId, game, stake, status: 'INVITED', state: match as object } });
      });
      notify(row);
      return { ok: true, data: view(row, seat.id) };
    } catch (error) { return access.fail(reply, error); }
  });

  // The opponent accepts: both stakes go in and the game starts.
  app.post(`${base}/:challengeId/accept`, async (request, reply) => {
    try {
      const { seat, enabled, paused } = await access.seatOf(request);
      roomAssert(enabled, 'SIDE_GAMES_OFF'); roomAssert(!paused, 'SIDE_GAMES_PAUSED');
      const row = await client.$transaction(async tx => {
        const row = await locked(tx, idOf(request), seat);
        roomAssert(row.opponentId === seat.id && row.status === 'INVITED', 'INVALID_STATE');
        const challenger = await seatRow(tx, row.sessionId, row.challengerId);
        await lockBoth(tx, challenger, seat); await startWallet(tx, challenger); await startWallet(tx, seat);
        if (row.stake > 0) {
          for (const who of [challenger, seat]) roomAssert((await balanceOf(tx, who)).balance >= row.stake, 'NOT_ENOUGH_CHIPS');
          await tx.chipEntry.createMany({ data: [challenger, seat].map(who => ({ ...entryFor(who), game: row.game, reason: 'BET' as const, amount: -row.stake })) });
        }
        return tx.sideChallenge.update({ where: { id: row.id }, data: { status: 'PLAYING' } });
      });
      notify(row);
      return { ok: true, data: view(row, seat.id) };
    } catch (error) { return access.fail(reply, error); }
  });

  // The opponent declines, or the challenger takes the challenge back, before it starts.
  app.post(`${base}/:challengeId/close`, async (request, reply) => {
    try {
      const { seat } = await access.seatOf(request);
      const row = await client.$transaction(async tx => {
        const row = await locked(tx, idOf(request), seat); roomAssert(row.status === 'INVITED', 'INVALID_STATE');
        return tx.sideChallenge.update({ where: { id: row.id }, data: { status: row.opponentId === seat.id ? 'DECLINED' : 'CANCELLED' } });
      });
      notify(row);
      return { ok: true, data: view(row, seat.id) };
    } catch (error) { return access.fail(reply, error); }
  });

  const playOrResign = (action: 'move' | 'resign') => async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = action === 'move' ? ChallengeMoveSchema.safeParse(request.body) : null; if (parsed) roomAssert(parsed.success, 'INVALID_COMMAND');
      const { seat, paused } = await access.seatOf(request);
      // Moves wait while the game needs the player; giving up is always allowed.
      if (action === 'move') roomAssert(!paused, 'SIDE_GAMES_PAUSED');
      const row = await client.$transaction(async tx => {
        const row = await locked(tx, idOf(request), seat); roomAssert(row.status === 'PLAYING', 'INVALID_STATE');
        const match = readMatch(row.state); roomAssert(match, 'INVALID_STATE');
        const mySeat: BoardSeat = row.challengerId === seat.id ? 0 : 1;
        let next: MatchState;
        try { next = action === 'resign' ? resignMatch(match, mySeat) : playMove(match, mySeat, parsed!.data!.move); }
        catch (error) { if (error instanceof IllegalMove) throw new RoomError('INVALID_SUBMISSION'); throw error; }
        const updated = await tx.sideChallenge.update({ where: { id: row.id }, data: { state: next as object } });
        await finish(tx, updated, next);
        return tx.sideChallenge.findUniqueOrThrow({ where: { id: row.id } });
      });
      notify(row);
      return { ok: true, data: view(row, seat.id) };
    } catch (error) { return access.fail(reply, error); }
  };
  app.post(`${base}/:challengeId/move`, playOrResign('move'));
  app.post(`${base}/:challengeId/resign`, playOrResign('resign'));

  // Every ten minutes: rooms that are over lose their challenges (stakes still in a game go back first).
  let cleaning: Promise<unknown> | undefined; let closing = false;
  const clean = () => { if (cleaning || closing) return; cleaning = cleanUpChallenges(client, new Date())
    .then(removed => { if (removed) app.log.info({ event: 'challenges_cleaned', removed }, 'Challenges of finished rooms removed'); })
    .catch(() => { app.log.warn({ event: 'challenge_cleanup_failed' }, 'Challenge clean-up failed; retrying later'); }).finally(() => { cleaning = undefined; }); };
  const timer = setInterval(clean, 10 * 60 * 1000); timer.unref();
  app.addHook('preClose', async () => { closing = true; clearInterval(timer); await cleaning; });
}

const HOUR = 60 * 60 * 1000;
/**
 * Challenges only last as long as their room: once the room has ended (an hour
 * ago) or has been quiet for half a day, a game still going returns both stakes
 * and every challenge of the room is deleted, with its game and replay. Declined
 * and taken-back challenges go after an hour. A small batch per run.
 */
export async function cleanUpChallenges(client: PrismaClient, now: Date): Promise<number> {
  const ended = new Date(now.getTime() - HOUR); const quiet = new Date(now.getTime() - 12 * HOUR);
  const rooms = await client.sideChallenge.groupBy({ by: ['sessionId'], orderBy: { sessionId: 'asc' }, take: 1000 });
  const over = await client.gameSession.findMany({ where: { id: { in: rooms.map(room => room.sessionId) }, OR: [{ endedAt: { lt: ended } }, { updatedAt: { lt: quiet } }] }, select: { id: true } });
  const rows = await client.sideChallenge.findMany({ where: { OR: [
    { sessionId: { in: over.map(room => room.id) } },
    { status: { in: ['DECLINED', 'CANCELLED'] }, updatedAt: { lt: ended } },
  ] }, select: { id: true }, take: 200 });
  let removed = 0;
  for (const { id } of rows) {
    await client.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`challenge:${id}`}, 0))::text AS locked`;
      const row = await tx.sideChallenge.findUnique({ where: { id } }); if (!row) return;
      if (row.status === 'PLAYING' && row.stake > 0) {
        const seats = await tx.sessionPlayer.findMany({ where: { sessionId: row.sessionId, id: { in: [row.challengerId, row.opponentId] } }, select: { id: true, sessionId: true, personId: true } });
        for (const seat of seats.sort((x, y) => (x.personId ?? x.id) < (y.personId ?? y.id) ? -1 : 1)) { await lockWallet(tx, seat); await tx.chipEntry.create({ data: { ...entryFor(seat), game: row.game, reason: 'PAYOUT', amount: row.stake } }); }
      }
      await tx.sideChallenge.delete({ where: { id } }); removed++;
    });
  }
  return removed;
}
