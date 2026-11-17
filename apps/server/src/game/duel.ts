import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { placePoints, SubmissionValueSchema, type HeadToHeadMove } from '@party/contracts';
import type { StageRun } from '../generated/prisma/client.js';
import type { StageDefinition } from './definition.js';
import { GameError, requireGame } from './errors.js';
import type { Award } from './teams/teams.js';
import type { Transaction } from './model.js';
import { IllegalMove, type Seat } from '../head-to-head/engine.js';
import { matchOutcome, MatchStateSchema, matchView, playMove, resignMatch, startMatch, type MatchState } from '../head-to-head/match.js';

// A duel: two players face off while everyone else bets on the winner. How it is
// won is the scene's contest: the host names the winner (a real-life contest:
// rock paper scissors at the table, a game of pool, anything), or a head-to-head
// game from the registry (../head-to-head) that the two play on their phones once
// betting has closed. Naming the winner, by the host or by the game, pays the
// winner (and the loser, when 2nd place has points) and every right bet, and
// shows the result. Who duels, the match and the winner live in the stage run's
// presentation, so a restart changes nothing; bets are submissions, one per player.
export type DuelStage = Extract<StageDefinition, { kind: 'duel' }>;
const DuelStateSchema = z.object({ a: z.uuid().nullable(), b: z.uuid().nullable(), winnerId: z.uuid().nullable(), match: MatchStateSchema.nullable().optional() }).strict();
export type DuelState = z.infer<typeof DuelStateSchema>;

export const duelRules = (stage: DuelStage) => ({ placesMilli: stage.places ? placePoints(stage.places) : ['10000'], betMilli: stage.betMilli, pick: stage.pick, contest: stage.contest ?? { kind: 'host' as const } });
export function readDuel(presentation: unknown): DuelState | null {
  const parsed = DuelStateSchema.safeParse((presentation as { duel?: unknown } | null)?.duel);
  return parsed.success ? parsed.data : null;
}
export const duelists = (duel: DuelState | null): [string, string] | null => duel?.a && duel.b ? [duel.a, duel.b] : null;
/** A fresh match for the pair when the duel is played as a game. */
function matchFor(stage: DuelStage): MatchState | null {
  const contest = duelRules(stage).contest;
  if (contest.kind !== 'game') return null;
  const match = startMatch(contest.game, contest.settings); requireGame(match, 'INVALID_DEFINITION');
  return match;
}

/** As the scene opens: a random pair (when the scene says so and there are two players), else the host picks. Everyone else bets. */
export function openDuel(stage: DuelStage, playerIds: string[]): { duel: DuelState; eligible: string[]; timed: boolean } {
  if (stage.pick !== 'random' || playerIds.length < 2) return { duel: { a: null, b: null, winnerId: null, match: null }, eligible: [], timed: false };
  const first = playerIds[randomInt(playerIds.length)]!;
  const rest = playerIds.filter(id => id !== first); const second = rest[randomInt(rest.length)]!;
  return { duel: { a: first, b: second, winnerId: null, match: matchFor(stage) }, eligible: playerIds.filter(id => id !== first && id !== second), timed: true };
}

/** The host picks (or changes) the pair: only before anyone has bet and before a winner, and only players in the room. */
export async function pickDuelists(tx: Transaction, stage: StageRun, definition: DuelStage, playerIds: [string, string], present: string[]): Promise<{ duel: DuelState; eligible: string[] }> {
  const duel = readDuel(stage.presentation); requireGame(duel && !duel.winnerId && stage.status === 'ACTIVE', 'INVALID_STATE');
  const [a, b] = playerIds;
  requireGame(a !== b && present.includes(a) && present.includes(b), 'INELIGIBLE');
  requireGame(await tx.submission.count({ where: { stageRunId: stage.id, slotKey: 'answer' } }) === 0, 'ALREADY_SUBMITTED');
  return { duel: { a, b, winnerId: null, match: matchFor(definition) }, eligible: present.filter(id => id !== a && id !== b) };
}

/** A bet names one of the two duelists; duelists themselves are not eligible to bet. */
export function checkBet(stage: StageRun, playerId: string): void {
  const pair = duelists(readDuel(stage.presentation));
  requireGame(pair && pair.includes(playerId), 'INVALID_SUBMISSION');
}

