import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ECONOMY, rouletteColor } from '@party/contracts';

// The pack set and chip amounts the migrations start with.
const START_CHIPS = DEFAULT_ECONOMY.startChips; const PACK_PRICE = 100; const setId = '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { createGameService } from '../../../src/game/service.js';
import { readRoomState } from '../../../src/rooms/reclaim.js';
import { db, fixture, prisma } from '../game-fixture.js';
import { parseDefinition } from '../../../src/game/definition.js';
import { preparedGame } from '../../../src/game/prepared-game.js';

const ownerToken = 'p'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'e'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready(); });
afterAll(async () => { await app.close(); await db.close(); });
type Method = 'GET' | 'POST' | 'PUT';
const call = (method: Method, url: string, body?: unknown, cookie?: string) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
const cookieOf = (response: Awaited<ReturnType<typeof call>>) => String(response.headers['set-cookie']).split(';')[0]!;
let owner = '';
async function ownerCookie() { if (!owner) owner = cookieOf(await call('POST', '/api/host/claim', { token: ownerToken })); return owner; }
/** A room of a built-in game: side games on, chips off, as a new room starts. With `chips`, the host switches chips on. */
async function openRoom({ chips = true } = {}) {
  const body = { gameKey: 'timed-quiz', sessionId: randomUUID(), commandId: randomUUID() };
  const opened = await call('POST', '/api/host/rooms', body, await ownerCookie()); expect(opened.statusCode).toBe(200);
  const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: body.sessionId } });
  const host = cookieOf(opened);
  expect(readRoomState(session.state)).toMatchObject({ sideGames: true, chips: false });
  if (chips) expect((await call('POST', `/api/rooms/${body.sessionId}/settings`, { chips: true }, host)).statusCode).toBe(200);
  return { sessionId: body.sessionId, roomCode: session.roomCode!, host };
}
async function join(roomCode: string, displayName: string, personCookie?: string) {
  const joined = await call('POST', '/api/rooms/join', { roomCode, joinId: randomUUID(), displayName }, personCookie); expect(joined.statusCode).toBe(200);
  return cookieOf(joined);
}
async function makePerson(name: string) {
  const made = await call('POST', '/api/host/people', { name }, await ownerCookie()); expect(made.statusCode).toBe(200);
  const claimed = await call('POST', '/api/people/claim', { token: made.json().data.key }); expect(claimed.statusCode).toBe(200);
  return { id: made.json().data.id as string, token: made.json().data.key as string, cookie: cookieOf(claimed) };
}
const both = (a: string, b?: string) => b ? `${a}; ${b}` : a;

describe('people: a phone always joins as the same person', () => {
  it('lets only the owner make people, refuses a name twice and unknown links', async () => {
    expect((await call('POST', '/api/host/people', { name: 'Nobody' })).statusCode).toBe(401);
    expect((await call('GET', '/api/host/people')).statusCode).toBe(401);
    const name = `Dinny ${randomUUID().slice(0, 6)}`;
    await makePerson(name);
    expect((await call('POST', '/api/host/people', { name: name.toUpperCase() }, await ownerCookie())).statusCode).toBe(409);
    expect((await call('POST', '/api/people/claim', { token: 'z'.repeat(43) })).statusCode).toBe(401);
    expect((await call('GET', '/api/people/me')).json().data.person).toBeNull();
  });

  it('joins under the person’s name, and a second phone continues the same seat', async () => {
    const name = `Sam ${randomUUID().slice(0, 6)}`; const person = await makePerson(name);
    expect((await call('GET', '/api/people/me', undefined, person.cookie)).json().data.person).toMatchObject({ name });
    // The link works on a second phone too; each phone gets its own device key.
    const secondPhone = cookieOf(await call('POST', '/api/people/claim', { token: person.token }));
    expect(secondPhone).not.toBe(person.cookie);
    const room = await openRoom();
    const first = await join(room.roomCode, 'typed something else', person.cookie);
    const second = await join(room.roomCode, 'whatever', secondPhone);
    const seats = await prisma.sessionPlayer.findMany({ where: { sessionId: room.sessionId } });
    expect(seats).toHaveLength(1); expect(seats[0]).toMatchObject({ displayName: name, personId: person.id });
    expect((await call('GET', `/api/rooms/${room.sessionId}`, undefined, second)).json().data.selfPlayerId).toBe(seats[0]!.id);
    expect((await call('GET', `/api/rooms/${room.sessionId}`, undefined, first)).json().data.selfPlayerId).toBe(seats[0]!.id);

    // Signing phones out (or "not me" on one phone) makes them guests again; history stays.
    expect((await call('POST', '/api/people/forget', {}, secondPhone)).statusCode).toBe(200);
    expect((await call('GET', '/api/people/me', undefined, secondPhone)).json().data.person).toBeNull();
    expect((await call('POST', `/api/host/people/${person.id}/sign-out`, {}, await ownerCookie())).statusCode).toBe(200);
    expect((await call('GET', '/api/people/me', undefined, person.cookie)).json().data.person).toBeNull();
    // A new key replaces the old one.
    const relinked = await call('POST', `/api/host/people/${person.id}/key`, {}, await ownerCookie());
    expect((await call('POST', '/api/people/claim', { token: person.token })).statusCode).toBe(401);
    expect((await call('POST', '/api/people/claim', { token: relinked.json().data.key })).statusCode).toBe(200);
    // Removing frees the name and stops the key.
    expect((await call('POST', `/api/host/people/${person.id}/remove`, {}, await ownerCookie())).statusCode).toBe(200);
    expect((await call('POST', '/api/people/claim', { token: relinked.json().data.key })).statusCode).toBe(401);
    expect((await call('POST', '/api/host/people', { name }, await ownerCookie())).statusCode).toBe(200);
  });
});

