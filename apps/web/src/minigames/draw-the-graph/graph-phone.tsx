import { GRAPH_LEVEL, GRAPH_SAMPLES, type GraphRoundView } from '@party/contracts';
import { useId, useRef, useState, type PointerEvent } from 'react';
import { useLanguage } from '../../i18n/language.js';
import { graphPeriod, graphValue } from './graph-reading.js';
import { useTexts } from '../../i18n/texts.js';
import type { Result } from '../shared/countdown.js';
import { GraphChart, graphDrawArea } from './graph-chart.js';
import { GRAPH_TEXTS } from './graph.text.js';

const clip = (height: number) => Math.max(0, Math.min(GRAPH_LEVEL, height));

export function GraphPhone({ graph, disabled, onResult }: { graph: GraphRoundView; disabled: boolean; onResult: (result: Result) => void }) {
  const t = useTexts(GRAPH_TEXTS);
  const helpId = useId();
  const language = useLanguage();
  const { left, start, top, right, bottom } = graphDrawArea(graph.chart, true);
  const [line, setLine] = useState<number[]>([]);
  const [height, setHeight] = useState<number>();
  const [showCursor, setShowCursor] = useState(false);
  const [pointerPoint, setPointerPoint] = useState<{ step: number; height: number }>();
  const pointer = useRef<{ id: number; points: number[] }>(null);
  const anchor = graph.chart.visible.at(-1)! * 10;
  const level = height ?? line.at(-1) ?? anchor;
  const activePoint = showCursor ? { step: Math.min(line.length + 1, GRAPH_SAMPLES), height: level } : pointerPoint;
  const period = activePoint ? graphPeriod(graph.chart, activePoint.step, language)
    ?? t('progressPoint', { percent: Math.round(activePoint.step / GRAPH_SAMPLES * 100) }) : '';
  const reading = activePoint ? graphValue(graph.chart, activePoint.height, language) : '';
  const hue = graph.hue ?? 210;
  const clear = () => { pointer.current = null; setLine([]); setHeight(undefined); setPointerPoint(undefined); setShowCursor(false); };

  const position = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const graphX = left + (event.clientX - box.left) / box.width * (right - left);
    const step = Math.round((graphX - start) / (right - start) * GRAPH_SAMPLES);
    return { step: Math.max(0, Math.min(GRAPH_SAMPLES, step)),
      height: step <= 0 ? anchor : clip(Math.round((1 - (event.clientY - box.top) / box.height) * GRAPH_LEVEL)) };
  };
  const extend = (event: PointerEvent<SVGRectElement>) => {
    const current = pointer.current;
    if (disabled || !event.isPrimary || (current && event.pointerId !== current.id)) return;
    const next = position(event);
    if (!current) {
      if (event.pointerType === 'mouse') { setShowCursor(false); setPointerPoint(next); }
      return;
    }
    setPointerPoint(next);
    const last = current.points.length;
    if (next.step <= last) return;
    const from = current.points.at(-1) ?? anchor;
    for (let index = last + 1; index <= next.step; index++) {
      current.points.push(Math.round(from + (next.height - from) * (index - last) / (next.step - last)));
    }
    setLine([...current.points]);
  };
  return <div className="graph-phone">
    <p className="graph-reading" aria-live={showCursor ? 'polite' : undefined}>
      {activePoint ? <><strong>{period}</strong><span>{reading}</span></> : t('draw')}
    </p>
    <span id={helpId} className="visually-hidden">{t('draw')} {t('keyboard')}</span>
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
      <GraphChart chart={graph.chart} portrait traces={line.length ? [{ id: 'own', line, hue }] : []}
        {...(activePoint ? { cursor: { ...activePoint, hue } } : {})}>
        <rect className="graph-draw-area" x={left} y={top} width={right - left} height={bottom - top} fill="transparent" aria-hidden="true"
          onPointerDown={event => {
            if (disabled || !event.isPrimary || event.button !== 0 || position(event).step > 2) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer.current = { id: event.pointerId, points: [] };
            setLine([]);
            setHeight(undefined);
            setShowCursor(false);
            setPointerPoint({ step: 0, height: anchor });
          }}
          onPointerLeave={() => { if (!pointer.current) setPointerPoint(undefined); }} onPointerMove={extend} onPointerUp={event => { extend(event); if (pointer.current?.id === event.pointerId) pointer.current = null; }}
          onLostPointerCapture={() => { pointer.current = null; }} />
      </GraphChart>
    </div>
    <div className="actions">
      <button type="button" className="ghost" disabled={disabled || !line.length} onClick={clear}>{t('clear')}</button>
      <button type="button" className="primary" disabled={disabled || line.length !== GRAPH_SAMPLES} onClick={() => onResult({ value: 0, graphLine: line })}>{t('submit')}</button>
    </div>
  </div>;
}
