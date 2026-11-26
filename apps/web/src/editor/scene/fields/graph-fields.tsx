import { GRAPH_MAX_READINGS, GraphDataSchema, graphReadingAt, SAMPLE_GRAPH, type GraphData } from '@party/contracts';
import { useId, useRef, useState, type ReactNode } from 'react';
import { useTexts } from '../../../i18n/texts.js';
import { GRAPH_TEXTS } from '../../../minigames/draw-the-graph/graph.text.js';

import { Icon } from '../../controls/icons.js';
import { DialSlider } from '../../../ui/dial-slider.js';
import { GraphCutoffChart } from './graph-cutoff.js';
import { GRAPH_EDITOR_TEXTS } from './graph-editor.text.js';
import './graph-data-import.css';

const AXIS_LABELS = [
  ['startLabel', 'firstLabel'], ['splitLabel', 'splitLabel'], ['endLabel', 'lastLabel'], ['yLabel', 'units'],
] as const;

export function GraphFields({ graph, onChange, required = false, readOnly = false, compactControls }: {
  graph: GraphData | undefined; onChange: (graph?: GraphData) => void; required?: boolean; readOnly?: boolean; compactControls?: ReactNode;
}) {
  const t = useTexts(GRAPH_TEXTS);
  const editor = useTexts(GRAPH_EDITOR_TEXTS);
  const custom = !required && <label key="custom" className="check"><input type="checkbox" checked={Boolean(graph)} onChange={event => onChange(
    event.target.checked ? { ...SAMPLE_GRAPH, hidden: [58, 60, 64, 70, 68, 76, 80, 87] } : undefined,
  )} />{t('custom')}</label>;
  const cutoff = graph && <GraphCutoffFields key="cutoff" graph={graph} compact={Boolean(compactControls)} onChange={readOnly ? undefined : onChange} />;
  return <div className="minigame-fields graph-fields">
    {compactControls ? [cutoff, <div className="graph-compact-controls" key="controls">{compactControls}{custom}</div>] : [custom, cutoff]}
    {graph && <>
      <details className="graph-advanced">
        <summary>{editor('editReadings')}</summary>
        <div className="minigame-fields">
          <p className="hint">{graph.scale ? t('editRange', { min: graph.scale.min, max: graph.scale.max }) : t('fixedScale')}</p>
          <p className="hint">{editor('readingsHelp')}</p>
          <div className="field-pair">
            <GraphReadings label={t('knownValues')} values={graph.visible} scale={graph.scale} onCommit={visible => onChange({ ...graph, visible })} />
            <GraphReadings label={t('actualValues')} values={graph.hidden} scale={graph.scale} onCommit={hidden => onChange({ ...graph, hidden })} />
          </div>
          <div className="field-pair">{AXIS_LABELS.map(([key, name]) => <label key={key}>{t(name)}
            <input value={graph[key] ?? ''} maxLength={32} onChange={event => {
              const next = { ...graph };
              if (event.target.value.trim()) next[key] = event.target.value;
              else delete next[key];
              onChange(next);
            }} />
          </label>)}</div>
          <label>{t('source')}<input value={graph.source ?? ''} maxLength={500} onChange={event => {
            const next = { ...graph };
            if (event.target.value.trim()) next.source = event.target.value;
            else delete next.source;
            onChange(next);
          }} /></label>
        </div>
      </details>
      {graph.sourceUrl && <p className="hint"><a className="graph-source-link" href={graph.sourceUrl} target="_blank" rel="noreferrer"><Icon name="globe" size={16} />{t('openSource')}</a></p>}
    </>}
  </div>;
}

function GraphCutoffFields({ graph, onChange, compact }: { graph: GraphData; onChange: ((graph: GraphData) => void) | undefined; compact: boolean }) {
  const t = useTexts(GRAPH_EDITOR_TEXTS);
  const graphText = useTexts(GRAPH_TEXTS);
  const id = useId();
  const original = useRef(graph);
  const lastApplied = useRef(graph);
  if (lastApplied.current !== graph) {
    original.current = graph;
    lastApplied.current = graph;
  }

  const first = Number(graph.startLabel);
  const last = Number(graph.endLabel);
  const periods = Number.isInteger(first) && Number.isInteger(last) && last - first >= 3 && last - first <= 300;
  const steps = periods ? last - first : 100;
  const minimum = Math.ceil(steps * .15);
  const maximum = Math.floor(steps * .85);
  const selected = Math.max(0, Math.min(maximum - minimum, Math.round((graph.splitAt ?? .5) * steps) - minimum));
  const positions = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  const labels = positions.map(step => periods ? String(first + step) : `${step}%`);

  const move = (index: number) => {
    if (index === selected || !onChange) return;
    const splitAt = positions[index]! / steps;
    const sample = (from: number, to: number, intervals: number) => Array.from({ length: intervals + 1 },
      (_, step) => graphReadingAt(original.current, from + (to - from) * step / intervals));
    const intervals = Math.max(4, original.current.visible.length + original.current.hidden.length - 1);
    const before = Math.max(1, Math.min(GRAPH_MAX_READINGS - 1, Math.round(intervals * splitAt)));
    const after = Math.max(2, Math.min(GRAPH_MAX_READINGS, Math.round(intervals * (1 - splitAt))));
    const splitLabel = labels[index]!;
    const next = { ...graph, splitAt, splitLabel, visible: sample(0, splitAt, before), hidden: sample(splitAt, 1, after).slice(1) };
    lastApplied.current = next;
    onChange(next);
  };
  return <div className="graph-edit-cutoff">
    {onChange && <div className="graph-edit-slider">
      <label htmlFor={id}>{t('cutoff')}</label>
      <DialSlider id={id} labels={labels} value={selected} onChange={move} />
      {compact && <p className="hint">{graphText('cutoffHelp')}</p>}
    </div>}
    <figure className="graph-import-chart">
      <GraphCutoffChart graph={graph} label={t('chart')} onMove={onChange && (fraction =>
        move(Math.max(0, Math.min(maximum - minimum, Math.round(fraction * steps) - minimum))))} />
      {onChange && !compact && <figcaption className="hint">{t('dragHelp')}</figcaption>}
    </figure>
  </div>;
}

function GraphReadings({ label, values, scale, onCommit }: { label: string; values: number[]; scale: GraphData['scale']; onCommit: (values: number[]) => void }) {
  const t = useTexts(GRAPH_TEXTS);
  const [draft, setDraft] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  const { min, max } = scale ?? { min: 0, max: 100 };
  const parse = (text: string) => GraphDataSchema.shape.visible.safeParse(text.split(',').map(value => {
    const number = Number(value);
    return /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(value) && number >= min && number <= max
      ? Math.min(100, Math.max(0, (number - min) / (max - min) * 100)) : NaN;
  }));
  const error = t('invalidGraphValues', { min, max });
  const commit = () => {
    if (draft === undefined) return;
    const parsed = parse(draft);
    setInvalid(!parsed.success);
    if (parsed.success) {
      setDraft(undefined);
      onCommit(parsed.data);
    }
  };
  const display = values.map(value => value === 0 ? min : value === 100 ? max : Math.min(max, Math.max(min, Number((min + (max - min) * value / 100).toPrecision(15)))));
  return <label>{label}<textarea rows={2} maxLength={1500} spellCheck={false} value={draft ?? display.join(', ')}
    aria-invalid={invalid} onChange={event => { const value = event.target.value; setDraft(value); setInvalid(false); event.target.setCustomValidity(parse(value).success ? '' : error); }}
    onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }} />
    {invalid && <span className="hint warn" role="alert">{error}</span>}
  </label>;
}