/** The winner is named (by the host, or by the game): the places and every right bet, paid once. */
export async function decideDuel(tx: Transaction, stage: StageRun, definition: DuelStage, winnerId: string, duel: DuelState | null = readDuel(stage.presentation)): Promise<{ duel: DuelState; awards: Award[] }> {
  const pair = duelists(duel);
  requireGame(duel && pair, 'INVALID_STATE');
  if (duel.winnerId) throw new GameError('ALREADY_DECIDED');
  requireGame(pair.includes(winnerId), 'INVALID_COMMAND');
  const loserId = pair.find(id => id !== winnerId)!;
  const rules = duelRules(definition);
  const place = (playerId: string, index: number, reason: string): Award[] => { const amount = BigInt(rules.placesMilli[index] ?? '0'); return amount ? [{ playerId, amountMilli: amount, stageRunId: stage.id, awardKey: `duel:${stage.id}:${index === 0 ? 'winner' : 'loser'}`, reason }] : []; };
  const bets = await tx.submission.findMany({ where: { stageRunId: stage.id, slotKey: 'answer' }, select: { id: true, playerId: true, value: true } });
  const right = bets.filter(bet => { const value = SubmissionValueSchema.safeParse(bet.value); return bet.playerId && value.success && value.data.kind === 'bet' && value.data.playerId === winnerId; });
  const betAmount = BigInt(rules.betMilli);
  return { duel: { ...duel, winnerId }, awards: [
    ...place(winnerId, 0, 'Won the duel'), ...place(loserId, 1, 'Second in the duel'),
    ...(betAmount ? right.map(bet => ({ playerId: bet.playerId!, amountMilli: betAmount, stageRunId: stage.id, awardKey: `duel:${stage.id}:bet:${bet.id}`, reason: 'Bet on the winner' })) : []),
  ] };
}

/**
 * A duelist's move (or resignation) in a game contest: allowed once betting has
 * closed and until there is a winner. Returns the new state and, when the game
 * has a winner, who it is; a draw leaves the winner to the host.
 */
export function duelPlay(stage: StageRun, playerId: string, action: { move: HeadToHeadMove } | { resign: true }): { duel: DuelState; winnerId: string | null } {
  const duel = readDuel(stage.presentation); const pair = duelists(duel);
  requireGame(duel && pair && duel.match && !duel.winnerId && stage.status === 'CLOSED', 'INVALID_STATE');
  const seat = pair.indexOf(playerId); requireGame(seat === 0 || seat === 1, 'INELIGIBLE');
  let match: MatchState;
  try { match = 'resign' in action ? resignMatch(duel.match, seat as Seat) : playMove(duel.match, seat as Seat, action.move); }
  catch (error) { if (error instanceof IllegalMove) throw new GameError('INVALID_SUBMISSION'); throw error; }
  const outcome = matchOutcome(match);
  return { duel: { ...duel, match }, winnerId: outcome?.kind === 'win' ? pair[outcome.seat] : null };
}

/** What screens see: the pair, the bets on each (live), the points at stake, the contest (with the board as this viewer sees it) and the winner. */
export async function duelView(tx: Transaction, stage: StageRun, definition: DuelStage, viewer: string | null) {
  const duel = readDuel(stage.presentation); const pair = duelists(duel); const rules = duelRules(definition);
  const bets = pair ? await tx.submission.findMany({ where: { stageRunId: stage.id, slotKey: 'answer' }, select: { value: true } }) : [];
  const count = (playerId: string) => bets.filter(bet => { const value = SubmissionValueSchema.safeParse(bet.value); return value.success && value.data.kind === 'bet' && value.data.playerId === playerId; }).length;
  const seat = pair && viewer ? pair.indexOf(viewer) : -1;
  const contest = rules.contest.kind === 'game' ? { kind: 'game' as const, game: rules.contest.game, view: duel?.match ? matchView(duel.match, seat === 0 || seat === 1 ? seat : null) : null } : { kind: 'host' as const };
  return { duelistIds: pair, pick: rules.pick, bets: pair ? pair.map(playerId => ({ playerId, count: count(playerId) })) : [], placesMilli: rules.placesMilli, betMilli: rules.betMilli, winnerId: duel?.winnerId ?? null, contest };
}