describe('side games and chips', () => {
  it('has one roulette: the old red-or-black side spin is gone, and outside bets pay on the table', async () => {
    const room = await openRoom();
    const phone = await join(room.roomCode, 'Roulette player');
    expect((await call('POST', `/api/rooms/${room.sessionId}/side/red-or-black-roulette`, { roundId: randomUUID(), bet: 25, guess: 'red' }, phone)).statusCode).toBe(404);
    const bets = [{ guess: 'dozen3', bet: 10 }, { guess: 'odd', bet: 5 }];
    const result = (await call('POST', `/api/rooms/${room.sessionId}/side/roulette`, { roundId: randomUUID(), bets }, phone)).json().data;
    const pocket = result.roulette as number;
    const payout = (pocket >= 25 ? 30 : 0) + (pocket % 2 === 1 ? 10 : 0);
    expect(result).toMatchObject({ payout, balance: START_CHIPS - 15 + payout });
    const free = (await call('POST', `/api/rooms/${room.sessionId}/side/roulette`, { roundId: randomUUID(), bets: [{ guess: 'low', bet: 0 }] }, phone)).json().data;
    expect(free).toMatchObject({ payout: 0, balance: result.balance });
  });

  it('settles an entire roulette board atomically and supports green zero as a straight-up bet', async () => {
    const room = await openRoom();
    const phone = await join(room.roomCode, 'Table player');
    const path = `/api/rooms/${room.sessionId}/side/roulette`;
    const bets = [{ guess: 0, bet: 10 }, { guess: 32, bet: 25 }, { guess: 'red', bet: 50 }];
    const roundId = randomUUID();
    const first = await call('POST', path, { roundId, bets }, phone);
    expect(first.statusCode).toBe(200);
    const result = first.json().data;
    const payout = (result.roulette === 0 ? 360 : result.roulette === 32 ? 900 : 0)
      + (rouletteColor(result.roulette) === 'red' ? 100 : 0);
    expect(result).toMatchObject({ roundId, bets, payout, balance: START_CHIPS - 85 + payout });
    const repeated = await call('POST', path, { roundId, bets: [...bets].reverse() }, phone);
    expect(repeated.json().data).toEqual(result);
    expect(await prisma.chipEntry.count({ where: { roundId, reason: 'BET' } })).toBe(1);
    expect((await call('POST', path, { roundId, bets: [{ guess: 0, bet: 50 }] }, phone)).statusCode).toBe(400);
    expect((await call('POST', path, { roundId: randomUUID(), bets: [{ guess: 37, bet: 10 }] }, phone)).statusCode).toBe(400);
    expect((await call('POST', `/api/rooms/${room.sessionId}/settings`, { chips: false }, room.host)).statusCode).toBe(200);
    const free = { roundId: randomUUID(), bets: [{ guess: 0, bet: 0 }] };
    expect((await call('POST', path, free, phone)).json().data).toMatchObject({ ...free, payout: 0, balance: result.balance });
    expect(await prisma.chipEntry.count({ where: { roundId: free.roundId } })).toBe(0);
  });

  it('keeps free pack opens out of a collection even when retried after chips are enabled', async () => {
    const room = await openRoom({ chips: false });
    const phone = await join(room.roomCode, 'Pack preview');
    const side = `/api/rooms/${room.sessionId}/side`;
    const request = { roundId: randomUUID(), setId };
    const free = (await call('POST', `${side}/packs`, request, phone)).json().data;
    expect(free).toMatchObject({ collected: false, balance: 0, items: expect.arrayContaining([expect.any(String)]) });
    expect(await prisma.collectedItem.count({ where: { roundId: request.roundId } })).toBe(0);
    expect(await prisma.chipEntry.count({ where: { roundId: request.roundId } })).toBe(0);
    expect((await call('POST', `/api/rooms/${room.sessionId}/settings`, { chips: true }, room.host)).statusCode).toBe(200);
    expect((await call('POST', `${side}/packs`, request, phone)).json().data)
      .toMatchObject({ items: free.items, collected: false, balance: START_CHIPS });
    const preview = { ...request, roundId: randomUUID(), preview: true };
    expect((await call('POST', `${side}/packs`, preview, phone)).json().data).toMatchObject({ collected: false, balance: START_CHIPS });
    const purchase = { roundId: randomUUID(), setId };
    expect((await call('POST', `${side}/packs`, purchase, phone)).json().data).toMatchObject({ collected: true, balance: START_CHIPS - PACK_PRICE });
    expect(await prisma.collectedItem.count({ where: { roundId: purchase.roundId } })).toBe(4);
  });

  it('settles a solo coin stake once and leaves the wallet alone for free flips', async () => {
    const room = await openRoom();
    const phone = await join(room.roomCode, 'Coin player');
    const other = await join(room.roomCode, 'Other coin player');
    const path = `/api/rooms/${room.sessionId}/side/heads-or-tails`;
    const body = { roundId: randomUUID(), bet: 25, guess: 'heads' };
    expect((await call('POST', path, body, room.host)).statusCode).toBe(403);
    const replies = await Promise.all([call('POST', path, body, phone), call('POST', path, body, phone)]);
    expect(replies.map(reply => reply.statusCode)).toEqual([200, 200]);
    const first = replies[0]!.json().data;
    expect(replies[1]!.json().data).toEqual(first);
    const payout = first.coin === 'heads' ? 50 : 0;
    expect(first).toMatchObject({ ...body, payout, balance: START_CHIPS - body.bet + payout });
    expect(await prisma.chipEntry.findMany({ where: { roundId: body.roundId }, select: { amount: true }, orderBy: { amount: 'asc' } }))
      .toEqual(payout ? [{ amount: -25 }, { amount: 50 }] : [{ amount: -25 }]);
    expect((await call('POST', path, { ...body, guess: 'tails' }, phone)).statusCode).toBe(400);
    expect((await call('POST', path, body, other)).statusCode).toBe(400);

    const free = { ...body, roundId: randomUUID(), bet: 0 };
    expect((await call('POST', path, free, phone)).json().data).toMatchObject({ bet: 0, payout: 0, balance: first.balance });
    expect(await prisma.chipEntry.count({ where: { roundId: free.roundId } })).toBe(0);
    expect((await call('POST', `/api/rooms/${room.sessionId}/settings`, { chips: false }, room.host)).statusCode).toBe(200);
    const staked = await call('POST', path, { ...body, roundId: randomUUID() }, phone);
    expect(staked.json().error.code).toBe('CHIPS_OFF');
    expect((await call('POST', path, { ...free, roundId: randomUUID() }, phone)).statusCode).toBe(200);
  });

  it('keeps a person’s chips across games, and a guest’s for one room only', async () => {
    const person = await makePerson(`Lucky ${randomUUID().slice(0, 6)}`);
    const roomA = await openRoom();
    const phone = await join(roomA.roomCode, 'x', person.cookie);
    const guest = await join(roomA.roomCode, 'Guest');
    const wallet = await call('GET', `/api/rooms/${roomA.sessionId}/side`, undefined, phone);
    expect(wallet.json().data).toMatchObject({ enabled: true, paused: false, account: 'person', balance: START_CHIPS });
    const pack = await call('POST', `/api/rooms/${roomA.sessionId}/side/packs`, { roundId: randomUUID(), setId }, phone);
    expect(pack.statusCode).toBe(200); expect(pack.json().data.balance).toBe(START_CHIPS - PACK_PRICE);
    expect((await call('GET', `/api/rooms/${roomA.sessionId}/side`, undefined, guest)).json().data).toMatchObject({ account: 'guest', balance: START_CHIPS });

    const roomB = await openRoom();
    const later = await join(roomB.roomCode, 'x', both(person.cookie));
    const carried = (await call('GET', `/api/rooms/${roomB.sessionId}/side`, undefined, later)).json().data;
    expect(carried.balance).toBe(START_CHIPS - PACK_PRICE); expect(carried.collection.reduce((sum: number, item: { count: number }) => sum + item.count, 0)).toBe(4);
    const guestB = await join(roomB.roomCode, 'Guest');
    expect((await call('GET', `/api/rooms/${roomB.sessionId}/side`, undefined, guestB)).json().data.balance).toBe(START_CHIPS);

    const board = (await call('GET', `/api/rooms/${roomB.sessionId}/side/board`, undefined, later)).json().data;
    expect(board.allTime).toEqual(expect.arrayContaining([expect.objectContaining({ person: true, wagered: PACK_PRICE, balance: START_CHIPS - PACK_PRICE })]));
    expect(board.room).toEqual(expect.arrayContaining([expect.objectContaining({ person: true, wagered: 0, balance: START_CHIPS - PACK_PRICE })]));
  });

  it('stores a retried spin once and never lets quick taps spend the same chips twice', async () => {
    const room = await openRoom(); const phone = await join(room.roomCode, 'Spender');
    const roundId = randomUUID();
    const spin = await call('POST', `/api/rooms/${room.sessionId}/side/slots`, { roundId, bet: 100 }, phone);
    const again = await call('POST', `/api/rooms/${room.sessionId}/side/slots`, { roundId, bet: 100 }, phone);
    expect(again.json().data.reels).toEqual(spin.json().data.reels); expect(await prisma.sideRound.count({ where: { id: roundId } })).toBe(1);
    const other = await join(room.roomCode, 'Thief');
    expect((await call('POST', `/api/rooms/${room.sessionId}/side/slots`, { roundId, bet: 100 }, other)).statusCode).toBe(400);
    expect((await call('POST', `/api/rooms/${room.sessionId}/side/slots`, { roundId: randomUUID(), bet: 7 }, phone)).statusCode).toBe(400);

    // Packs never pay chips back: the 200 starting chips buy exactly two, however many arrive at once.
    const packer = await join(room.roomCode, 'Packer');
    const tries = await Promise.all(Array.from({ length: 5 }, () => call('POST', `/api/rooms/${room.sessionId}/side/packs`, { roundId: randomUUID(), setId }, packer)));
    expect(tries.filter(reply => reply.statusCode === 200)).toHaveLength(2);
    expect(tries.filter(reply => reply.statusCode === 409).every(reply => reply.json().error.code === 'NOT_ENOUGH_CHIPS')).toBe(true);
    const broke = (await call('GET', `/api/rooms/${room.sessionId}/side`, undefined, packer)).json().data;
    // No free refills: chips are earned by playing.
    expect(broke).toMatchObject({ balance: 0, canRefill: false });
    expect((await call('POST', `/api/rooms/${room.sessionId}/side/refill`, {}, packer)).json().error.code).toBe('INVALID_STATE');
    // The ledger is history: it cannot be rewritten.
    await expect(prisma.chipEntry.updateMany({ where: { sessionId: room.sessionId }, data: { amount: 1 } })).rejects.toThrow();
  });

  it('plays a blackjack hand to the end, one move per step, with the dealer’s card hidden until then', async () => {
    const room = await openRoom(); const phone = await join(room.roomCode, 'Dealer fan');
    const start = await call('POST', `/api/rooms/${room.sessionId}/side/blackjack`, { roundId: randomUUID(), bet: 50 }, phone);
    let hand = start.json().data.hand;
    // Starting again while a hand is open picks that hand up.
    if (!hand.outcome) expect((await call('POST', `/api/rooms/${room.sessionId}/side/blackjack`, { roundId: randomUUID(), bet: 10 }, phone)).json().data.hand.roundId).toBe(hand.roundId);
    if (!hand.outcome) {
      expect(hand.dealer[1]).toBeNull();
      const stood = await call('POST', `/api/rooms/${room.sessionId}/side/blackjack/move`, { roundId: hand.roundId, step: hand.step, move: 'stand' }, phone);
      const repeated = await call('POST', `/api/rooms/${room.sessionId}/side/blackjack/move`, { roundId: hand.roundId, step: hand.step, move: 'hit' }, phone);
      expect(repeated.json().data).toEqual(stood.json().data);
      hand = stood.json().data.hand;
    }
    expect(hand.outcome).not.toBeNull(); expect(hand.dealer.every((card: number | null) => card !== null)).toBe(true);
    const balance = (await call('GET', `/api/rooms/${room.sessionId}/side`, undefined, phone)).json().data.balance;
    expect(balance).toBe(START_CHIPS - hand.bet + hand.payout);
  });

  it('opens a room with side games for fun, unless its game asks for chips or no side games', async () => {
    const opened = async (extra: object) => readRoomState((await prisma.gameSession.findUniqueOrThrow({ where: { id: (await fixture(0, parseDefinition({ ...preparedGame, ...extra }))).sessionId } })).state);
    expect(await opened({})).toMatchObject({ sideGames: true, chips: false });
    expect(await opened({ chips: true })).toMatchObject({ sideGames: true, chips: true });
    expect(await opened({ sideGames: false })).toMatchObject({ sideGames: false });
    // The host's quick time button comes from the game too (30 seconds unless it says otherwise).
    expect(await opened({})).toMatchObject({ quickTimeSeconds: 30 });
    expect(await opened({ quickTimeSeconds: 90 })).toMatchObject({ quickTimeSeconds: 90 });
    // So do the challenge invites a player can have waiting at once (3 unless it says otherwise).
    expect(await opened({})).toMatchObject({ openInvites: 3 });
    expect(await opened({ openInvites: 6 })).toMatchObject({ openInvites: 6 });
  });

  it('plays the side games just for fun without chips: no bets, the wallet untouched', async () => {
    const room = await openRoom({ chips: false }); const phone = await join(room.roomCode, 'Just fun');
    const wallet = (await call('GET', `/api/rooms/${room.sessionId}/side`, undefined, phone)).json().data;
    expect(wallet).toMatchObject({ enabled: true, chips: false, balance: 0, canRefill: false });
    // The phone may still send a bet; without chips it counts for nothing.
    const spin = (await call('POST', `/api/rooms/${room.sessionId}/side/slots`, { roundId: randomUUID(), bet: 100 }, phone)).json().data;
    expect(spin).toMatchObject({ bet: 0, payout: 0, balance: 0 }); expect(spin.reels).toHaveLength(3);
    const hand = (await call('POST', `/api/rooms/${room.sessionId}/side/blackjack`, { roundId: randomUUID(), bet: 50 }, phone)).json().data.hand;
    expect(hand.bet).toBe(0);
    const player = await prisma.sessionPlayer.findFirstOrThrow({ where: { sessionId: room.sessionId, displayName: 'Just fun' } });
    expect(await prisma.chipEntry.count({ where: { playerId: player.id } })).toBe(0);
    // Refills and stakes are chips only; a challenge for fun is fine.
    expect((await call('POST', `/api/rooms/${room.sessionId}/side/refill`, {}, phone)).json().error.code).toBe('CHIPS_OFF');
    const other = await join(room.roomCode, 'Opponent'); const opponent = await prisma.sessionPlayer.findFirstOrThrow({ where: { sessionId: room.sessionId, displayName: 'Opponent' } });
    const base = `/api/rooms/${room.sessionId}/side/challenges`;
    expect((await call('POST', base, { challengeId: randomUUID(), opponentId: opponent.id, game: 'rps', stake: 10 }, phone)).json().error.code).toBe('CHIPS_OFF');
    expect((await call('POST', base, { challengeId: randomUUID(), opponentId: opponent.id, game: 'rps', stake: 0 }, phone)).statusCode).toBe(200);
    expect((await call('GET', base, undefined, other)).json().data).toMatchObject({ chips: false });
  });

  it('pauses while a round needs the player, and stays off when the host switches side games off', async () => {
    const room = await openRoom(); const phone = await join(room.roomCode, 'Busy');
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: room.sessionId } });
    await createGameService(prisma).execute({ role: 'host', creatorId: session.hostId }, { formatVersion: 1, type: 'session.start', sessionId: room.sessionId, commandId: randomUUID(), expectedRevision: session.revision });
    expect((await call('GET', `/api/rooms/${room.sessionId}/side`, undefined, phone)).json().data.paused).toBe(true);
    const paused = await call('POST', `/api/rooms/${room.sessionId}/side/slots`, { roundId: randomUUID(), bet: 10 }, phone);
    expect(paused.statusCode).toBe(409); expect(paused.json().error.code).toBe('SIDE_GAMES_PAUSED');

    const lobby = await openRoom(); const player = await join(lobby.roomCode, 'Idle');
    expect((await call('POST', `/api/rooms/${lobby.sessionId}/settings`, { sideGames: false }, lobby.host)).statusCode).toBe(200);
    expect((await call('GET', `/api/rooms/${lobby.sessionId}`, undefined, player)).json().data.settings.sideGames).toBe(false);
    const off = await call('POST', `/api/rooms/${lobby.sessionId}/side/slots`, { roundId: randomUUID(), bet: 10 }, player);
    expect(off.json().error.code).toBe('SIDE_GAMES_OFF');
    // The host and the shared screen do not play.
    expect((await call('GET', `/api/rooms/${lobby.sessionId}/side`, undefined, lobby.host)).statusCode).toBe(403);
  });
});
