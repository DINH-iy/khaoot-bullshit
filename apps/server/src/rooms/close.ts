import type { Transaction } from '../game/model.js';
import { lockRoom, recordRoomChange } from './gateway.js';

// Closing a room from the host menu: it ends as it is, like a finished game. Scores and
// answers are history that is never rewritten or removed; the room only stops being open.

/** Ends the room (any running round is closed first, so no timer tries to end it later). Returns false when it had already ended. */
export async function closeRoom(tx: Transaction, sessionId: string, now = new Date()): Promise<boolean> {
  await lockRoom(tx, sessionId);
  const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (session.status === 'FINISHED') return false;
  await tx.stageRun.updateMany({ where: { sessionId, status: 'ACTIVE' }, data: { status: 'CLOSED', closedAt: now, deadlineAt: null, pausedRemainingMs: null } });
  await tx.gameSession.update({ where: { id: sessionId }, data: { status: 'FINISHED', endedAt: session.endedAt ?? now, currentNodeKey: null, idleCloseAt: null } });
  await recordRoomChange(tx, sessionId, 'room.closed');
  return true;
}
