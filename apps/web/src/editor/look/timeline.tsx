import type { CustomAnimation } from '@party/contracts';

type Frame = CustomAnimation['keyframes'][number];
type Values = { opacity: number; x: number; y: number; scale: number; rotate: number; blur: number };
const REST: Values = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, blur: 0 };
const EASING_WORDS = { smooth: 'smooth', linear: 'steady', 'ease-in': 'speedsUp', 'ease-out': 'slowsDown', springy: 'springy', snappy: 'snappy' } as const satisfies Record<CustomAnimation['easing'], keyof typeof LOOK_TEXTS.en>;

/** Each block's full values: what a block leaves out stays as in the block before (as the animation plays it). */
function filled(frames: Frame[]): Values[] {
  let last = REST;
  return frames.map(frame => (last = { opacity: frame.opacity ?? last.opacity, x: frame.x ?? last.x, y: frame.y ?? last.y, scale: frame.scale ?? last.scale, rotate: frame.rotate ?? last.rotate, blur: frame.blur ?? last.blur }));
}

/** In words: what the animation does ("Fades in and rises · 0.45 s, slows down"), for the timeline and screen readers. */
export function describeAnimation(animation: CustomAnimation, list: boolean): string {
  const values = filled(animation.keyframes); const first = values[0]!; const last = values.at(-1)!;
  const parts: string[] = [];
  if (first.opacity < last.opacity) parts.push(t('wFadesIn')); else if (first.opacity > last.opacity) parts.push(t('wFadesOut'));
  if (first.y > last.y) parts.push(t('wRises')); else if (first.y < last.y) parts.push(t('wDrops'));
  if (first.x !== last.x) parts.push(t('wSlides'));
  if (first.scale < last.scale) parts.push(t('wGrows')); else if (first.scale > last.scale) parts.push(t('wShrinks'));
  if (first.rotate !== last.rotate) parts.push(t('wTurns'));
  if (first.blur > last.blur) parts.push(t('wSharpens')); else if (first.blur < last.blur) parts.push(t('wBlurs'));
  // Moves away and comes back (a shake, a pop, a bounce).
  const middle = values.slice(1, -1);
  if (!parts.length && middle.some(entry => entry.x !== last.x || entry.y !== last.y || entry.rotate !== last.rotate)) parts.push(t('wWiggles'));
  if (!parts.length && middle.some(entry => entry.scale !== last.scale)) parts.push(t('wPops'));
  if (!parts.length) parts.push(t('wStill'));
  const what = parts.length > 1 ? t('and', { list: parts.slice(0, -1).join(', '), last: parts.at(-1)! }) : parts[0]!;
  const seconds = `${(animation.durationMs / 1000).toFixed(2)} s`; const repeat = (animation.repeat ?? 1) > 1 ? `, ${animation.repeat}×` : '';
  const order = list && animation.staggerMs ? t('oneAfter') : '';
  const text = `${order}${what} · ${seconds}${repeat}, ${t(EASING_WORDS[animation.easing])}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The animation as a timeline: a bar per item (one for a single thing, one per answer when
 * they come one after another), from its wait to its end, with a mark at every block.
 * `run` changes each time the sample plays, which moves a play head along.
 */
export function Timeline({ animation, rows, run }: { animation: CustomAnimation; rows: number; run: number }) {
  const delay = animation.delayMs ?? 0; const stagger = animation.staggerMs ?? 0; const repeat = animation.repeat ?? 1;
  const length = animation.durationMs * repeat; const count = stagger ? rows : 1;
  const total = Math.max(1, delay + (count - 1) * stagger + length);
  const percent = (ms: number) => `${(ms / total) * 100}%`;
  return <div className="timeline" aria-hidden="true">
    <div className={`timeline-tracks rows-${count}`}>
      {Array.from({ length: count }, (_, index) => { const start = delay + index * stagger; return <div key={index} className="timeline-track">
        {start > 0 && <span className="timeline-wait" style={{ width: percent(start) }} />}
        <span className="timeline-bar" style={{ left: percent(start), width: percent(length) }}>
          {Array.from({ length: repeat }, (_, round) => animation.keyframes.map((frame, at) => <i key={`${round}-${at}`} className="timeline-key" style={{ left: `${((round + frame.at) / repeat) * 100}%` }} />))}
        </span>
      </div>; })}
      {run > 0 && <span key={run} className="timeline-playhead" style={{ animationDuration: `${total}ms` }} />}
    </div>
    <div className="timeline-axis"><span>0 s</span>{delay > 0 && <span className="timeline-axis-wait" style={{ left: percent(delay) }}>wait {(delay / 1000).toFixed(2)} s</span>}<span>{(total / 1000).toFixed(2)} s</span></div>
  </div>;
}
import { translate } from '../../i18n/texts.js';
import { LOOK_TEXTS } from './look.text.js';
const t = (key: keyof typeof LOOK_TEXTS.en, values?: Record<string, string | number>) => translate(LOOK_TEXTS, key, values);
