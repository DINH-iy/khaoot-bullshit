import type { Challenge } from '@party/contracts';
import { translate } from '../i18n/texts.js';
import { SIDE_TEXTS } from './side.text.js';
import { roomApi } from '../room/api.js';

/** Side-game requests for this room; errors come back as plain sentences. */
export const sideApi = <T>(sessionId: string, path: string, body?: unknown) => roomApi<T>(`/api/rooms/${sessionId}/side${path}`, body);
/** A side-games text in the phone's language (side.text.ts). */
export const st = (key: keyof typeof SIDE_TEXTS.en, values?: Record<string, string | number>) => translate(SIDE_TEXTS, key, values);
const problems: Record<string, keyof typeof SIDE_TEXTS.en> = { NOT_ENOUGH_CHIPS: 'notEnough', SIDE_GAMES_PAUSED: 'paused', SIDE_GAMES_OFF: 'sideOff', CHIPS_OFF: 'chipsOff', RATE_LIMITED: 'rateLimited' };
export const sideProblem = (cause: unknown) => st(problems[cause instanceof Error ? cause.message : ''] ?? 'failed');
export const chips = (amount: number) => st(Math.abs(amount) === 1 ? 'chip' : 'chipsN', { count: amount.toLocaleString() });
/** Animations are skipped for people who ask for less motion. */
export const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Whether this player has to move in a running challenge (in rock paper scissors: has not picked yet this round). */
export const isMyTurn = (entry: Challenge) => entry.status === 'PLAYING' && (entry.game === 'brick-rally' ? !entry.view.ready[entry.view.seat] : entry.view.turn === 'both'
  ? !(entry.view.board.game === 'rps' && entry.view.seat !== null && entry.view.board.picked[entry.view.seat]) : entry.view.turn === entry.view.seat);
