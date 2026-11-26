import { GRAPH_LEVEL, GRAPH_SAMPLES, type GraphView } from '@party/contracts';
import { useId, type ReactNode } from 'react';
import { useLanguage } from '../../i18n/language.js';
import { useTexts } from '../../i18n/texts.js';
import { GRAPH_TEXTS } from './graph.text.js';
import './draw-the-graph.css';

const LEFT = 36;
type Plot = { left: number; start: number; top: number; right: number; bottom: number };
const RIGHT = 364;
const TOP = 24;
const STANDARD_BOTTOM = 206;
const PORTRAIT_BOTTOM = 280;
export const chartInk = (hue: number) => `hsl(${hue} 78% 33%)`;

type Trace = { id: string; line: number[]; hue: number; name?: string; winner?: boolean };

export function GraphChart({ chart, traces = [], answer, cursor, portrait = false, showDifference = false, animateReveal = false, accessibleLabel, children, fixedAxis = false }: {
  chart: GraphView; traces?: Trace[]; answer?: number[]; cursor?: { step: number; height: number; hue: number };
  portrait?: boolean; showDifference?: boolean; animateReveal?: boolean; accessibleLabel?: string; children?: ReactNode | ((plot: Plot) => ReactNode); fixedAxis?: boolean;
}) {
  const t = useTexts(GRAPH_TEXTS);
  const revealClip = useId();
  const revealing = animateReveal && Boolean(answer);
  const language = useLanguage();
  const { start: split, bottom } = graphDrawArea(chart, portrait);
  const y = (value: number) => bottom - value / GRAPH_LEVEL * (bottom - TOP);
  const xAt = (index: number) => split + index / GRAPH_SAMPLES * (RIGHT - split);
  const scale = chart.scale ?? { min: 0, max: 100 };
  const labelOf = (mark: number) => {
    const value = scale.min + mark / 100 * (scale.max - scale.min);
    return new Intl.NumberFormat(language, { notation: Math.abs(value) >= 10000 ? 'compact' : 'standard', maximumSignificantDigits: 4 }).format(value);
  };
  const lowerSplitLabel = (chart.splitAt ?? .5) < .28 || (chart.splitAt ?? .5) > .72;
  const anchor = chart.visible.at(-1)! * 10;
  const past = chart.visible.map((value, i) => `${LEFT + i / (chart.visible.length - 1) * (split - LEFT)},${y(value * 10)}`).join(' ');
  const future = answer?.map((value, i) => `${split + (i + 1) / answer.length * (RIGHT - split)},${y(value * 10)}`).join(' ');
  const drawn = (line: number[]) => line.map((height, i) => `${xAt(i + 1)},${y(height)}`);
  const anchorPoint = `${split},${y(anchor)}`;
  const difference = showDifference && future && traces[0] ? `${anchorPoint} ${future} ${drawn(traces[0].line).reverse().join(' ')}` : null;
  const named = traces.length <= 8 ? traces.filter(trace => trace.name).sort((a, b) => y(a.line.at(-1)!) - y(b.line.at(-1)!)) : [];
  const labels: number[] = [];
  named.forEach((trace, i) => {
    labels[i] = Math.max(TOP + i * 19, Math.min(bottom - (named.length - i - 1) * 19,
      Math.max((labels[i - 1] ?? TOP - 19) + 19, y(trace.line.at(-1)!))));
  });
  return <div className={`graph-chart${revealing ? ' graph-chart-revealing' : ''}`}>
    <svg role={children && !fixedAxis ? undefined : 'img'} aria-label={children && !fixedAxis ? undefined : accessibleLabel ?? t(answer ? 'revealed' : 'chart')}
      viewBox={`-12 0 ${named.length ? 486 : 396} ${bottom + (fixedAxis || lowerSplitLabel ? 40 : 26)}`}>
      <rect x={split} y={TOP} width={RIGHT - split} height={bottom - TOP} className="graph-future" />
      {[0, 25, 50, 75, 100].map(mark => <g key={mark}>
        <line x1={LEFT} y1={y(mark * 10)} x2={RIGHT} y2={y(mark * 10)} className="graph-grid" />
        <text x={LEFT - 7} y={y(mark * 10)} dy=".35em" textAnchor="end">{labelOf(mark)}</text>
      </g>)}
      <line x1={split} y1={TOP} x2={split} y2={bottom} className="graph-boundary" />
      {chart.yLabel && <text x={LEFT} y={15}>{chart.yLabel}</text>}
      <text x={LEFT} y={bottom + 16} textAnchor="start">{chart.startLabel}</text>
      <text x={split} y={bottom + (lowerSplitLabel ? 30 : 16)} textAnchor="middle">{chart.splitLabel}</text>
      <text x={RIGHT} y={bottom + 16} textAnchor="end">{chart.endLabel}</text>
      <polyline points={past} className="graph-past" />
      {revealing && <defs>
        <clipPath id={revealClip}>
          <rect className="graph-reveal-sweep" x={split - 2} y={0} width={RIGHT - split + 6} height={bottom + 8} />
        </clipPath>
      </defs>}
      <g className="graph-reveal-lines" clipPath={revealing ? `url(#${revealClip})` : undefined}>
        {difference && <polygon className="graph-difference" fill={chartInk(traces[0]!.hue)} fillRule="evenodd" points={difference} />}
        {[...traces].reverse().map(trace => <polyline key={trace.id} data-graph-trace={trace.id}
          points={[anchorPoint, ...drawn(trace.line)].join(' ')}
          className={trace.winner ? 'graph-guess graph-winner' : 'graph-guess'} stroke={chartInk(trace.hue)} />)}
        {future && <polyline data-graph-answer="" className="graph-answer" points={`${anchorPoint} ${future}`} />}
      </g>
      {named.map((trace, i) => {
        const last = y(trace.line.at(-1)!);
        const color = chartInk(trace.hue);
        return <g key={trace.id} className="graph-label">
          <path d={`M${RIGHT} ${last} L${RIGHT + 14} ${labels[i]}`} stroke={color} />
          <text x={RIGHT + 17} y={labels[i]} dy=".35em" style={{ fill: color }}>{trace.name!.length > 14 ? `${trace.name!.slice(0, 13)}…` : trace.name}</text>
        </g>;
      })}
      <circle cx={split} cy={y(anchor)} r={4} className="graph-anchor" />
      {cursor && <g className="graph-cursor" aria-hidden="true">
        <line className="graph-boundary" x1={xAt(cursor.step)} y1={TOP} x2={xAt(cursor.step)} y2={bottom} />
        <circle cx={xAt(cursor.step)} cy={y(cursor.height)} r={5} fill={chartInk(cursor.hue)} />
      </g>}
      {typeof children === 'function' ? children({ left: LEFT, start: split, right: RIGHT, top: TOP, bottom }) : children}
    </svg>
  </div>;
}

export function graphDrawArea(chart: GraphView, portrait: boolean) {
  const split = LEFT + (chart.splitAt ?? .5) * (RIGHT - LEFT);
  return { left: split - 10, start: split, top: TOP, right: RIGHT, bottom: portrait ? PORTRAIT_BOTTOM : STANDARD_BOTTOM };
}
