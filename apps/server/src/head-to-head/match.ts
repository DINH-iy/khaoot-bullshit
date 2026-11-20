import { z } from 'zod';
import { HeadToHeadKeySchema, parseHeadToHeadSettings, type HeadToHeadKey, type HeadToHeadMove, type HeadToHeadOutcome, type HeadToHeadView } from '@party/contracts';
import { illegal, type HeadToHeadRules, type Seat } from './engine.js';
import { rps } from './rps.js';
import { tictactoe } from './tictactoe.js';
import { creatureDuel } from './creature-duel.js';
import { chess } from './chess.js';

// The registry of head-to-head games. To add a game: its entry in the contracts
// (head-to-head.ts), a rules module like ./rps.ts, one line here, and its board
// on the phone. Duels and challenges pick it up from here.
const RULES: { [K in HeadToHeadKey]: HeadToHeadRules<K, never> } = { rps, tictactoe, chess, 'creature-duel': creatureDuel } as never;
const rulesFor = <K extends HeadToHeadKey>(game: K) => RULES[game] as unknown as HeadToHeadRules<K, unknown>;

/** A match as stored: the game, its settings, the game's own state, and who resigned (if anyone). */
export const MatchStateSchema = z.object({ game: HeadToHeadKeySchema, settings: z.record(z.string(), z.unknown()), data: z.unknown(), resigned: z.union([z.literal(0), z.literal(1)]).nullable() }).strict();
export type MatchState = z.infer<typeof MatchStateSchema>;
export const readMatch = (value: unknown): MatchState | null => { const parsed = MatchStateSchema.safeParse(value); return parsed.success ? parsed.data : null; };

/** A new match, or null when the settings do not fit the game. */
export function startMatch(game: HeadToHeadKey, rawSettings: unknown): MatchState | null {
  const settings = parseHeadToHeadSettings(game, rawSettings);
  return settings ? { game, settings: settings as Record<string, unknown>, data: rulesFor(game).start(settings as never), resigned: null } : null;
}
export function matchOutcome(state: MatchState): HeadToHeadOutcome | null {
  if (state.resigned !== null) return { kind: 'win', seat: state.resigned === 0 ? 1 : 0, reason: 'resigned' };
  return rulesFor(state.game).outcome(state.data);
}
/** One move by one seat; throws IllegalMove when the rules (or the game being over) forbid it. */
export function playMove(state: MatchState, seat: Seat, move: HeadToHeadMove): MatchState {
  illegal(move.game === state.game, 'That move is for another game');
  illegal(!matchOutcome(state), 'The game is over');
  return { ...state, data: rulesFor(state.game).apply(state.data, seat, move as never) };
}
export function resignMatch(state: MatchState, seat: Seat): MatchState {
  illegal(!matchOutcome(state), 'The game is over');
  return { ...state, resigned: seat };
}
/** What one viewer sees: their seat (null for anyone else), whose turn, the result and the board. */
export function matchView(state: MatchState, viewer: Seat | null): HeadToHeadView {
  const outcome = matchOutcome(state); const rules = rulesFor(state.game);
  return { game: state.game, seat: viewer, turn: outcome ? null : rules.turn(state.data), outcome, board: rules.board(state.data, viewer), replay: outcome ? rules.replay(state.data) : null };
}
