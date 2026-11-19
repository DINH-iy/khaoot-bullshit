import { MINIGAMES, formatMinigameResult, type MinigameKey } from '@party/contracts';

/** What went wrong, in words, for the arcade's error codes. */
export function arcadeProblem(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  return ({
    LOBBY_PASSWORD_REQUIRED: 'Enter the correct lobby password to join.',
    LOBBY_LOCKED: 'This lobby is locked. Ask its leader to unlock it.',
    LOBBY_FULL: 'This lobby is full.',
    ARCADE_FULL: 'There are too many open lobbies right now. Join one, or try again in a few minutes.',
    ROUND_ON: 'A round is already being played.',
    NOT_ENOUGH_PLAYERS: 'Not enough players for that many teams.',
    ROOM_NOT_AVAILABLE: 'This lobby has closed.',
    FORBIDDEN: 'Only the leader can do that.',
    UNAUTHORIZED: 'You are not in this lobby (any more). Join it again.',
    RATE_LIMITED: 'Slow down a little, then try again.',
    AUTH_UNAVAILABLE: 'The arcade is not available on this server.',
    INVALID_STATE: 'The round changed just before that. Try again.',
  } as Record<string, string>)[code] ?? 'That did not work. Try again.';
}

/** A result as the arcade shows it. A leaderboard's Stop the clock value is how far off the target it was. */
export function arcadeResult(game: MinigameKey, value: number | null, best = false): string {
  if (best && game === 'stop-clock' && value !== null) return `${(value / 1000).toFixed(2)} s off`;
  return formatMinigameResult(game, value, MINIGAMES[game].defaults);
}
export const points = (milli: string) => { const value = Number(milli) / 1000; return `${Number.isInteger(value) ? value : value.toFixed(1)} ${value === 1 ? 'point' : 'points'}`; };
