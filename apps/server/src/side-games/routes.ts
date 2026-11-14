import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  BLACKJACK_OUTCOMES, BlackjackMoveSchema, PACK_PRICE, BlackjackResultSchema, BlackjackStartSchema, GameIdSchema, GamblingBoardSchema, PackOpenSchema, PackResultSchema, playerNeeded,
  REFILL_BELOW, REFILL_CHIPS, SlotResultSchema, SlotSpinSchema, slotMultiplier, WalletSchema, type GamblerRow, type RoomReply, type SlotSymbol,
} from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient, SideRound } from '../generated/prisma/client.js';
import { GameError } from '../game/errors.js';
import type { Transaction } from '../game/model.js';
import { readSessionView } from '../game/views.js';
import type { createRoomGateway } from '../rooms/gateway.js';
import { readRoomState } from '../rooms/reclaim.js';
import { allowedOrigin, RateLimiter, RoomError, roomAssert } from '../rooms/security.js';
import { deal, handView, HandStateSchema, move, openPack, outcomeOf, payoutFor, spinReels, type HandState, type Outcome } from './rules.js';
import { balanceOf, entryFor, lockWallet, startWallet, walletWhere, type Seat } from './wallet.js';

const status: Partial<Record<string, number>> = { UNAUTHORIZED: 401, CREDENTIAL_EXPIRED: 401, FORBIDDEN: 403, ORIGIN_REJECTED: 403, RATE_LIMITED: 429, NOT_FOUND: 404, NOT_ENOUGH_CHIPS: 409, SIDE_GAMES_OFF: 409, SIDE_GAMES_PAUSED: 409 };
// A stored hand: the cards (the dealer's hidden one included) and, once over, its result.
const StoredHandSchema = HandStateSchema.extend({ outcome: z.enum(BLACKJACK_OUTCOMES).nullable() });
const readHand = (round: SideRound): { hand: HandState; outcome: Outcome | null } => {
  const parsed = StoredHandSchema.safeParse(round.state); roomAssert(parsed.success, 'INVALID_STATE');
  const { outcome, ...hand } = parsed.data; return { hand, outcome };
};

/**
 * Side games on the phones: slot machine, blackjack and packs, for play chips.
 * Only a player of the room can play, only while the host allows side games,
 * and never while the game needs them (an open round they still have to answer).
 */
