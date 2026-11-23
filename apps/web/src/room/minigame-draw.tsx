import { useEffect, useState, type ReactNode } from 'react';
import type { RoomSnapshot } from '@party/contracts';
import { translate } from '../i18n/texts.js';
import { Icon } from '../presentation/line-icons.js';
import { Popover } from './room-chrome.js';
import { PLAY_TEXTS } from './play.text.js';
import './minigame-draw.css';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Route = NonNullable<Stage['route']>;
type Send = (type: string, extra: Record<string, unknown>) => void;
const p = (key: keyof typeof PLAY_TEXTS.en, values?: Record<string, string | number>) => translate(PLAY_TEXTS, key, values);

// The draw's timeline, in ms after the server recorded it: a highlight runs around the cards
// in order, fast at first and slowing down, lands on the drawn game, flashes, and that game pops forward.
const FLASH = 900;
// Each step is a little longer than the one before: quick ticks that ease into slow, readable ones.
const stepMs = (step: number, steps: number) => 55 + 440 * (step / Math.max(1, steps - 1)) ** 3;
const stepAt = (index: number, steps: number) => { let total = 0; for (let step = 0; step < index; step++) total += stepMs(step, steps); return total; };
/** How long the whole draw takes for this path, landing and flash included. */
export const drawDuration = (path: number[]) => stepAt(path.length - 1, path.length) + FLASH;

/**
 * The highlight's path: card after card in order, round and round (at least a few full laps,
 * about twenty steps), ending on the drawn one. Where it starts is seeded by the round, so
 * every screen (and a screen that reloads) runs the same lap.
 */
export function drawPath(seed: string, count: number, drawn: number): number[] {
  const hash = [...seed].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 2166136261);
  const start = hash % count; const laps = Math.max(2, Math.ceil(18 / count));
  const steps = laps * count + (drawn - start + count) % count;
  return Array.from({ length: steps + 1 }, (_, step) => (start + step) % count);
}
export type DrawMoment = { phase: 'waiting' } | { phase: 'cycle'; lit: number } | { phase: 'landed'; lit: number } | { phase: 'done' };
/** Where the animation is `elapsed` ms after the draw. */
export function drawMoment(elapsed: number | null, path: number[]): DrawMoment {
  if (elapsed === null) return { phase: 'waiting' };
  const landed = stepAt(path.length - 1, path.length);
  if (elapsed >= landed + FLASH) return { phase: 'done' };
  if (elapsed >= landed) return { phase: 'landed', lit: path.at(-1)! };
  let step = 0; while (step + 1 < path.length && elapsed >= stepAt(step + 1, path.length)) step++;
  return { phase: 'cycle', lit: path[step]! };
}
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Option = { key: string; label: string };
/**
 * The cards of a draw and where the animation is: face up while waiting (`drawn` null),
 * then the shuffle from `at` (this device's clock) to the drawn card. Shared by the room
 * and the editor's preview. `waiting`: the line under the cards before a draw.
 */
export function DrawBoard({ options, drawn, at, seed, waiting, children }: { options: Option[]; drawn: number | null; at: number | null; seed: string; waiting: string; children?: ReactNode }) {
  const path = drawn === null ? [] : drawPath(seed, options.length, drawn);
  const done = drawn === null ? 0 : drawDuration(path);
  const elapsedNow = () => drawn === null ? null : at === null || reducedMotion() ? done : Date.now() - at;
  const [elapsed, setElapsed] = useState(elapsedNow);
  useEffect(() => {
    setElapsed(elapsedNow());
    if (drawn === null) return;
    let frame = 0;
    const tick = () => { const value = elapsedNow(); setElapsed(value); if (value !== null && value < done) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, at, seed]);
  const moment = drawMoment(elapsed, path);
  const lit = moment.phase === 'cycle' || moment.phase === 'landed' ? moment.lit : null;
  return <div className={`minigame-draw draw-${moment.phase}`} role="region" aria-label={p('drawCards')}>
    <ul className="draw-cards">
      {options.map((option, index) => {
        const won = moment.phase === 'done' && index === drawn;
        return <li key={option.key} className={`draw-card${lit === index ? ' is-lit' : ''}${won ? ' is-drawn' : ''}${moment.phase === 'done' && !won ? ' is-out' : ''}`}>
          <span className="draw-badge" aria-hidden="true"><Icon name="minigame" size={30} /></span><strong>{option.label}</strong>
        </li>;
      })}
    </ul>
    {/* While it runs, the game under the highlight in big letters; screen readers hear only the result. */}
    {lit !== null && <p className="draw-now" aria-hidden="true">{options[lit]!.label}</p>}
    <p role="status" className="draw-status">{moment.phase === 'done' && drawn !== null ? <strong>{p('drawnGame', { game: options[drawn]!.label })}</strong>
      : moment.phase === 'waiting' ? waiting : <span className="visually-hidden">{p('drawing')}</span>}</p>
    {moment.phase === 'waiting' && children}
  </div>;
}

/**
 * A minigame draw in the room: the host draws (or the timer does), every screen shuffles the
 * same way (seeded by the round, timed by the server's draw time) and lands on the drawn game.
 * A late screen, or one that asks for less motion, shows the result at once. The host may also pick a game.
 */
export function MinigameDraw({ state, stage, offset, disabled, send }: { state: RoomSnapshot; stage: Stage; offset: number; disabled: boolean; send: Send }) {
  const route = stage.route as Route; const host = state.role === 'host';
  const decision = route.decision; const index = decision ? route.options.findIndex(option => option.key === decision.optionKey) : -1;
  // The server's draw time on this device's clock.
  const at = decision?.at ? Date.parse(decision.at) - offset : null;
  return <DrawBoard options={route.options} drawn={index < 0 ? null : index} at={at} seed={stage.id} waiting={host ? p('drawWho') : p('drawWaiting')}>
    {host && state.view.status === 'RUNNING' && <Popover label={p('pickMyself')} text={p('pickMyself')} align="start" closeOnAction>
      <div className="draw-pick">{route.options.map(option => <button key={option.key} type="button" disabled={disabled}
        onClick={() => send('route.decide', { stageRunId: stage.id, optionKey: option.key })}>{option.label}</button>)}</div>
    </Popover>}
  </DrawBoard>;
}
