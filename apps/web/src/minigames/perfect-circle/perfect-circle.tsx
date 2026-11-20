import { useRef, useState } from 'react';
import { emptyDrawing, type MinigameSettings } from '@party/contracts';
import { DrawingPad } from '../../drawing/drawing-pad.js';
import { Countdown, type ControllerProps } from '../shared/countdown.js';
import { useText } from '../../presentation/look.js';
import { useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import { useServerNow } from '../shared/clock.js';
import './perfect-circle.css';

/** Keeps at most `max` points of a stroke, evenly spread (the server scores the shape, not every pixel). */
const thin = (points: readonly number[], max: number) => {
  const count = points.length / 2; if (count <= max) return [...points];
  return Array.from({ length: max }, (_, index) => { const at = Math.round(index * (count - 1) / (max - 1)); return [points[2 * at]!, points[2 * at + 1]!]; }).flat();
};
/** Draw one circle in one go; the server measures how round it is. */
export function PerfectCircle({ settings, startsAt, offset, disabled, onResult }: ControllerProps<MinigameSettings<'perfect-circle'>>) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const [drawing, setDrawing] = useState(emptyDrawing()); const sent = useRef(false);
  const now = useServerNow(offset, true); const end = Date.parse(startsAt) + settings.seconds * 1000; const over = now >= end;
  return <Countdown startsAt={startsAt} offset={offset}>
    <p className="mg-sub">{t('minigame.drawCircle')} · {t('timer.left', { time: `${Math.max(0, (end - now) / 1000).toFixed(1)} s` })}</p>
    <DrawingPad value={drawing} onChange={setDrawing} tools={false} oneStroke disabled={disabled || over} label={c('circle')} bringIntoView
      onStrokeEnd={stroke => { if (sent.current) return; sent.current = true; onResult({ value: 0, stroke: thin(stroke.p, 400) }); }} />
  </Countdown>;
}
