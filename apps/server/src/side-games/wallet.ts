import { START_CHIPS } from '@party/contracts';
import type { Transaction } from '../game/model.js';

/**
 * Chips are an append-only ledger. A wallet is a person's (all their entries,
 * across games) or, for a guest, the seat's in this room. Every change runs in a
 * transaction holding the wallet's lock, so two quick taps cannot spend the
 * same chips twice, and the balance is always the sum of the entries.
 */
export interface Seat { id: string; sessionId: string; personId: string | null }
export const walletWhere = (seat: Seat) => seat.personId ? { personId: seat.personId } : { playerId: seat.id, personId: null };
export const entryFor = (seat: Seat) => ({ sessionId: seat.sessionId, playerId: seat.id, personId: seat.personId });

export async function lockWallet(tx: Transaction, seat: Seat) {
  await tx.$executeRaw`SET LOCAL lock_timeout = '1500ms'`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`chips:${seat.personId ?? seat.id}`}, 0))::text AS locked`;
}
export async function balanceOf(tx: Transaction, seat: Seat) {
  const sum = await tx.chipEntry.aggregate({ where: walletWhere(seat), _sum: { amount: true }, _count: { _all: true } });
  return { balance: sum._sum.amount ?? 0, entries: sum._count._all };
}
/** A wallet's first use gives it the starting chips, once. Call with the lock held. */
export async function startWallet(tx: Transaction, seat: Seat) {
  const { entries } = await balanceOf(tx, seat);
  if (entries === 0) await tx.chipEntry.create({ data: { ...entryFor(seat), reason: 'START', amount: START_CHIPS } });
}
