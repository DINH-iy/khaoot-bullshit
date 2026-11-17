import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Transaction } from '../game/model.js';
import { lockRoom, recordRoomChange, type Principal } from './gateway.js';
import { readRoomState, type RoomState } from './reclaim.js';
import { joinToken, newToken, roomAssert, tokenHash } from './security.js';

// "Back to the lobby": the host starts the same game again in a fresh room. Scores and
// answers are history that is never rewritten, so the old room ends as it is (with a
// pointer to the next one) and everyone moves over: phones keep their name, look and
// personal account, the shared screen keeps showing the room.

/** Host settings that carry over to the next room (not breaks, seat requests or the pointer itself). */
const CARRIED = ['reclaimApproval', 'showScores', 'reactions', 'autoClose', 'autoCloseSeconds', 'breakVotes', 'breakPercent', 'reactionLimit', 'reactionChoices', 'sideGames', 'chips', 'quickTimeSeconds', 'confirmLooks'] as const;

/**
 * Ends `fromId` and points it at `toId`, which was just opened for the same game. Any running round is
 * closed first so no timer tries to end it later. Returns false when the room already moved on.
 */
export async function linkNextRoom(tx: Transaction, fromId: string, toId: string, now = new Date()): Promise<boolean> {
  await lockRoom(tx, fromId);
  const from = await tx.gameSession.findUniqueOrThrow({ where: { id: fromId } });
  const state = readRoomState(from.state);
  if (state.nextRoom) return false;
  await tx.stageRun.updateMany({ where: { sessionId: fromId, status: 'ACTIVE' }, data: { status: 'CLOSED', closedAt: now, deadlineAt: null, pausedRemainingMs: null } });
  await tx.gameSession.update({ where: { id: fromId }, data: { status: 'FINISHED', endedAt: from.endedAt ?? now, currentNodeKey: null, state: { ...state, nextRoom: toId, breakStartedAt: null, breakVoters: [] } } });
  // The new room takes the host's settings of the old one.
  const to = await tx.gameSession.findUniqueOrThrow({ where: { id: toId } });
  const carried = Object.fromEntries(CARRIED.map(key => [key, state[key]])) as Partial<RoomState>;
  await tx.gameSession.update({ where: { id: toId }, data: { state: { ...readRoomState(to.state), ...carried } } });
  await recordRoomChange(tx, fromId, 'room.restarted');
  return true;
}

/**
 * A phone or shared screen of the old room moves into the next one. A player gets a seat there with
 * the same name, look and person; doing it twice gives the same seat. Returns the access to set.
 */
export async function followRoom(client: PrismaClient, config: Config, principal: Principal): Promise<{ sessionId: string; token: string; expiresAt: Date; display: boolean }> {
  roomAssert(config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE'); const secret = config.ROOM_TOKEN_SECRET;
  const from = await client.gameSession.findUniqueOrThrow({ where: { id: principal.sessionId }, select: { state: true } });
  const toId = readRoomState(from.state).nextRoom; roomAssert(toId, 'ROOM_NOT_AVAILABLE');
  return client.$transaction(async tx => {
    await lockRoom(tx, toId);
    const to = await tx.gameSession.findUniqueOrThrow({ where: { id: toId } });
    roomAssert(to.status !== 'FINISHED', 'ROOM_NOT_AVAILABLE');
    if (principal.actor.role === 'display') {
      // The shared screen stays valid as long as its access to the old room was.
      const token = newToken();
      await tx.roomCredential.create({ data: { sessionId: toId, role: 'DISPLAY', source: principal.source, tokenHash: tokenHash(token), expiresAt: principal.expiresAt } });
      return { sessionId: toId, token, expiresAt: principal.expiresAt, display: true };
    }
    roomAssert(principal.actor.role === 'player', 'FORBIDDEN');
    const old = await tx.sessionPlayer.findUniqueOrThrow({ where: { id: principal.actor.playerId } });
    // The same key each time: following twice (two tabs, a retry) continues the same seat.
    const key = `follow:${old.id}`; const token = joinToken(secret, toId, key);
    const seat = (old.personId ? await tx.sessionPlayer.findUnique({ where: { sessionId_personId: { sessionId: toId, personId: old.personId } } }) : null)
      ?? await tx.sessionPlayer.findUnique({ where: { joinKeyHash: tokenHash(`${toId}:${key}`) } })
      ?? await tx.sessionPlayer.create({ data: { sessionId: toId, displayName: old.displayName, personId: old.personId, joinKeyHash: tokenHash(`${toId}:${key}`), ...(old.look === null ? {} : { look: old.look as object }) } });
    roomAssert(!seat.leftAt, 'SEAT_DENIED');
    const existing = await tx.playerCredential.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (existing) return { sessionId: toId, token, expiresAt: existing.expiresAt, display: false };
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
    await tx.playerCredential.create({ data: { sessionId: toId, playerId: seat.id, tokenHash: tokenHash(token), expiresAt } });
    await recordRoomChange(tx, toId, 'player.joined');
    return { sessionId: toId, token, expiresAt, display: false };
  });
}
