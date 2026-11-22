import { useEffect, useState, type ReactNode } from 'react';
import { type DotPattern, type RevealEasing } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import { DotBoard } from './count-dots.js';

const motionQuery = '(prefers-reduced-motion: reduce)';
const curves = { 'ease-in': [.42, 0, 1, 1], 'ease-out': [0, 0, .58, 1], 'ease-in-out': [.42, 0, .58, 1] } as const;

function curveAt(progress: number, easing: Exclude<RevealEasing, 'instant'>) {
  if (easing === 'linear' || progress === 0 || progress === 1) return progress;
  const [x1, y1, x2, y2] = curves[easing];
  const cubic = (t: number, first: number, second: number) =>
    3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3;
  // Find the time coordinate of the same CSS easing curve used by the graph.
  let low = 0;
  let high = 1;
  for (let i = 0; i < 12; i++) {
    const middle = (low + high) / 2;
    if (cubic(middle, x1, x2) < progress) low = middle;
    else high = middle;
  }
  return cubic((low + high) / 2, y1, y2);
}

export function DotReveal({ pattern, startedAt, offset, easing, children }: {
  pattern: DotPattern; startedAt: string; offset: number; easing: RevealEasing; children?: ReactNode;
}) {
  const t = useTexts(CONTROL_TEXTS);
  const total = pattern.length;
  const start = Date.parse(startedAt);
  // Large patterns reveal several dots per frame so the standings stay prompt.
  const duration = Math.min(6000, Math.max(3600, total * 160));
  const countAt = (time: number) => easing === 'instant' ? total : Math.floor(
    total * curveAt(Math.max(0, Math.min(1, (time - start) / duration)), easing),
  );
  const [count, setCount] = useState(() => matchMedia(motionQuery).matches ? total : countAt(Date.now() + offset));
  useEffect(() => {
    const media = matchMedia(motionQuery);
    let frame = 0;
    const tick = () => {
      const next = media.matches ? total : countAt(Date.now() + offset);
      setCount(previous => Math.max(previous, next));
      if (next < total) frame = requestAnimationFrame(tick);
    };
    const resume = () => { cancelAnimationFrame(frame); tick(); };
    tick();
    media.addEventListener('change', resume);
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', resume); };
  }, [start, offset, total, duration, easing]);
  return <>
    <div className="mg-dot-reveal">
      <DotBoard pattern={pattern.slice(0, count)} highlight={count < total && count > 0} />
      {count < total ? <p className="mg-dot-total" aria-hidden="true">{t('dotTotal', { count })}</p>
        : <p className="mg-dot-total" role="status">{t('dotTotal', { count: total })}</p>}
    </div>
    {count === total && children}
  </>;
}
