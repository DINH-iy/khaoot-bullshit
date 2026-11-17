import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { START_CHIPS } from '@party/contracts';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { cleanUpChallenges } from '../../../src/side-games/challenges.js';
import { db, prisma } from '../game-fixture.js';

// Challenges between players on their phones, with chips at stake, through the real routes.
const ownerToken = 't'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'c'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>; let owner = '';
beforeAll(async () => { app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready(); owner = cookieOf(await call('POST', '/api/host/claim', { token: ownerToken })); });
afterAll(async () => { await app.close(); await db.close(); });
const call = (method: 'GET' | 'POST', url: string, body?: unknown, cookie?: string) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
const cookieOf = (response: Awaited<ReturnType<typeof call>>) => String(response.headers['set-cookie']).split(';')[0]!;

/** A room (the timed quiz, not started) with three guests on their phones. */
async function room() {
  const body = { gameKey: 'timed-quiz', sessionId: randomUUID(), commandId: randomUUID() };
  const opened = await call('POST', '/api/host/rooms', body, owner); expect(opened.statusCode).toBe(200);
  // Chips are off in a new room (challenges are just for fun); these tests are about stakes, so the host switches chips on.
  expect((await call('POST', `/api/rooms/${body.sessionId}/settings`, { chips: true }, cookieOf(opened))).statusCode).toBe(200);
  const { roomCode } = await prisma.gameSession.findUniqueOrThrow({ where: { id: body.sessionId } });
  const phones = [];
  for (const name of ['Ada', 'Bo', 'Cy']) phones.push(cookieOf(await call('POST', '/api/rooms/join', { roomCode, joinId: randomUUID(), displayName: name })));
  const players = await prisma.sessionPlayer.findMany({ where: { sessionId: body.sessionId }, orderBy: { joinedAt: 'asc' } });
  const base = `/api/rooms/${body.sessionId}/side/challenges`;
  const balance = async (phone: string) => (await call('GET', base, undefined, phone)).json().data.balance as number;
  return { sessionId: body.sessionId, host: cookieOf(opened), phones, ids: players.map(player => player.id), base, balance };
}
const move = (r: Awaited<ReturnType<typeof room>>, phone: number, id: string, cell: number) => call('POST', `${r.base}/${id}/move`, { move: { game: 'tictactoe', cell } }, r.phones[phone]);

