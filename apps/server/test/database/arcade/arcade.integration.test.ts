import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { createGameService } from '../../../src/game/service.js';
import { createLobbies, QUIET_MS } from '../../../src/arcade/lobbies.js';
import { createRounds } from '../../../src/arcade/rounds.js';
import { newToken, tokenHash } from '../../../src/rooms/security.js';
import { db, prisma } from '../game-fixture.js';

const settings = { NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'c'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173' };
const config = readConfig(settings);
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.listen({ host: '127.0.0.1', port: 0 }); });
afterAll(async () => { await app.close(); await db.close(); });
const call = (method: 'GET' | 'POST', url: string, body?: unknown, cookie?: string) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
const cookieOf = (response: Awaited<ReturnType<typeof call>>) => String(response.headers['set-cookie']).split(';')[0]!;
const code = (response: Awaited<ReturnType<typeof call>>) => response.json().error?.code;

/** A lobby opened by a guest; returns the lobby and the creator's member cookie. */
async function open(name = 'Ann') {
  const lobbyId = randomUUID();
  const created = await call('POST', '/api/arcade', { lobbyId, displayName: name });
  expect(created.statusCode).toBe(200);
  return { lobbyId, leader: cookieOf(created) };
}
async function join(lobbyId: string, name: string, cookie?: string) { return call('POST', `/api/arcade/lobbies/${lobbyId}/join`, { displayName: name }, cookie); }
const view = async (lobbyId: string, cookie?: string) => (await call('GET', `/api/arcade/lobbies/${lobbyId}`, undefined, cookie)).json().data;
async function person(name: string) {
  const token = newToken();
  const created = await prisma.person.create({ data: { name, nameKey: name.toLowerCase(), linkHash: tokenHash(newToken()) } });
  await prisma.personDevice.create({ data: { personId: created.id, tokenHash: tokenHash(token) } });
  return { id: created.id, cookie: `party_person=${token}` };
}

