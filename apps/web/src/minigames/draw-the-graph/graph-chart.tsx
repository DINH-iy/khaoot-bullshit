import { GRAPH_LEVEL, GRAPH_SAMPLES, type GraphView } from '@party/contracts';
import type { ReactNode } from 'react';
import { useTexts } from '../../i18n/texts.js';
import { GRAPH_TEXTS } from './graph.text.js';
import './draw-the-graph.css';

const LEFT = 36;
const SPLIT = 200;
const RIGHT = 364;
const TOP = 24;
const BOTTOM = 206;
const y = (value: number) => BOTTOM - value / GRAPH_LEVEL * (BOTTOM - TOP);
const xAt = (index: number) => SPLIT + index / GRAPH_SAMPLES * (RIGHT - SPLIT);
export const chartInk = (hue: number) => `hsl(${hue} 78% 33%)`;

type Trace = { id: string; line: number[]; hue: number; name?: string; winner?: boolean };

export function GraphChart({ chart, traces = [], answer, cursor, children }: {
  chart: GraphView; traces?: Trace[]; answer?: number[]; cursor?: { step: number; height: number; hue: number };
  children?: ReactNode;
}) {
  const t = useTexts(GRAPH_TEXTS);
  const anchor = chart.visible.at(-1)! * 10;
  const past = chart.visible.map((value, i) => `${LEFT + i / (chart.visible.length - 1) * (SPLIT - LEFT)},${y(value * 10)}`).join(' ');
  const future = answer?.map((value, i) => `${SPLIT + (i + 1) / answer.length * (RIGHT - SPLIT)},${y(value * 10)}`).join(' ');
  const named = traces.length <= 8 ? traces.filter(trace => trace.name).sort((a, b) => y(a.line.at(-1)!) - y(b.line.at(-1)!)) : [];
  const labels: number[] = [];
  named.forEach((trace, i) => {
    labels[i] = Math.max(TOP + i * 19, Math.min(BOTTOM - (named.length - i - 1) * 19,
      Math.max((labels[i - 1] ?? TOP - 19) + 19, y(trace.line.at(-1)!))));
  });
  return <div className="graph-chart">
    <svg role={children ? undefined : 'img'} aria-label={children ? undefined : t(answer ? 'revealed' : 'chart')}
      viewBox={`0 0 ${named.length ? 474 : 384} 232`}>
      <rect x={SPLIT} y={TOP} width={RIGHT - SPLIT} height={BOTTOM - TOP} className="graph-future" />
      {[0, 25, 50, 75, 100].map(mark => <g key={mark}>
        <line x1={LEFT} y1={y(mark * 10)} x2={RIGHT} y2={y(mark * 10)} className="graph-grid" />
        <text x={LEFT - 7} y={y(mark * 10)} dy=".35em" textAnchor="end">{mark}</text>
      </g>)}
      <line x1={SPLIT} y1={TOP} x2={SPLIT} y2={BOTTOM} className="graph-boundary" />
      {chart.yLabel && <text x={LEFT} y={15}>{chart.yLabel}</text>}
      <text x={LEFT} y={222} textAnchor="start">{chart.startLabel}</text>
      <text x={SPLIT} y={222} textAnchor="middle">{chart.splitLabel}</text>
      <text x={RIGHT} y={222} textAnchor="end">{chart.endLabel}</text>
      <polyline points={past} className="graph-past" />
      {[...traces].reverse().map(trace => <polyline key={trace.id} data-graph-trace={trace.id}
        points={[`${SPLIT},${y(anchor)}`, ...trace.line.map((height, i) => `${xAt(i + 1)},${y(height)}`)].join(' ')}
        className={trace.winner ? 'graph-guess graph-winner' : 'graph-guess'} stroke={chartInk(trace.hue)} />)}
      {future && <polyline data-graph-answer="" className="graph-answer" points={`${SPLIT},${y(anchor)} ${future}`} />}
      {named.map((trace, i) => {
        const last = y(trace.line.at(-1)!);
        const color = chartInk(trace.hue);
        return <g key={trace.id} className="graph-label">
          <path d={`M${RIGHT} ${last} L${RIGHT + 14} ${labels[i]}`} stroke={color} />
          <text x={RIGHT + 17} y={labels[i]} dy=".35em" style={{ fill: color }}>{trace.name!.length > 14 ? `${trace.name!.slice(0, 13)}…` : trace.name}</text>
        </g>;
      })}
      <circle cx={SPLIT} cy={y(anchor)} r={4} className="graph-anchor" />
      {cursor && <circle className="graph-key-cursor" cx={xAt(cursor.step)} cy={y(cursor.height)} r={5} fill={chartInk(cursor.hue)} />}
      {children}
    </svg>
  </div>;
}

export const graphDrawArea = { left: SPLIT - 10, start: SPLIT, top: TOP, right: RIGHT, bottom: BOTTOM };
