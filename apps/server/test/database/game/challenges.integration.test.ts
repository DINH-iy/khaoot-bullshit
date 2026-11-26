import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BRICK_MAX_SECONDS, DEFAULT_ECONOMY, MINIGAME_COUNTDOWN_MS } from '@party/contracts';

const START_CHIPS = DEFAULT_ECONOMY.startChips;
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
  it('runs both Brick Rally players on one map and pays the fastest verified clear', async () => {
    const r = await room(); const id = randomUUID();
    const map = ['........', '........', '........', '........', '......#.'];
    const action = (phone: number, name: string, body = {}) => call('POST', `${r.base}/${id}/${name}`, body, r.phones[phone]);
    const clear = (phone: number, brickTrace: string) => action(phone, 'clear', { brickTrace });
    const current = async (phone: number) => (await call('GET', r.base, undefined, r.phones[phone])).json().data.challenges[0];
    const invite = await call('POST', r.base, { challengeId: id, opponentId: r.ids[1], game: 'brick-rally', stake: 50, settings: { map } }, r.phones[0]);
    expect(invite.json().data.view.map).toEqual(map);
    expect((await action(0, 'ready')).statusCode).toBe(409);
    expect((await action(1, 'accept')).json().data.view).toMatchObject({ map, seat: 1, startsAt: null });
    expect((await action(2, 'ready')).statusCode).toBe(404);

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const now = Date.now();
      expect((await action(0, 'ready')).json().data.view).toMatchObject({ ready: [true, false], startsAt: null });
      const { startsAt, deadlineAt } = (await action(1, 'ready')).json().data.view;
      expect(Date.parse(startsAt) - now).toBe(MINIGAME_COUNTDOWN_MS);
      expect(Date.parse(deadlineAt) - Date.parse(startsAt)).toBe(BRICK_MAX_SECONDS * 1000);
      expect((await current(0)).view).toMatchObject({ startsAt, deadlineAt, map });
      expect((await clear(0, 'g'.repeat(56))).statusCode).toBe(400);
      vi.setSystemTime(Date.parse(startsAt) + 2000);
      expect((await action(0, 'ready')).json().data.view.startsAt).toBe(startsAt);
      expect((await clear(0, 'g')).statusCode).toBe(400);
      expect((await clear(0, 'F'.repeat(103))).json().data).toMatchObject({ status: 'PLAYING', view: { times: [1717, null] } });
      expect((await current(1)).view.times).toEqual([null, null]);
      // A repeated submission cannot replace a recorded time.
      expect((await clear(0, 'g'.repeat(56))).json().data.view.times).toEqual([1717, null]);
      expect((await clear(1, 'g'.repeat(56))).json().data).toMatchObject({ status: 'FINISHED', view: { times: [1717, 933], outcome: { kind: 'win', seat: 1 } } });
      await clear(1, 'g'.repeat(56));
      expect(await r.balance(r.phones[0]!)).toBe(START_CHIPS - 50);
      expect(await r.balance(r.phones[1]!)).toBe(START_CHIPS + 50);
    } finally { vi.useRealTimers(); }
  });

  it.each([true, false])('settles an expired Brick Rally once with a verified clear = %s', async (cleared) => {
    const r = await room(); const id = randomUUID();
    const map = ['........', '........', '........', '........', '......#.'];
    const action = (phone: number, name: string, body = {}) => call('POST', `${r.base}/${id}/${name}`, body, r.phones[phone]);
    await call('POST', r.base, { challengeId: id, opponentId: r.ids[1], game: 'brick-rally', stake: 50, settings: { map } }, r.phones[0]);
    await action(1, 'accept');
    await action(0, 'ready');
    const { startsAt, deadlineAt } = (await action(1, 'ready')).json().data.view;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.parse(startsAt) + 2000);
      if (cleared) expect((await action(0, 'clear', { brickTrace: 'g'.repeat(56) })).statusCode).toBe(200);
      vi.setSystemTime(Date.parse(deadlineAt) + 1);
      const results = await Promise.all(r.phones.slice(0, 2).map(phone => call('GET', r.base, undefined, phone)));
      for (const result of results) expect(result.json().data.challenges[0]).toMatchObject({
        status: 'FINISHED', view: { times: [cleared ? 933 : null, null], outcome: cleared ? { kind: 'win', seat: 0 } : { kind: 'draw' } },
      });
      expect(await r.balance(r.phones[0]!)).toBe(START_CHIPS + (cleared ? 50 : 0));
      expect(await r.balance(r.phones[1]!)).toBe(START_CHIPS - (cleared ? 50 : 0));
    } finally { vi.useRealTimers(); }
  });

  it('plays 8-ball with a stake through the existing phone challenge flow', async () => {
    const r = await room(); const id = randomUUID();
    expect((await call('POST', r.base, { challengeId: id, opponentId: r.ids[1], game: 'eight-ball', stake: 50 }, r.phones[0])).statusCode).toBe(200);
    expect((await call('POST', `${r.base}/${id}/accept`, {}, r.phones[1])).statusCode).toBe(200);
    const shoot = { move: { game: 'eight-ball', angle: 0, power: 100, shot: 0 } };
    expect((await call('POST', `${r.base}/${id}/move`, shoot, r.phones[1])).statusCode).toBe(400);
    expect((await call('POST', `${r.base}/${id}/move`, shoot, r.phones[0])).json().data.view.board).toMatchObject({ game: 'eight-ball', shot: 1 });
    expect((await call('POST', `${r.base}/${id}/resign`, {}, r.phones[1])).statusCode).toBe(200);
    expect(await r.balance(r.phones[0]!)).toBe(START_CHIPS + 50);
    expect(await r.balance(r.phones[1]!)).toBe(START_CHIPS - 50);
  });

  it('uses the selected pool settings and starts the shot clock when the opponent accepts', async () => {
    const r = await room(); const id = randomUUID();
    const settings = { felt: 'blue', start: { side: 'random', percent: 35 }, ballBehavior: { preset: 'heavy' }, shotSeconds: 15 };
    const invited = await call('POST', r.base, { challengeId: id, opponentId: r.ids[1], game: 'eight-ball', stake: 0, settings }, r.phones[0]);
    expect(invited.statusCode).toBe(200);
    const incoming = await call('GET', r.base, undefined, r.phones[1]);
    const invitation = incoming.json().data.challenges[0];
    expect(invitation.poolSettings).toEqual(settings);
    expect(['left', 'right']).toContain(invitation.view.board.start.side);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 60_000);
      const accepted = await call('POST', `${r.base}/${id}/accept`, {}, r.phones[1]);
      expect(accepted.statusCode).toBe(200);
      const board = accepted.json().data.view.board;
      expect(board).toMatchObject({ felt: 'blue', start: invitation.view.board.start, ballBehavior: settings.ballBehavior, shotClock: { seconds: 15, leftMs: 15_000 } });
      expect(board.balls).toEqual(invited.json().data.view.board.balls);
      const timeout = await call('POST', `${r.base}/${id}/move`, { move: { game: 'eight-ball', timeout: true, shot: 0 } }, r.phones[1]);
      expect(timeout.statusCode).toBe(400);
    } finally { vi.useRealTimers(); }
  });

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
    expect((await call('POST', `/api/rooms/${r.sessionId}/settings`, { openInvites: 11 }, r.host)).statusCode).not.toBe(200);
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