describe('challenges between players', () => {
  it('take both stakes when accepted and give the winner both', async () => {
    const r = await room(); const id = randomUUID();
    const invite = await call('POST', r.base, { challengeId: id, opponentId: r.ids[1], game: 'tictactoe', stake: 100 }, r.phones[0]);
    expect(invite.statusCode).toBe(200); expect(invite.json().data).toMatchObject({ status: 'INVITED', mine: 'challenger' });
    // A repeated tap is the same challenge; a second one to the same player is refused.
    expect((await call('POST', r.base, { challengeId: id, opponentId: r.ids[1], game: 'tictactoe', stake: 100 }, r.phones[0])).statusCode).toBe(200);
    expect((await call('POST', r.base, { challengeId: randomUUID(), opponentId: r.ids[1], game: 'chess', stake: 0 }, r.phones[0])).statusCode).toBe(409);
    // Only the opponent accepts; nobody else sees or touches it.
    expect((await call('POST', `${r.base}/${id}/accept`, {}, r.phones[0])).statusCode).toBe(409);
    expect((await call('POST', `${r.base}/${id}/accept`, {}, r.phones[2])).statusCode).toBe(404);
    expect((await call('GET', r.base, undefined, r.phones[2])).json().data.challenges).toEqual([]);
    expect((await call('POST', `${r.base}/${id}/accept`, {}, r.phones[1])).json().data.status).toBe('PLAYING');
    expect(await r.balance(r.phones[0]!)).toBe(START_CHIPS - 100); expect(await r.balance(r.phones[1]!)).toBe(START_CHIPS - 100);
    expect((await move(r, 1, id, 4)).statusCode).toBe(400);
    for (const [phone, cell] of [[0, 0], [1, 3], [0, 1], [1, 4]] as const) expect((await move(r, phone, id, cell)).statusCode).toBe(200);
    const won = await move(r, 0, id, 2);
    expect(won.json().data).toMatchObject({ status: 'FINISHED', view: { outcome: { kind: 'win', seat: 0 }, replay: { game: 'tictactoe', moves: [0, 3, 1, 4, 2] } } });
    expect(await r.balance(r.phones[0]!)).toBe(START_CHIPS + 100); expect(await r.balance(r.phones[1]!)).toBe(START_CHIPS - 100);
    expect((await move(r, 1, id, 5)).statusCode).toBe(409);
  });

  it('give both stakes back on a draw, and refuse a stake someone cannot pay', async () => {
    const r = await room();
    expect((await call('POST', r.base, { challengeId: randomUUID(), opponentId: r.ids[1], game: 'tictactoe', stake: START_CHIPS + 1 }, r.phones[0])).statusCode).toBe(409);
    const id = randomUUID();
    await call('POST', r.base, { challengeId: id, opponentId: r.ids[1], game: 'tictactoe', stake: 50 }, r.phones[0]);
    await call('POST', `${r.base}/${id}/accept`, {}, r.phones[1]);
    for (const [index, cell] of [0, 1, 2, 4, 3, 5, 7, 6, 8].entries()) await move(r, index % 2, id, cell);
    expect((await call('GET', r.base, undefined, r.phones[0])).json().data.challenges[0]).toMatchObject({ status: 'FINISHED', view: { outcome: { kind: 'draw' } } });
    expect(await r.balance(r.phones[0]!)).toBe(START_CHIPS); expect(await r.balance(r.phones[1]!)).toBe(START_CHIPS);
  });

  it('can be declined or taken back before it starts, and resigned once playing', async () => {
    const r = await room(); const declined = randomUUID(); const playing = randomUUID();
    await call('POST', r.base, { challengeId: declined, opponentId: r.ids[2], game: 'rps', stake: 0 }, r.phones[0]);
    expect((await call('POST', `${r.base}/${declined}/close`, {}, r.phones[2])).json().data.status).toBe('DECLINED');
    await call('POST', r.base, { challengeId: playing, opponentId: r.ids[1], game: 'chess', stake: 10 }, r.phones[0]);
    await call('POST', `${r.base}/${playing}/accept`, {}, r.phones[1]);
    expect((await call('POST', `${r.base}/${playing}/move`, { move: { game: 'chess', from: 'e2', to: 'e5' } }, r.phones[0])).statusCode).toBe(400);
    expect((await call('POST', `${r.base}/${playing}/move`, { move: { game: 'chess', from: 'e2', to: 'e4' } }, r.phones[0])).statusCode).toBe(200);
    expect((await call('POST', `${r.base}/${playing}/resign`, {}, r.phones[1])).json().data).toMatchObject({ status: 'FINISHED', view: { outcome: { kind: 'win', seat: 0, reason: 'resigned' } } });
    expect(await r.balance(r.phones[0]!)).toBe(START_CHIPS + 10);
  });

  it('wait for an answer only as many at once as the host allows (3 unless changed)', async () => {
    const r = await room();
    const invite = (to: number) => call('POST', r.base, { challengeId: randomUUID(), opponentId: r.ids[to], game: 'rps', stake: 0 }, r.phones[0]);
    expect((await call('POST', `/api/rooms/${r.sessionId}/settings`, { openInvites: 1 }, r.host)).statusCode).toBe(200);
    expect((await invite(1)).statusCode).toBe(200);
    const refused = await invite(2);
    expect(refused.statusCode).not.toBe(200); expect(JSON.stringify(refused.json())).toContain('RATE_LIMITED');
    // Players cannot change it; the host can, within 1 to 10.
    expect((await call('POST', `/api/rooms/${r.sessionId}/settings`, { openInvites: 5 }, r.phones[0])).statusCode).not.toBe(200);
    expect((await call('POST', `/api/rooms/${r.sessionId}/settings`, { openInvites: 11 }, r.host)).statusCode).toBe(400);
    expect((await call('POST', `/api/rooms/${r.sessionId}/settings`, { openInvites: 2 }, r.host)).statusCode).toBe(200);
    expect((await invite(2)).statusCode).toBe(200);
  });

  it('are deleted with the room once it is over, returning any stake still in a game', async () => {
    const r = await room(); const id = randomUUID();
    await call('POST', r.base, { challengeId: id, opponentId: r.ids[1], game: 'tictactoe', stake: 30 }, r.phones[0]);
    await call('POST', `${r.base}/${id}/accept`, {}, r.phones[1]);
    await prisma.gameSession.update({ where: { id: r.sessionId }, data: { status: 'FINISHED', endedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    expect(await cleanUpChallenges(prisma, new Date())).toBeGreaterThanOrEqual(1);
    expect(await prisma.sideChallenge.count({ where: { sessionId: r.sessionId } })).toBe(0);
    const totals = await prisma.chipEntry.groupBy({ by: ['playerId'], where: { sessionId: r.sessionId }, _sum: { amount: true } });
    expect(totals.filter(row => r.ids.slice(0, 2).includes(row.playerId)).map(row => row._sum.amount)).toEqual([START_CHIPS, START_CHIPS]);
  });
});
