import { GRAPH_LEVEL, GRAPH_SAMPLES, type GraphRoundView } from '@party/contracts';
import { useId, useRef, useState, type PointerEvent } from 'react';
import { useTexts } from '../../i18n/texts.js';
import type { Result } from '../shared/countdown.js';
import { GraphChart, graphDrawArea } from './graph-chart.js';
import { GRAPH_TEXTS } from './graph.text.js';

const { left, start, top, right, bottom } = graphDrawArea;
const clip = (height: number) => Math.max(0, Math.min(GRAPH_LEVEL, height));

export function GraphPhone({ graph, disabled, onResult }: { graph: GraphRoundView; disabled: boolean; onResult: (result: Result) => void }) {
  const t = useTexts(GRAPH_TEXTS);
  const helpId = useId();
  const [line, setLine] = useState<number[]>([]);
  const [height, setHeight] = useState<number>();
  const [showCursor, setShowCursor] = useState(false);
  const pointer = useRef<{ id: number; points: number[] }>(null);
  const anchor = graph.chart.visible.at(-1)! * 10;
  const level = height ?? line.at(-1) ?? anchor;
  const hue = graph.hue ?? 210;
  const clear = () => { pointer.current = null; setLine([]); setHeight(undefined); };

  const position = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const graphX = left + (event.clientX - box.left) / box.width * (right - left);
    const step = Math.round((graphX - start) / (right - start) * GRAPH_SAMPLES);
    return { step: Math.max(0, Math.min(GRAPH_SAMPLES, step)),
      height: clip(Math.round((1 - (event.clientY - box.top) / box.height) * GRAPH_LEVEL)) };
  };
  const extend = (event: PointerEvent<SVGRectElement>) => {
    const current = pointer.current;
    if (disabled || !current || event.pointerId !== current.id) return;
    const next = position(event);
    const last = current.points.length;
    if (next.step <= last) return;
    const from = current.points.at(-1) ?? anchor;
    for (let index = last + 1; index <= next.step; index++) {
      current.points.push(Math.round(from + (next.height - from) * (index - last) / (next.step - last)));
    }
    setLine([...current.points]);
  };
  return <div className="graph-phone">
    <p>{t('draw')}</p>
    <span id={helpId} className="visually-hidden">{t('keyboard')}</span>
    <div className="graph-controller" role="group" aria-label={t('chart')} aria-describedby={helpId} tabIndex={disabled ? -1 : 0}
      onBlur={() => setShowCursor(false)} onKeyDown={event => {
        if (disabled || !['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        setShowCursor(true);
        if (event.key === 'ArrowRight' && line.length < GRAPH_SAMPLES) {
          setLine([...line, level]);
          setHeight(undefined);
        } else if (event.key === 'ArrowLeft') {
          setLine(line.slice(0, -1));
          setHeight(undefined);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          setHeight(clip(level + (event.key === 'ArrowUp' ? 25 : -25)));
        }
      }}>
      <GraphChart chart={graph.chart} traces={line.length ? [{ id: 'own', line, hue }] : []}
        {...(showCursor && line.length < GRAPH_SAMPLES ? { cursor: { step: line.length + 1, height: level, hue } } : {})}>
        <rect className="graph-draw-area" x={left} y={top} width={right - left} height={bottom - top} fill="transparent" aria-hidden="true"
          onPointerDown={event => {
            if (disabled || !event.isPrimary || event.button !== 0 || position(event).step > 2) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer.current = { id: event.pointerId, points: [] };
            setLine([]);
            setHeight(undefined);
            setShowCursor(false);
          }}
          onPointerMove={extend} onPointerUp={event => { extend(event); if (pointer.current?.id === event.pointerId) pointer.current = null; }}
          onLostPointerCapture={() => { pointer.current = null; }} />
      </GraphChart>
    </div>
    {showCursor && line.length < GRAPH_SAMPLES && <span className="visually-hidden" role="status">{t('point', {
      point: line.length + 1, total: GRAPH_SAMPLES, height: Math.round(level / 10),
    })}</span>}
    <div className="actions">
      <button type="button" className="ghost" disabled={disabled || !line.length} onClick={clear}>{t('clear')}</button>
      <button type="button" className="primary" disabled={disabled || line.length !== GRAPH_SAMPLES} onClick={() => onResult({ value: 0, graphLine: line })}>{t('submit')}</button>
    </div>
  </div>;
}