export function registerSideGames(app: FastifyInstance, client: PrismaClient, config: Config, gateway: ReturnType<typeof createRoomGateway>) {
  const limiter = new RateLimiter(4096);
  const fail = (reply: FastifyReply, error: unknown) => {
    const code = error instanceof RoomError || error instanceof GameError ? error.code : 'GAME_UNAVAILABLE';
    if (code === 'GAME_UNAVAILABLE') app.log.error({ err: error, event: 'side_game_failed' }, 'Side game request failed');
    else if (!['SIDE_GAMES_PAUSED', 'NOT_ENOUGH_CHIPS'].includes(code)) app.log.warn({ event: 'side_game_rejected', code }, 'Side game request rejected');
    return reply.code(status[code] ?? (code === 'GAME_UNAVAILABLE' ? 500 : 400)).send({ ok: false, error: { code } } satisfies RoomReply<never>);
  };
  /** The playing seat, whether side games are on, and whether the game needs the player right now. */
  async function seatOf(request: FastifyRequest) {
    roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
    const id = GameIdSchema.safeParse((request.params as { sessionId?: string }).sessionId); roomAssert(id.success, 'INVALID_COMMAND');
    const principal = await gateway.authenticate(id.data, request.headers.cookie);
    roomAssert(principal.actor.role === 'player', 'FORBIDDEN');
    // A few goes a second at most; a person's phones share their own counter.
    roomAssert(limiter.allow(`side:${principal.actor.playerId}`, 150), 'RATE_LIMITED');
    const [player, session, view] = await Promise.all([
      client.sessionPlayer.findUniqueOrThrow({ where: { id: principal.actor.playerId }, select: { id: true, sessionId: true, personId: true } }),
      client.gameSession.findUniqueOrThrow({ where: { id: id.data }, select: { state: true } }),
      readSessionView(client, principal.actor, id.data),
    ]);
    return { seat: player as Seat, enabled: readRoomState(session.state).sideGames, paused: playerNeeded(view, principal.actor.playerId) };
  }
  /** Runs one change to a wallet: side games on, not paused, wallet locked and started. */
  async function play<T>(request: FastifyRequest, work: (tx: Transaction, seat: Seat) => Promise<T>) {
    const { seat, enabled, paused } = await seatOf(request);
    roomAssert(enabled, 'SIDE_GAMES_OFF'); roomAssert(!paused, 'SIDE_GAMES_PAUSED');
    return client.$transaction(async tx => { await lockWallet(tx, seat); await startWallet(tx, seat); return work(tx, seat); });
  }
  /** A go the phone already made (same id) is answered from what was stored; someone else's id is refused. */
  const earlier = async (tx: Transaction, seat: Seat, roundId: string, game: string) => {
    const round = await tx.sideRound.findUnique({ where: { id: roundId } });
    roomAssert(!round || (round.playerId === seat.id && round.game === game), 'INVALID_COMMAND');
    return round;
  };
  const balance = async (tx: Transaction, seat: Seat) => (await balanceOf(tx, seat)).balance;
  const handOf = async (tx: Transaction, seat: Seat, round: SideRound) => { const { hand, outcome } = readHand(round); return handView(round, hand, outcome, await balance(tx, seat) >= round.bet); };

  app.get('/api/rooms/:sessionId/side', async (request, reply) => {
    try {
      const { seat, enabled, paused } = await seatOf(request);
      const data = await client.$transaction(async tx => {
        await lockWallet(tx, seat); if (enabled) await startWallet(tx, seat);
        const [money, refills, collection, open] = await Promise.all([
          balance(tx, seat), tx.chipEntry.count({ where: { ...walletWhere(seat), reason: 'REFILL' } }),
          tx.collectedItem.groupBy({ by: ['itemKey'], where: walletWhere(seat), _count: { _all: true } }),
          tx.sideRound.findFirst({ where: { playerId: seat.id, game: 'blackjack', finished: false } }),
        ]);
        return WalletSchema.parse({ enabled, paused, account: seat.personId ? 'person' : 'guest', balance: money, canRefill: enabled && money < REFILL_BELOW, refills,
          collection: collection.map(item => ({ itemKey: item.itemKey, count: item._count._all })), blackjack: open ? await handOf(tx, seat, open) : null });
      });
      return { ok: true, data };
    } catch (error) { return fail(reply, error); }
  });

  app.post('/api/rooms/:sessionId/side/refill', async (request, reply) => {
    try {
      return { ok: true, data: await play(request, async (tx, seat) => {
        roomAssert(await balance(tx, seat) < REFILL_BELOW, 'INVALID_COMMAND');
        await tx.chipEntry.create({ data: { ...entryFor(seat), reason: 'REFILL', amount: REFILL_CHIPS } });
        return { balance: await balance(tx, seat) };
      }) };
    } catch (error) { return fail(reply, error); }
  });

  app.post('/api/rooms/:sessionId/side/slots', async (request, reply) => {
    try {
      const parsed = SlotSpinSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND'); const { roundId, bet } = parsed.data;
      return { ok: true, data: await play(request, async (tx, seat) => {
        const before = await earlier(tx, seat, roundId, 'slots');
        if (before) return SlotResultSchema.parse({ roundId, reels: (before.state as { reels: SlotSymbol[] }).reels, bet: before.bet, payout: before.payout, balance: await balance(tx, seat) });
        roomAssert(await balance(tx, seat) >= bet, 'NOT_ENOUGH_CHIPS');
        const reels = spinReels(); const payout = bet * slotMultiplier(reels);
        await tx.sideRound.create({ data: { id: roundId, ...entryFor(seat), game: 'slots', finished: true, bet, payout, state: { reels } } });
        await tx.chipEntry.createMany({ data: [{ ...entryFor(seat), roundId, game: 'slots', reason: 'BET', amount: -bet }, ...(payout ? [{ ...entryFor(seat), roundId, game: 'slots', reason: 'PAYOUT' as const, amount: payout }] : [])] });
        return SlotResultSchema.parse({ roundId, reels, bet, payout, balance: await balance(tx, seat) });
      }) };
    } catch (error) { return fail(reply, error); }
  });

  app.post('/api/rooms/:sessionId/side/packs', async (request, reply) => {
    try {
      const parsed = PackOpenSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND'); const { roundId } = parsed.data;
      return { ok: true, data: await play(request, async (tx, seat) => {
        const before = await earlier(tx, seat, roundId, 'packs');
        if (before) return PackResultSchema.parse({ roundId, items: (before.state as { items: string[] }).items, balance: await balance(tx, seat) });
        roomAssert(await balance(tx, seat) >= PACK_PRICE, 'NOT_ENOUGH_CHIPS');
        const items = openPack();
        await tx.sideRound.create({ data: { id: roundId, ...entryFor(seat), game: 'packs', finished: true, bet: PACK_PRICE, state: { items } } });
        await tx.chipEntry.create({ data: { ...entryFor(seat), roundId, game: 'packs', reason: 'BET', amount: -PACK_PRICE } });
        await tx.collectedItem.createMany({ data: items.map(itemKey => ({ ...entryFor(seat), roundId, itemKey })) });
        return PackResultSchema.parse({ roundId, items, balance: await balance(tx, seat) });
      }) };
    } catch (error) { return fail(reply, error); }
  });

  app.post('/api/rooms/:sessionId/side/blackjack', async (request, reply) => {
    try {
      const parsed = BlackjackStartSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND'); const { roundId, bet } = parsed.data;
      return { ok: true, data: await play(request, async (tx, seat) => {
        const before = await earlier(tx, seat, roundId, 'blackjack')
          // One hand at a time: an unfinished hand is picked up again instead of dealing a new one.
          ?? await tx.sideRound.findFirst({ where: { playerId: seat.id, game: 'blackjack', finished: false } });
        if (before) return BlackjackResultSchema.parse({ hand: await handOf(tx, seat, before), balance: await balance(tx, seat) });
        roomAssert(await balance(tx, seat) >= bet, 'NOT_ENOUGH_CHIPS');
        const hand = deal(); const outcome = outcomeOf(hand, false); const payout = payoutFor(outcome, bet);
        const round = await tx.sideRound.create({ data: { id: roundId, ...entryFor(seat), game: 'blackjack', finished: outcome !== null, bet, payout, state: { ...hand, outcome } } });
        await tx.chipEntry.createMany({ data: [{ ...entryFor(seat), roundId, game: 'blackjack', reason: 'BET', amount: -bet }, ...(payout ? [{ ...entryFor(seat), roundId, game: 'blackjack', reason: 'PAYOUT' as const, amount: payout }] : [])] });
        return BlackjackResultSchema.parse({ hand: await handOf(tx, seat, round), balance: await balance(tx, seat) });
      }) };
    } catch (error) { return fail(reply, error); }
  });

  app.post('/api/rooms/:sessionId/side/blackjack/move', async (request, reply) => {
    try {
      const parsed = BlackjackMoveSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND'); const { roundId, step, move: action } = parsed.data;
      return { ok: true, data: await play(request, async (tx, seat) => {
        const round = await earlier(tx, seat, roundId, 'blackjack'); roomAssert(round, 'NOT_FOUND');
        // A repeated or out-of-date move changes nothing: the phone gets the hand as it is.
        if (round.finished || round.step !== step) return BlackjackResultSchema.parse({ hand: await handOf(tx, seat, round), balance: await balance(tx, seat) });
        const { hand } = readHand(round); let bet = round.bet;
        if (action === 'double') {
          roomAssert(hand.player.length === 2 && !hand.doubled, 'INVALID_COMMAND');
          roomAssert(await balance(tx, seat) >= round.bet, 'NOT_ENOUGH_CHIPS');
          await tx.chipEntry.create({ data: { ...entryFor(seat), roundId, game: 'blackjack', reason: 'BET', amount: -round.bet } }); bet *= 2;
        }
        const result = move(hand, action); const payout = payoutFor(result.outcome, bet);
        const saved = await tx.sideRound.update({ where: { id: roundId }, data: { step: step + 1, bet, payout, finished: result.outcome !== null, state: { ...result.state, outcome: result.outcome } } });
        if (payout) await tx.chipEntry.create({ data: { ...entryFor(seat), roundId, game: 'blackjack', reason: 'PAYOUT', amount: payout } });
        return BlackjackResultSchema.parse({ hand: await handOf(tx, seat, saved), balance: await balance(tx, seat) });
      }) };
    } catch (error) { return fail(reply, error); }
  });

  // Who gambled how much: this room, and every person across all games.
  app.get('/api/rooms/:sessionId/side/board', async (request, reply) => {
    try {
      const { seat } = await seatOf(request);
      type Row = { playerId: string | null; name: string; person: boolean; balance: bigint; wagered: bigint; won: bigint; biggestWin: bigint; refills: bigint };
      const row = (entry: Row): GamblerRow => ({ playerId: entry.playerId, name: entry.name, person: entry.person, balance: Number(entry.balance), wagered: Number(entry.wagered), won: Number(entry.won), biggestWin: Number(entry.biggestWin), refills: Number(entry.refills) });
      const room = await client.$queryRaw<Row[]>`
        SELECT p.id AS "playerId", p."displayName" AS name, p."personId" IS NOT NULL AS person,
          CASE WHEN p."personId" IS NULL THEN COALESCE(SUM(c.amount), 0) ELSE (SELECT COALESCE(SUM(amount), 0) FROM chip_entries WHERE "personId" = p."personId") END::bigint AS balance,
          COALESCE(SUM(-c.amount) FILTER (WHERE c.reason = 'BET'), 0)::bigint AS wagered,
          COALESCE(SUM(c.amount) FILTER (WHERE c.reason = 'PAYOUT'), 0)::bigint AS won,
          (SELECT COALESCE(MAX(GREATEST(r.payout - r.bet, 0)), 0) FROM side_rounds r WHERE r."playerId" = p.id AND r.finished)::bigint AS "biggestWin",
          COUNT(*) FILTER (WHERE c.reason = 'REFILL')::bigint AS refills
        FROM session_players p LEFT JOIN chip_entries c ON c."playerId" = p.id
        WHERE p."sessionId" = ${seat.sessionId}::uuid AND p."leftAt" IS NULL
        GROUP BY p.id
        -- Everyone in the room with a wallet: guests who played here, people who played anywhere.
        HAVING COUNT(c.id) > 0 OR (p."personId" IS NOT NULL AND EXISTS (SELECT 1 FROM chip_entries WHERE "personId" = p."personId"))
        ORDER BY wagered DESC, name LIMIT 100`;
      const allTime = await client.$queryRaw<Row[]>`
        SELECT NULL::uuid AS "playerId", pe.name, TRUE AS person, COALESCE(SUM(c.amount), 0)::bigint AS balance,
          COALESCE(SUM(-c.amount) FILTER (WHERE c.reason = 'BET'), 0)::bigint AS wagered,
          COALESCE(SUM(c.amount) FILTER (WHERE c.reason = 'PAYOUT'), 0)::bigint AS won,
          (SELECT COALESCE(MAX(GREATEST(r.payout - r.bet, 0)), 0) FROM side_rounds r WHERE r."personId" = pe.id AND r.finished)::bigint AS "biggestWin",
          COUNT(*) FILTER (WHERE c.reason = 'REFILL')::bigint AS refills
        FROM people pe JOIN chip_entries c ON c."personId" = pe.id
        WHERE pe."removedAt" IS NULL
        GROUP BY pe.id ORDER BY wagered DESC, pe.name LIMIT 50`;
      return { ok: true, data: GamblingBoardSchema.parse({ room: room.map(row), allTime: allTime.map(row) }) };
    } catch (error) { return fail(reply, error); }
  });
}
