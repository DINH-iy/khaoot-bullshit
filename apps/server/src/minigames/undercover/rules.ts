import { z } from 'zod';
import { UNDERCOVER_GUESS_SECONDS, UNDERCOVER_MIN_PLAYERS, UNDERCOVER_PAIRS, UNDERCOVER_ROLES, undercoverGuessMatches, type UndercoverOwn, type UndercoverRole, type UndercoverSettings, type UndercoverView } from '@party/contracts';
import { requireGame } from '../../game/errors.js';

/**
 * Undercover / Mr. White on the server: the deal (words and roles, kept with the round and never sent to
 * screens), and every move as a pure step from one table to the next. The command handler saves the table
 * and, once there is a winner, writes each player's result.
 */
const Id = z.string().uuid();
export const UndercoverTableSchema = z.object({
  words: z.tuple([z.string(), z.string()]), roles: z.record(Id, z.enum(UNDERCOVER_ROLES)), order: z.array(Id),
  out: z.array(z.object({ playerId: Id, round: z.number().int().min(1) }).strict()),
  round: z.number().int().min(1), phase: z.enum(['clues', 'vote', 'guess', 'done']),
  turn: z.number().int().min(0), turnEndsAt: z.string().datetime().nullable(),
  votes: z.record(Id, Id), voteEndsAt: z.string().datetime().nullable(),
  // A re-vote after a tie: only these players can be voted for (absent: an ordinary vote).
  runoff: z.array(Id).min(2).optional(),
  last: z.object({ round: z.number().int().min(1), tally: z.array(z.object({ playerId: Id, count: z.number().int().min(1) }).strict()), outId: Id.nullable() }).strict().nullable(),
  guesserId: Id.nullable(), guessEndsAt: z.string().datetime().nullable(), guess: z.string().max(60).optional(),
  winner: z.enum(['civilians', 'impostors', 'white']).nullable(), tooFew: z.boolean(),
}).strict();
export type UndercoverTable = z.infer<typeof UndercoverTableSchema>;
/** The dealt table kept with the round, if any. */
export const readUndercover = (presentation: unknown): UndercoverTable | null => UndercoverTableSchema.safeParse((presentation as { undercover?: unknown } | null)?.undercover).data ?? null;
type Random = (max: number) => number;

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) { const other = random(index + 1); [copy[index], copy[other]] = [copy[other]!, copy[index]!]; }
  return copy;
}
const at = (now: Date, seconds: number) => new Date(now.getTime() + seconds * 1000).toISOString();

/**
 * Deals the round: a word pair, then roles at random. Mr. White plays from 5 players and never speaks first
 * (they have no word to start from). Undercover players are fewer than the civilians, so there is a game.
 * With fewer than 3 players there is no game: it ends at once without a winner.
 */
export function dealUndercover(settings: UndercoverSettings, playerIds: readonly string[], now: Date, random: Random): UndercoverTable {
  const pairs = settings.pairs?.length ? settings.pairs : UNDERCOVER_PAIRS[settings.wordLanguage ?? 'en'];
  const pair = pairs[random(pairs.length)]!;
  // Half the time the undercover players get the first word of the pair, so a pair's order gives nothing away.
  const words: [string, string] = random(2) === 0 ? [pair[0], pair[1]] : [pair[1], pair[0]];
  const players = shuffle(playerIds, random); const count = players.length;
  const tooFew = count < UNDERCOVER_MIN_PLAYERS;
  // Fewer impostors than civilians at the start: at most (players − 1) / 2, so Mr. White joins from 5 players (next to one undercover).
  const most = Math.floor((count - 1) / 2);
  const white = settings.mrWhite && most >= 2 ? 1 : 0;
  const undercovers = tooFew ? 0 : Math.max(1, Math.min(settings.undercovers, most - white));
  const roles: Record<string, UndercoverRole> = {};
  players.forEach((id, index) => { roles[id] = index < white ? 'white' : index < white + undercovers ? 'undercover' : 'civilian'; });
  const order = shuffle(playerIds, random);
  if (order.length > 1 && roles[order[0]!] === 'white') order.push(order.shift()!);
  return { words, roles, order, out: [], round: 1, phase: tooFew ? 'done' : 'clues', turn: 0, turnEndsAt: tooFew ? null : at(now, settings.turnSeconds),
    votes: {}, voteEndsAt: null, last: null, guesserId: null, guessEndsAt: null, winner: null, tooFew };
}

