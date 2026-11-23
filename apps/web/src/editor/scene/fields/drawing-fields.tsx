import { useState } from 'react';
import { emptyDrawing, type Drawing } from '@party/contracts';
import { DrawingPad } from '../../../drawing/drawing-pad.js';
import { DrawingView } from '../../../drawing/drawing-view.js';
import { translate } from '../../../i18n/texts.js';
import { FIELDS_TEXTS } from '../fields.text.js';
const t = (key: keyof typeof FIELDS_TEXTS.en, values?: Record<string, string | number>) => translate(FIELDS_TEXTS, key, values);
import type { Stage } from '../../model.js';

/**
 * A drawing round's options: drawing blind, how much may be drawn, and an
 * optional doodle every player gets to finish (drawn here, in the editor).
 */
export function DrawingFields({ stage, onChange }: { stage: Stage; onChange: (next: Stage, field: string) => void }) {
  const input = stage['input'] as { kind: 'drawing'; maxStrokes: number; blind?: boolean; start?: Drawing };
  const [editing, setEditing] = useState(false); const [doodle, setDoodle] = useState<Drawing>(input.start ?? emptyDrawing());
  const setInput = (next: typeof input, field: string) => onChange({ ...stage, input: next }, field);
  return <fieldset className="drawing-fields"><legend>{t('drawing')}</legend>
    <label className="choice"><input type="checkbox" checked={Boolean(input.blind)} onChange={event => { const { blind: _blind, ...rest } = input; setInput(event.target.checked ? { ...rest, blind: true } : rest, 'blind'); }} />
      Draw blind: players cannot see what they draw until it is sent</label>
    <label>{t('mostStrokes')}<input type="number" min={1} max={600} value={input.maxStrokes} onChange={event => setInput({ ...input, maxStrokes: Math.max(1, Math.min(600, Math.round(Number(event.target.value) || 1))) }, 'strokes')} /></label>
    <p className="field-title">{t('doodle')}</p>
    <p className="hint">{t('doodleHint')}</p>
    {editing ? <div className="doodle-editor"><DrawingPad value={doodle} onChange={setDoodle} maxStrokes={60} label={t('doodleLabel')} />
      <div className="actions"><button className="small-button" onClick={() => { const { start: _start, ...rest } = input; setInput(doodle.strokes.length ? { ...rest, start: doodle } : rest, 'start'); setEditing(false); }}>{t('useDoodle')}</button>
        <button className="small-button" onClick={() => { setDoodle(input.start ?? emptyDrawing()); setEditing(false); }}>{t('cancel')}</button></div></div>
      : <div className="doodle-preview">{input.start && <DrawingView drawings={[input.start]} label={t('doodleLabel')} />}
        <div className="actions"><button className="small-button" onClick={() => setEditing(true)}>{t(input.start ? 'changeDoodle' : 'drawDoodle')}</button>
          {input.start && <button type="button" className="small-button danger-outline" onClick={() => { const { start: _start, ...rest } = input; setInput(rest, 'start'); setDoodle(emptyDrawing()); }}>{t('removeDoodle')}</button>}</div></div>}
  </fieldset>;
}
