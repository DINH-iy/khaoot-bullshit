import type { Transaction } from '../game/model.js';
import type { GameDefinition } from '../game/definition.js';
import { locateStage } from '../game/graph.js';
import { readRoomState } from '../rooms/reclaim.js';
import { readEconomy } from './economy.js';
import { entryFor, lockWallet, startWallet, type Seat } from './wallet.js';

// Earning chips by playing (the owner's economy setting, economy.ts). Chips are a ledger (wallet.ts); earned chips are entries
// with reason EARNED and what they were for in `game`. The database pays each kind once per seat per room
// (a unique index), so a retried or repeated finish pays nothing more.

type Kind = 'points' | 'place' | 'wins' | 'arcade';
async function pay(tx: Transaction, seat: Seat, kind: Kind, amount: number) {
  if (amount <= 0) return;
  await lockWallet(tx, seat); await startWallet(tx, seat);
  await tx.chipEntry.createMany({ data: [{ ...entryFor(seat), reason: 'EARNED', game: kind, amount }], skipDuplicates: true });
}

/**
 * A game just ended: each seat (rooms with chips on) earns chips per point, a place bonus (1st, 2nd, 3rd by
 * points, ties share; everyone else a little for playing) and a bonus per minigame or duel round won (most points
 * in that round, ties share). Call in the transaction that finishes the game, after its last points are saved.
 */
export async function payGameChips(tx: Transaction, sessionId: string, definition: GameDefinition) {
  const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId }, select: { state: true, players: { where: { leftAt: null }, select: { id: true, personId: true } } } });
  if (!readRoomState(session.state).chips || !session.players.length) return;
  const entries = await tx.scoreEntry.findMany({ where: { sessionId, recipientPlayerId: { not: null } }, select: { recipientPlayerId: true, amountMilli: true, stageRunId: true } });
  const totals = new Map<string, bigint>(); const perStage = new Map<string, Map<string, bigint>>();
  for (const entry of entries) {
    const player = entry.recipientPlayerId!; totals.set(player, (totals.get(player) ?? 0n) + entry.amountMilli);
    if (entry.stageRunId) { const stage = perStage.get(entry.stageRunId) ?? new Map<string, bigint>(); perStage.set(entry.stageRunId, stage); stage.set(player, (stage.get(player) ?? 0n) + entry.amountMilli); }
  }
  // Rounds won: minigame and duel rounds only, the player(s) with the most points in it (more than none).
  const runs = perStage.size ? await tx.stageRun.findMany({ where: { id: { in: [...perStage.keys()] } }, select: { id: true, nodeKey: true, stageKey: true } }) : [];
  const wins = new Map<string, number>();
  for (const run of runs) {
    const kind = locateStage(definition, run.nodeKey, run.stageKey)?.stage.kind;
    if (kind !== 'minigame' && kind !== 'duel') continue;
    const points = perStage.get(run.id)!; const best = [...points.values()].reduce((max, value) => value > max ? value : max, 0n);
    if (best > 0n) for (const [player, value] of points) if (value === best) wins.set(player, (wins.get(player) ?? 0) + 1);
  }
  const { earn: EARN } = await readEconomy(tx);
  for (const player of session.players) {
    const seat: Seat = { id: player.id, sessionId, personId: player.personId };
    const mine = totals.get(player.id) ?? 0n; const place = 1 + [...totals.values()].filter(other => other > mine).length;
    await pay(tx, seat, 'points', Math.floor(Number(mine > 0n ? mine : 0n) / 1000) * EARN.perPoint);
    await pay(tx, seat, 'place', mine > 0n && place <= EARN.place.length ? EARN.place[place - 1]! : EARN.played);
    await pay(tx, seat, 'wins', (wins.get(player.id) ?? 0) * EARN.roundWin);
  }
}

/** An arcade round was won: the winning seats of people with an account earn chips (in the round's own room). */
export async function payArcadeWins(tx: Transaction, sessionId: string, winners: { playerId: string; personId: string | null }[]) {
  const { earn } = await readEconomy(tx);
  for (const winner of winners) if (winner.personId) await pay(tx, { id: winner.playerId, sessionId, personId: winner.personId }, 'arcade', earn.arcadeWin);
}