const isOut = (table: UndercoverTable, id: string) => table.out.some(entry => entry.playerId === id);
export const activeIds = (table: UndercoverTable) => table.order.filter(id => !isOut(table, id));
/** Whose clue it is: the active player at `turn` in the speaking order. */
const speaker = (table: UndercoverTable) => table.phase === 'clues' ? activeIds(table)[table.turn] ?? null : null;

/** The civilians win when every impostor is out; the impostors when they are as many as the civilians left. */
function settle(table: UndercoverTable): UndercoverTable {
  const active = activeIds(table);
  const impostors = active.filter(id => table.roles[id] !== 'civilian').length;
  const winner = impostors === 0 ? 'civilians' : active.length - impostors <= impostors ? 'impostors' : null;
  return winner ? { ...table, phase: 'done', winner, turnEndsAt: null, voteEndsAt: null, guessEndsAt: null } : table;
}
/** The next round: clues again, in the same order, from the first player still in. */
function nextRound({ runoff: _runoff, ...table }: UndercoverTable, settings: UndercoverSettings, now: Date): UndercoverTable {
  return { ...table, round: table.round + 1, phase: 'clues', turn: 0, turnEndsAt: at(now, settings.turnSeconds), votes: {}, voteEndsAt: null, guesserId: null, guessEndsAt: null };
}
function afterClue(table: UndercoverTable, settings: UndercoverSettings, now: Date): UndercoverTable {
  const turn = table.turn + 1;
  if (turn < activeIds(table).length) return { ...table, turn, turnEndsAt: at(now, settings.turnSeconds) };
  return { ...table, turn, turnEndsAt: null, phase: 'vote', votes: {}, voteEndsAt: at(now, settings.voteSeconds) };
}
/**
 * Counts the votes: the one player with the most votes is out, and their role shows. A tie goes to one re-vote
 * between the tied players (everyone still in votes again, for one of them); a tie in the re-vote sends nobody out.
 */
