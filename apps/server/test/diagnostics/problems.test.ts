import { describe, expect, it } from 'vitest';
import { describeProblem, unexpectedCause } from '../../src/diagnostics/problems.js';
import { GameError } from '../../src/game/errors.js';
import { RoomError } from '../../src/rooms/security.js';

describe('which server errors go in the owner’s logs', () => {
  it('skips ordinary refusals and keeps the cause behind GAME_UNAVAILABLE', () => {
    expect(unexpectedCause(new GameError('TOO_LATE'))).toBeUndefined();
    expect(unexpectedCause(new RoomError('RATE_LIMITED'))).toBeUndefined();
    const cause = new Error('value too long for type character varying(20)');
    expect(unexpectedCause(new GameError('GAME_UNAVAILABLE', { cause }))).toBe(cause);
    expect(unexpectedCause(cause)).toBe(cause);
  });

  it('describes an error by message and the first lines of its stack, bounded', () => {
    const problem = describeProblem('POST /api/arcade/lobbies/:lobbyId/start', new TypeError(`broken ${'x'.repeat(2000)}`), 'member');
    expect(problem.message.startsWith('TypeError: broken')).toBe(true); expect(problem.message.length).toBeLessThanOrEqual(600);
    expect(problem.stack.length).toBeGreaterThan(0); expect(problem.stack.length).toBeLessThanOrEqual(6);
    expect(describeProblem('x', 'a string was thrown').message).toBe('Error: a string was thrown');
  });
});
