import { GraphDataSchema, SAMPLE_GRAPH, type GraphData } from '@party/contracts';
import { useState } from 'react';
import { useTexts } from '../../../i18n/texts.js';
import { GRAPH_TEXTS } from '../../../minigames/draw-the-graph/graph.text.js';

const AXIS_LABELS = [
  ['startLabel', 'firstLabel'], ['splitLabel', 'splitLabel'], ['endLabel', 'lastLabel'], ['yLabel', 'units'],
] as const;

export function GraphFields({ graph, onChange }: { graph: GraphData | undefined; onChange: (graph?: GraphData) => void }) {
  const t = useTexts(GRAPH_TEXTS);
  return <div className="minigame-fields">
    <label className="check"><input type="checkbox" checked={Boolean(graph)} onChange={event => onChange(
      event.target.checked ? { ...SAMPLE_GRAPH, hidden: [58, 60, 64, 70, 68, 76, 80, 87] } : undefined,
    )} />{t('custom')}</label>
    {graph && <>
      {graph.scale ? <p className="hint">{t('importedRange', { start: graph.startLabel ?? '', end: graph.endLabel ?? '' })}</p> : <>
        <p className="hint">{t('fixedScale')}</p>
        <div className="field-pair">
          <GraphReadings label={t('knownValues')} values={graph.visible} onCommit={visible => onChange({ ...graph, visible })} />
          <GraphReadings label={t('actualValues')} values={graph.hidden} onCommit={hidden => onChange({ ...graph, hidden })} />
        </div>
      </>}
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

function GraphReadings({ label, values, onCommit }: { label: string; values: number[]; onCommit: (values: number[]) => void }) {
  const t = useTexts(GRAPH_TEXTS);
  const [draft, setDraft] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (draft === undefined) return;
    const values = draft.split(',').map(value => /^\s*(?:\d+(?:\.\d+)?|\.\d+)\s*$/.test(value) ? Number(value) : NaN);
    const parsed = GraphDataSchema.shape.visible.max(25).safeParse(values);
    setInvalid(!parsed.success);
    if (parsed.success) {
      setDraft(undefined);
      onCommit(parsed.data);
    }
  };
  return <label>{label}<textarea rows={2} maxLength={175} spellCheck={false} value={draft ?? values.join(', ')}
    aria-invalid={invalid} onChange={event => { setDraft(event.target.value); setInvalid(false); }}
    onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }} />
    {invalid && <span className="hint warn" role="alert">{t('invalidValues')}</span>}
  </label>;
}
