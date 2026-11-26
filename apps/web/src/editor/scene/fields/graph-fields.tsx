import { GraphDataSchema, SAMPLE_GRAPH, type GraphData } from '@party/contracts';
import { useState } from 'react';
import { useTexts } from '../../../i18n/texts.js';
import { GRAPH_TEXTS } from '../../../minigames/draw-the-graph/graph.text.js';

const AXIS_LABELS = [
  ['startLabel', 'firstLabel'], ['splitLabel', 'splitLabel'], ['endLabel', 'lastLabel'], ['yLabel', 'units'],
] as const;

export function GraphFields({ graph, onChange, required = false }: { graph: GraphData | undefined; onChange: (graph?: GraphData) => void; required?: boolean }) {
  const t = useTexts(GRAPH_TEXTS);
  return <div className="minigame-fields">
    {!required && <label className="check"><input type="checkbox" checked={Boolean(graph)} onChange={event => onChange(
      event.target.checked ? { ...SAMPLE_GRAPH, hidden: [58, 60, 64, 70, 68, 76, 80, 87] } : undefined,
    )} />{t('custom')}</label>}
    {graph && <>
      <p className="hint">{graph.scale ? t('editRange', { min: graph.scale.min, max: graph.scale.max }) : t('fixedScale')}</p>
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
      {graph.sourceUrl && <p className="hint"><a href={graph.sourceUrl} target="_blank" rel="noreferrer">{t('openSource')}</a></p>}
    </>}
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
