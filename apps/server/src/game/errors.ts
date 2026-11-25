import type { GameErrorCode } from '@party/contracts';

// Only the code reaches a browser: no submitted content, database diagnostics, or credentials. The optional
// cause (the original unexpected error) stays on the server, for the owner's logs (diagnostics/problems.ts).
export class GameError extends Error {
  constructor(public readonly code: GameErrorCode, options?: { cause?: unknown }) { super(code, options); this.name = 'GameError'; }
}

export function requireGame(condition: unknown, code: GameErrorCode): asserts condition {
  if (!condition) throw new GameError(code);
}
