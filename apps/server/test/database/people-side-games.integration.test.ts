import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACK_PRICE, START_CHIPS } from '@party/contracts';
import { buildApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { createGameService } from '../../src/game/service.js';
import { db, prisma } from './game-fixture.js';

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
async function openRoom() {
  const body = { gameKey: 'timed-quiz', sessionId: randomUUID(), commandId: randomUUID() };
  const opened = await call('POST', '/api/host/rooms', body, await ownerCookie()); expect(opened.statusCode).toBe(200);
  const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: body.sessionId } });
  return { sessionId: body.sessionId, roomCode: session.roomCode!, host: cookieOf(opened) };
}
async function join(roomCode: string, displayName: string, personCookie?: string) {
  const joined = await call('POST', '/api/rooms/join', { roomCode, joinId: randomUUID(), displayName }, personCookie); expect(joined.statusCode).toBe(200);
  return cookieOf(joined);
}
async function makePerson(name: string) {
  const made = await call('POST', '/api/host/people', { name }, await ownerCookie()); expect(made.statusCode).toBe(200);
  const claimed = await call('POST', '/api/people/claim', { token: made.json().data.token }); expect(claimed.statusCode).toBe(200);
  return { id: made.json().data.id as string, token: made.json().data.token as string, cookie: cookieOf(claimed) };
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
    // A new link replaces the old one.
    const relinked = await call('POST', `/api/host/people/${person.id}/link`, {}, await ownerCookie());
    expect((await call('POST', '/api/people/claim', { token: person.token })).statusCode).toBe(401);
    expect((await call('POST', '/api/people/claim', { token: relinked.json().data.token })).statusCode).toBe(200);
    // Removing frees the name and stops the link.
    expect((await call('POST', `/api/host/people/${person.id}/remove`, {}, await ownerCookie())).statusCode).toBe(200);
    expect((await call('POST', '/api/people/claim', { token: relinked.json().data.token })).statusCode).toBe(401);
    expect((await call('POST', '/api/host/people', { name }, await ownerCookie())).statusCode).toBe(200);
  });
});

describe('side games and chips', () => {
  it('keeps a person’s chips across games, and a guest’s for one room only', async () => {
    const person = await makePerson(`Lucky ${randomUUID().slice(0, 6)}`);
    const roomA = await openRoom();
    const phone = await join(roomA.roomCode, 'x', person.cookie);
    const guest = await join(roomA.roomCode, 'Guest');
    const wallet = await call('GET', `/api/rooms/${roomA.sessionId}/side`, undefined, phone);
    expect(wallet.json().data).toMatchObject({ enabled: true, paused: false, account: 'person', balance: START_CHIPS });
    const pack = await call('POST', `/api/rooms/${roomA.sessionId}/side/packs`, { roundId: randomUUID() }, phone);
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

    // Packs never pay chips back: 1000 chips buy exactly ten, however many arrive at once.
    const packer = await join(room.roomCode, 'Packer');
    const tries = await Promise.all(Array.from({ length: 13 }, () => call('POST', `/api/rooms/${room.sessionId}/side/packs`, { roundId: randomUUID() }, packer)));
    expect(tries.filter(reply => reply.statusCode === 200)).toHaveLength(10);
    expect(tries.filter(reply => reply.statusCode === 409).every(reply => reply.json().error.code === 'NOT_ENOUGH_CHIPS')).toBe(true);
    const broke = (await call('GET', `/api/rooms/${room.sessionId}/side`, undefined, packer)).json().data;
    expect(broke).toMatchObject({ balance: 0, canRefill: true });
    expect((await call('POST', `/api/rooms/${room.sessionId}/side/refill`, {}, packer)).json().data.balance).toBe(500);
    expect((await call('POST', `/api/rooms/${room.sessionId}/side/refill`, {}, packer)).statusCode).toBe(400);
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
