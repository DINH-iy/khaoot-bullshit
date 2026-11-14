import { roomApi } from '../network/api.js';

/** Side-game requests for this room; errors come back as plain sentences. */
export const sideApi = <T>(sessionId: string, path: string, body?: unknown) => roomApi<T>(`/api/rooms/${sessionId}/side${path}`, body);
const problems: Record<string, string> = {
  NOT_ENOUGH_CHIPS: 'Not enough chips for that.',
  SIDE_GAMES_PAUSED: 'Paused: the game needs you right now.',
  SIDE_GAMES_OFF: 'The host has switched side games off.',
  RATE_LIMITED: 'Slow down a little and try again.',
};
export const sideProblem = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'That did not go through. Check the connection and try again.';
export const chips = (amount: number) => `${amount.toLocaleString()} ${Math.abs(amount) === 1 ? 'chip' : 'chips'}`;
/** Animations are skipped for people who ask for less motion. */
export const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
