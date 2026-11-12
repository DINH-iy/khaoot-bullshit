import type { GameErrorCode } from '@party/contracts';

// Deliberately contains no submitted content, database diagnostics, or credentials.
export class GameError extends Error {
  constructor(public readonly code: GameErrorCode) { super(code); this.name = 'GameError'; }
}

export function requireGame(condition: unknown, code: GameErrorCode): asserts condition {
  if (!condition) throw new GameError(code);
}