describe('arcade lobbies', () => {
  it('lets anyone open a lobby and join it, and only the leader locks it; members can always come back', async () => {
    const { lobbyId, leader } = await open();
    expect(leader).toMatch(new RegExp(`^party_arcade_${lobbyId.replaceAll('-', '')}=`));
    const bob = cookieOf(await join(lobbyId, 'Bob'));
    expect(await view(lobbyId, leader)).toMatchObject({ title: "Ann's lobby", locked: false, me: { leader: true }, members: [{ displayName: 'Ann', leader: true }, { displayName: 'Bob', leader: false }] });
    expect((await view(lobbyId)).me).toBeNull();
    const listed = (await call('GET', '/api/arcade', undefined, bob)).json().data.lobbies.find((lobby: { id: string }) => lobby.id === lobbyId);
    expect(listed).toMatchObject({ players: 2, leaderName: 'Ann', locked: false, member: true, playing: null });

    // Only the leader locks; a locked lobby turns new people away but not its members.
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/lock`, { locked: true }, bob)).statusCode).toBe(403);
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/lock`, { locked: true }, leader)).statusCode).toBe(200);
    expect(code(await join(lobbyId, 'Cleo'))).toBe('LOBBY_LOCKED');
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/leave`, {}, bob)).statusCode).toBe(200);
    expect((await join(lobbyId, 'Bob', bob)).statusCode).toBe(200);
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/lock`, { locked: false }, leader)).statusCode).toBe(200);
    expect((await join(lobbyId, 'Cleo')).statusCode).toBe(200);
    expect((await view(lobbyId, leader)).members).toHaveLength(3);
  });

  it('requires a password for new members and lets only the current leader change it', async () => {
    const lobbyId = randomUUID();
    const path = `/api/arcade/lobbies/${lobbyId}`;
    const password = 'Friday arcade 42';
    const created = await call('POST', '/api/arcade', { lobbyId, displayName: 'Password leader', title: 'Protected lobby', password });
    expect(created.statusCode).toBe(200);
    const leader = cookieOf(created);
    const stored = await prisma.arcadeLobby.findUniqueOrThrow({ where: { id: lobbyId } });
    expect(stored.passwordHash).toMatch(/^v1:[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(stored.passwordHash).not.toContain(password);
    expect(await view(lobbyId)).toMatchObject({ protected: true, members: [], me: null, lastRound: null });
    const listing = (await call('GET', '/api/arcade')).json().data.lobbies.find((item: { id: string }) => item.id === lobbyId);
    expect(listing).toMatchObject({ protected: true, leaderName: null, member: false });
    expect(JSON.stringify(await view(lobbyId, leader))).not.toContain(stored.passwordHash!);

    const enter = (displayName: string, password?: string, cookie?: string) => call('POST', `${path}/join`, { displayName, ...(password === undefined ? {} : { password }) }, cookie);
    expect(code(await enter('Bo'))).toBe('LOBBY_PASSWORD_REQUIRED');
    expect(code(await enter('Bo', 'wrong'))).toBe('LOBBY_PASSWORD_REQUIRED');
    const admitted = await enter('Bo', password);
    expect(admitted.statusCode).toBe(200);
    const guest = cookieOf(admitted);
    expect((await call('POST', `${path}/password`, { password: null }, guest)).statusCode).toBe(403);
    expect((await call('POST', `${path}/password`, { password: 'new key' }, leader)).statusCode).toBe(200);
    expect(code(await enter('Cy', password))).toBe('LOBBY_PASSWORD_REQUIRED');
    expect((await call('POST', `${path}/leave`, {}, guest)).statusCode).toBe(200);
    expect((await enter('Bo', undefined, guest)).statusCode).toBe(200);
    expect((await call('POST', `${path}/password`, { password: null }, leader)).statusCode).toBe(200);
    expect((await enter('Cy')).statusCode).toBe(200);
  });

  it('hands the lead to the next member present when the leader leaves or goes quiet', async () => {
    const { lobbyId, leader } = await open();
    const bob = cookieOf(await join(lobbyId, 'Bob'));
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/leave`, {}, leader)).statusCode).toBe(200);
    expect((await view(lobbyId, bob)).me).toMatchObject({ leader: true });
    // Ann comes back, but Bob keeps the lead while present; once Bob is gone quiet, Ann (present) takes over.
    expect((await join(lobbyId, 'Ann', leader)).statusCode).toBe(200);
    expect((await view(lobbyId, leader)).me).toMatchObject({ leader: false });
    await prisma.arcadeMember.updateMany({ where: { lobbyId, displayName: 'Bob' }, data: { lastSeenAt: new Date(Date.now() - 60_000) } });
    expect((await view(lobbyId, leader)).me).toMatchObject({ leader: true });
  });

  it('plays a round: every member seated, only the leader runs it, results count once for the lobby and people', async () => {
    const ann = await person(`Ann${randomUUID().slice(0, 8)}`);
    const lobbyId = randomUUID();
    const leader = cookieOf(await call('POST', '/api/arcade', { lobbyId, displayName: 'ignored' }, ann.cookie));
    const bob = cookieOf(await join(lobbyId, 'Bob')); const cleo = cookieOf(await join(lobbyId, 'Cleo'));
    expect((await view(lobbyId, leader)).members[0]).toMatchObject({ displayName: expect.stringMatching(/^Ann/) });

    // Only the leader starts, and a team-only minigame needs teams.
    const roundId = randomUUID();
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/rounds`, { roundId, game: 'majority', teams: null }, bob)).statusCode).toBe(403);
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/rounds`, { roundId, game: 'bus', teams: null }, leader)).statusCode).toBe(400);
    expect(code(await call('POST', `/api/arcade/lobbies/${lobbyId}/rounds`, { roundId, game: 'bus', teams: { count: 4, formation: 'random' } }, leader))).toBe('NOT_ENOUGH_PLAYERS');
    const started = await call('POST', `/api/arcade/lobbies/${lobbyId}/rounds`, { roundId, game: 'majority', teams: null }, leader);
    expect(started.statusCode).toBe(200);
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/rounds`, { roundId, game: 'majority', teams: null }, leader)).json()).toEqual(started.json());
    expect(code(await call('POST', `/api/arcade/lobbies/${lobbyId}/rounds`, { roundId: randomUUID(), game: 'reaction', teams: null }, leader))).toBe('ROUND_ON');
    expect((await view(lobbyId, bob)).round).toMatchObject({ number: 1, game: 'majority', seated: true });

    // Each member enters with their own seat; the room says who leads. The room code is no way in.
    const rooms = await Promise.all([leader, bob, cleo].map(async cookie => { const entered = await call('POST', `/api/arcade/lobbies/${lobbyId}/enter`, {}, cookie); expect(entered.statusCode).toBe(200); return cookieOf(entered); }));
    const leaderSnapshot = (await call('GET', `/api/rooms/${roundId}`, undefined, rooms[0])).json().data;
    expect(leaderSnapshot).toMatchObject({ role: 'player', arcade: { lobbyId, leader: true }, view: { status: 'RUNNING', stage: { kind: 'minigame', explain: { text: null } } } });
    expect((await call('GET', `/api/rooms/${roundId}`, undefined, rooms[1])).json().data.arcade).toEqual({ lobbyId, leader: false });
    expect(leaderSnapshot.players).toHaveLength(3);
    expect(code(await call('POST', '/api/rooms/join', { roomCode: leaderSnapshot.roomCode, displayName: 'Mallory', joinId: randomUUID() }))).toBe('ROOM_NOT_AVAILABLE');
    expect((await call('GET', `/api/rooms/seats/${leaderSnapshot.roomCode}`)).statusCode).toBe(400);
    expect(code(await call('POST', '/api/rooms/reclaim', { roomCode: leaderSnapshot.roomCode, playerId: leaderSnapshot.selfPlayerId, requestId: randomUUID() }))).toBe('ROOM_NOT_AVAILABLE');

    // Only the leader acts, and only on the step they saw.
    const stageRunId = leaderSnapshot.view.stage.id;
    expect((await call('POST', `/api/arcade/rounds/${roundId}/act`, { action: 'start', stageRunId }, rooms[1])).statusCode).toBe(403);
    expect(code(await call('POST', `/api/arcade/rounds/${roundId}/act`, { action: 'start', stageRunId: randomUUID() }, rooms[0]))).toBe('INVALID_STATE');
    expect((await call('POST', `/api/arcade/rounds/${roundId}/act`, { action: 'start', stageRunId }, rooms[0])).statusCode).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 3200));
    const service = createGameService(prisma);
    const seats = await prisma.arcadeSeat.findMany({ where: { roundId }, include: { member: true } });
    const seatOf = (name: RegExp) => seats.find(seat => name.test(seat.member.displayName))!.playerId;
    // Ann and Bob pick left, Cleo right: the majority (Ann and Bob) wins.
    for (const [playerId, option] of [[seatOf(/^Ann/), 'left'], [seatOf(/^Bob$/), 'left'], [seatOf(/^Cleo$/), 'right']] as const) {
      await service.execute({ role: 'player', playerId }, { formatVersion: 1, commandId: randomUUID(), sessionId: roundId, type: 'minigame.move', stageRunId, step: 0, option });
    }
    // Ending closes, reveals and records; ending again records nothing more.
    expect((await call('POST', `/api/arcade/rounds/${roundId}/act`, { action: 'end', stageRunId: null }, rooms[0])).statusCode).toBe(200);
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/round/end`, {}, leader)).statusCode).toBe(409);
    expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: roundId } })).status).toBe('FINISHED');
    expect(await prisma.arcadeResult.count({ where: { roundId } })).toBe(3);
    const after = await view(lobbyId, bob);
    expect(after.round).toBeNull();
    expect(after.lastRound).toMatchObject({ number: 1, game: 'majority' });
    // The history to look back through holds the same round (newest first).
    expect(after.rounds).toEqual([after.lastRound]);
    // After the first round, everyone's running total is that round's points.
    for (const row of after.lastRound!.results) expect(row.totalMilli).toBe(row.pointsMilli);
    expect(after.totals).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayName: 'Bob', pointsMilli: '10000', wins: 1, rounds: 1 }),
      expect.objectContaining({ displayName: 'Cleo', pointsMilli: '0', wins: 0, rounds: 1 })]));
    expect(after.totals[0].pointsMilli).toBe('10000');
    // The all-time board counts people only: Ann, not the guests.
    const board = (await call('GET', '/api/arcade/leaderboard')).json().data;
    expect(board.wins.find((row: { name: string }) => row.name.startsWith('Ann'))).toMatchObject({ wins: 1, rounds: 1, pointsMilli: '10000' });
    expect(board.wins.some((row: { name: string }) => row.name === 'Bob')).toBe(false);

    // A second round: Ann and Cleo win it. The history shows it first, with each player's total so far.
    const second = randomUUID();
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/rounds`, { roundId: second, game: 'majority', teams: null }, leader)).statusCode).toBe(200);
    const again = await Promise.all([leader, bob, cleo].map(async cookie => cookieOf(await call('POST', `/api/arcade/lobbies/${lobbyId}/enter`, {}, cookie))));
    const secondStage = (await call('GET', `/api/rooms/${second}`, undefined, again[0])).json().data.view.stage.id;
    expect((await call('POST', `/api/arcade/rounds/${second}/act`, { action: 'start', stageRunId: secondStage }, again[0])).statusCode).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 3200));
    const secondSeats = await prisma.arcadeSeat.findMany({ where: { roundId: second }, include: { member: true } });
    const secondSeat = (name: RegExp) => secondSeats.find(seat => name.test(seat.member.displayName))!.playerId;
    for (const [playerId, option] of [[secondSeat(/^Ann/), 'right'], [secondSeat(/^Bob$/), 'left'], [secondSeat(/^Cleo$/), 'right']] as const) {
      await service.execute({ role: 'player', playerId }, { formatVersion: 1, commandId: randomUUID(), sessionId: second, type: 'minigame.move', stageRunId: secondStage, step: 0, option });
    }
    expect((await call('POST', `/api/arcade/rounds/${second}/act`, { action: 'end', stageRunId: null }, again[0])).statusCode).toBe(200);
    const later = await view(lobbyId, bob);
    expect(later.rounds.map(round => round.number)).toEqual([2, 1]);
    const totalOf = (round: number, name: RegExp) => later.rounds.find(entry => entry.number === round)!.results.find(row => name.test(row.displayName))!;
    expect(totalOf(2, /^Ann/)).toMatchObject({ pointsMilli: '10000', totalMilli: '20000' });
    expect(totalOf(2, /^Bob$/)).toMatchObject({ pointsMilli: '0', totalMilli: '10000' });
    expect(totalOf(2, /^Cleo$/)).toMatchObject({ pointsMilli: '10000', totalMilli: '10000' });
    // The earlier round keeps the totals as they were then.
    expect(totalOf(1, /^Bob$/)).toMatchObject({ pointsMilli: '10000', totalMilli: '10000' });
  });

  it('requires two duelists and records a drawn duel without a win or points', async () => {
    const { lobbyId, leader } = await open();
    const lobby = `/api/arcade/lobbies/${lobbyId}`;
    const roundId = randomUUID();
    const round = { roundId, game: 'tictactoe', teams: null };
    expect(code(await call('POST', `${lobby}/rounds`, round, leader))).toBe('NOT_ENOUGH_PLAYERS');
    await join(lobbyId, 'Bob');
    expect((await call('POST', `${lobby}/rounds`, round, leader)).statusCode).toBe(200);
    const room = cookieOf(await call('POST', `${lobby}/enter`, {}, leader));
    const snapshot = async () => (await call('GET', `/api/rooms/${roundId}`, undefined, room)).json().data;
    const stage = (await snapshot()).view.stage;
    const pair: [string, string] = stage.duel.duelistIds;
    const act = (action: 'close' | 'end') => call('POST', `/api/arcade/rounds/${roundId}/act`, { action, stageRunId: action === 'close' ? stage.id : null }, room);
    expect((await act('close')).statusCode).toBe(200);

    const service = createGameService(prisma);
    for (const [turn, cell] of [0, 1, 2, 4, 3, 5, 7, 6, 8].entries()) {
      await service.execute({ role: 'player', playerId: pair[turn % 2]! }, {
        formatVersion: 1, type: 'duel.move', commandId: randomUUID(), sessionId: roundId, stageRunId: stage.id, move: { game: 'tictactoe', cell },
      });
    }
    expect((await snapshot()).view.stage).toMatchObject({ revealed: true, duel: { winnerId: null, contest: { view: { outcome: { kind: 'draw' } } } } });
    expect((await act('end')).statusCode).toBe(200);
    const result = (await view(lobbyId, leader)).lastRound;
    expect(result).toMatchObject({ game: 'tictactoe', results: [{ place: null, pointsMilli: '0' }, { place: null, pointsMilli: '0' }] });
  });

  it('plays a team round: teams are made first and the leader confirms them before the minigame', async () => {
    const { lobbyId, leader } = await open();
    const bob = cookieOf(await join(lobbyId, 'Bob'));
    const roundId = randomUUID();
    const started = await call('POST', `/api/arcade/lobbies/${lobbyId}/rounds`, { roundId, game: 'bus', teams: { count: 2, formation: 'random' } }, leader);
    expect(started.json()).toEqual({ ok: true, data: { roundId } });
    const [annRoom, bobRoom] = await Promise.all([leader, bob].map(async cookie => cookieOf(await call('POST', `/api/arcade/lobbies/${lobbyId}/enter`, {}, cookie))));
    const snapshot = (await call('GET', `/api/rooms/${roundId}`, undefined, annRoom)).json().data;
    expect(snapshot).toMatchObject({ arcade: { leader: true }, view: { status: 'RUNNING', stage: { kind: 'minigame', teams: { forming: true, formation: 'random' } } } });
    const stageRunId = snapshot.view.stage.id;
    expect((await call('POST', `/api/arcade/rounds/${roundId}/act`, { action: 'confirm-teams', stageRunId }, bobRoom)).statusCode).toBe(403);
    expect((await call('POST', `/api/arcade/rounds/${roundId}/act`, { action: 'shuffle-teams', stageRunId }, annRoom)).statusCode).toBe(200);
    expect((await call('POST', `/api/arcade/rounds/${roundId}/act`, { action: 'confirm-teams', stageRunId }, annRoom)).statusCode).toBe(200);
    const after = (await call('GET', `/api/rooms/${roundId}`, undefined, bobRoom)).json().data;
    expect(after.view.stage.teams.forming).toBe(false);
    expect(after.view.stage.teams.teams.map((team: { memberIds: string[] }) => team.memberIds.length).sort()).toEqual([1, 1]);
  });

  it('lets the leader end a round from the lobby before anyone played, without results', async () => {
    const { lobbyId, leader } = await open();
    const roundId = randomUUID();
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/rounds`, { roundId, game: 'tap-race', teams: null }, leader)).statusCode).toBe(200);
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/round/end`, {}, leader)).statusCode).toBe(200);
    expect(await prisma.arcadeResult.count({ where: { roundId } })).toBe(0);
    expect((await prisma.arcadeRound.findUniqueOrThrow({ where: { id: roundId } })).endedAt).not.toBeNull();
    // A finished round's room no longer lets anyone in.
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/enter`, {}, leader)).statusCode).toBe(404);
  });

  it('closes a lobby after 15 quiet minutes, ending a round still open there', async () => {
    const { lobbyId, leader } = await open();
    const roundId = randomUUID();
    expect((await call('POST', `/api/arcade/lobbies/${lobbyId}/rounds`, { roundId, game: 'reaction', teams: null }, leader)).statusCode).toBe(200);
    const rounds = createRounds(prisma, config, createGameService(prisma), createLobbies(prisma));
    // Lobbies left by earlier test runs may be swept too; this one is still active and stays open.
    await rounds.sweep();
    expect((await prisma.arcadeLobby.findUniqueOrThrow({ where: { id: lobbyId } })).closedAt).toBeNull();
    await prisma.arcadeLobby.update({ where: { id: lobbyId }, data: { lastActiveAt: new Date(Date.now() - QUIET_MS - 1000) } });
    expect((await call('GET', '/api/arcade')).json().data.lobbies.some((lobby: { id: string }) => lobby.id === lobbyId)).toBe(false);
    expect(await rounds.sweep()).toBeGreaterThanOrEqual(1);
    expect((await prisma.arcadeLobby.findUniqueOrThrow({ where: { id: lobbyId } })).closedAt).not.toBeNull();
    expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: roundId } })).status).toBe('FINISHED');
    expect(code(await join(lobbyId, 'Late'))).toBe('ROOM_NOT_AVAILABLE');
  });

  it('is not available in production', async () => {
    const production = buildApp(readConfig({ ...settings, NODE_ENV: 'production', DATABASE_URL: 'postgresql://party@127.0.0.1/party', PUBLIC_ORIGIN: 'https://party.example', AUTH_ISSUER: 'https://identity.example/', AUTH_AUDIENCE: 'party', AUTH_JWKS_URL: 'https://identity.example/jwks' }), { database: { ...db, close: async () => {} } });
    const response = await production.inject({ method: 'POST', url: '/api/arcade', payload: { lobbyId: randomUUID(), displayName: 'Ann' }, headers: { origin: 'https://party.example', 'x-party-request': '1' } });
    expect(response.statusCode).toBe(503);
    await production.close();
  });
});