function tally(table: UndercoverTable, settings: UndercoverSettings, now: Date): UndercoverTable {
  const active = new Set(activeIds(table));
  const counts = new Map<string, number>();
  for (const [voter, target] of Object.entries(table.votes)) if (active.has(voter) && active.has(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || table.order.indexOf(a[0]) - table.order.indexOf(b[0]));
  const top = ranked[0]; const outId = top && (ranked[1]?.[1] ?? 0) < top[1] ? top[0] : null;
  const { runoff, ...rest } = table;
  const counted = { ...rest, last: { round: table.round, tally: ranked.map(([playerId, count]) => ({ playerId, count })), outId }, voteEndsAt: null };
  const tied = top ? ranked.filter(([, count]) => count === top[1]).map(([playerId]) => playerId) : [];
  if (!outId && !runoff && tied.length >= 2) return { ...counted, votes: {}, runoff: tied, voteEndsAt: at(now, settings.voteSeconds) };
  if (!outId) return nextRound(counted, settings, now);
  const out = { ...counted, out: [...counted.out, { playerId: outId, round: table.round }] };
  // A voted-out Mr. White first gets to guess the word.
  if (table.roles[outId] === 'white') return { ...out, phase: 'guess', guesserId: outId, guessEndsAt: at(now, UNDERCOVER_GUESS_SECONDS) };
  const settled = settle(out);
  return settled.phase === 'done' ? settled : nextRound(settled, settings, now);
}
function afterGuess(table: UndercoverTable, settings: UndercoverSettings, now: Date, guess?: string): UndercoverTable {
  const civilians = table.words[0];
  const guessed = { ...table, guesserId: null, guessEndsAt: null, ...(guess ? { guess } : {}) };
  if (guess && undercoverGuessMatches(guess, civilians)) return { ...guessed, phase: 'done', winner: 'white', turnEndsAt: null, voteEndsAt: null };
  const settled = settle(guessed);
  return settled.phase === 'done' ? settled : nextRound(settled, settings, now);
}

export type UndercoverAction = { action: 'clued' | 'vote' | 'guess' | 'next'; round: number; playerId?: string | undefined; guess?: string | undefined };
/**
 * One move. `actor` is the player (or null for the host). `round` binds the move to the round the phone
 * saw, so a late tap never acts on the next round. Moving on (`next`) is the host's at any time, and
 * anyone's once the time of the clue, vote or guess is up, so nobody can stall the game.
 */
export function undercoverMove(table: UndercoverTable, settings: UndercoverSettings, move: UndercoverAction, actor: string | null, now: Date): UndercoverTable {
  requireGame(table.phase !== 'done' && move.round === table.round, 'INVALID_STATE');
  const time = now.getTime(); const due = (iso: string | null) => iso !== null && Date.parse(iso) <= time;
  if (move.action === 'next') {
    if (table.phase === 'clues') { requireGame(actor === null || due(table.turnEndsAt), 'INVALID_STATE'); return afterClue(table, settings, now); }
    if (table.phase === 'vote') { requireGame(actor === null || due(table.voteEndsAt), 'INVALID_STATE'); return tally(table, settings, now); }
    requireGame(actor === null || due(table.guessEndsAt), 'INVALID_STATE'); return afterGuess(table, settings, now);
  }
  requireGame(actor !== null, 'FORBIDDEN');
  if (move.action === 'clued') {
    requireGame(table.phase === 'clues' && speaker(table) === actor, 'INELIGIBLE');
    return afterClue(table, settings, now);
  }
  if (move.action === 'vote') {
    const active = activeIds(table);
    requireGame(table.phase === 'vote' && active.includes(actor!), 'INELIGIBLE');
    requireGame(move.playerId && move.playerId !== actor && active.includes(move.playerId) && (!table.runoff || table.runoff.includes(move.playerId)), 'INVALID_SUBMISSION');
    const voted = { ...table, votes: { ...table.votes, [actor!]: move.playerId! } };
    // Everyone still in has voted: count at once.
    return active.every(id => voted.votes[id]) ? tally(voted, settings, now) : voted;
  }
  requireGame(table.phase === 'guess' && table.guesserId === actor && move.guess, 'INELIGIBLE');
  return afterGuess(table, settings, now, move.guess);
}

/** The winners' player IDs once done: the civilians, the impostors (undercover and Mr. White), or Mr. White alone. */
export function undercoverWinners(table: UndercoverTable): Set<string> {
  const ids = Object.keys(table.roles);
  if (table.winner === 'civilians') return new Set(ids.filter(id => table.roles[id] === 'civilian'));
  if (table.winner === 'impostors') return new Set(ids.filter(id => table.roles[id] !== 'civilian'));
  if (table.winner === 'white') return new Set(ids.filter(id => table.roles[id] === 'white'));
  return new Set();
}

/** What every screen may see: never a word, nor the role of a player still in. */
export function undercoverView(table: UndercoverTable): UndercoverView {
  return { order: table.order, out: table.out.map(entry => ({ ...entry, role: table.roles[entry.playerId]! })), round: table.round, phase: table.phase,
    speakerId: speaker(table), turnEndsAt: table.turnEndsAt, voters: table.phase === 'vote' ? Object.keys(table.votes).filter(id => activeIds(table).includes(id)) : [],
    voteEndsAt: table.voteEndsAt, ...(table.runoff ? { runoff: table.runoff } : {}), last: table.last, guesserId: table.guesserId, guessEndsAt: table.guessEndsAt, winner: table.winner, tooFew: table.tooFew };
}
/** What one player's phone gets: their own word (none for Mr. White) and their vote this round. */
export function undercoverOwn(table: UndercoverTable, playerId: string): UndercoverOwn | null {
  const role = table.roles[playerId]; if (!role) return null;
  return { word: role === 'white' ? null : table.words[role === 'civilian' ? 0 : 1], vote: table.phase === 'vote' ? table.votes[playerId] ?? null : null };
}
