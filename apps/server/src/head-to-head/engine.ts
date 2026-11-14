import type { HeadToHeadKey, HeadToHeadMove, HeadToHeadOutcome, HeadToHeadReplay, HeadToHeadSettings, HeadToHeadView } from '@party/contracts';

export type Seat = 0 | 1;
/** A move that is not allowed (not your turn, an occupied cell, an illegal chess move…). */
export class IllegalMove extends Error { constructor(message = 'Illegal move') { super(message); this.name = 'IllegalMove'; } }
export function illegal(condition: unknown, message?: string): asserts condition { if (!condition) throw new IllegalMove(message); }

/**
 * One head-to-head game's rules, as pure functions over its own JSON state, so
 * a match can be stored anywhere (a duel scene's run, a challenge row) and
 * replayed after a restart. `apply` gets moves already checked against the
 * game's move schema and throws IllegalMove for anything the rules forbid.
 */
export interface HeadToHeadRules<K extends HeadToHeadKey, Data> {
  start(settings: HeadToHeadSettings<K>): Data;
  /** Whose move it is: one seat, both at once, or null when the game is over. */
  turn(data: Data): Seat | 'both' | null;
  apply(data: Data, seat: Seat, move: Extract<HeadToHeadMove, { game: K }>): Data;
  /** The result once the board decides it (a win or a draw), else null. Resigning is handled for every game alike. */
  outcome(data: Data): Exclude<HeadToHeadOutcome, { reason: 'resigned' }> | null;
  board(data: Data, viewer: Seat | null): Extract<HeadToHeadView['board'], { game: K }>;
  /** The game move by move, for playing back once it is over. */
  replay(data: Data): Extract<HeadToHeadReplay, { game: K }>;
}
