import { useState } from 'react';
import { emptyDrawing, type Drawing } from '@party/contracts';
import { DrawingPad } from '../drawing/drawing-pad.js';
import { DrawingView } from '../drawing/drawing-view.js';
import type { Stage } from './model.js';

/**
 * A drawing round's options: drawing blind, how much may be drawn, and an
 * optional doodle every player gets to finish (drawn here, in the editor).
 */
export function DrawingFields({ stage, onChange }: { stage: Stage; onChange: (next: Stage, field: string) => void }) {
  const input = stage['input'] as { kind: 'drawing'; maxStrokes: number; blind?: boolean; start?: Drawing };
  const [editing, setEditing] = useState(false); const [doodle, setDoodle] = useState<Drawing>(input.start ?? emptyDrawing());
  const setInput = (next: typeof input, field: string) => onChange({ ...stage, input: next }, field);
  return <fieldset className="drawing-fields"><legend>Drawing</legend>
    <label className="choice"><input type="checkbox" checked={Boolean(input.blind)} onChange={event => { const { blind: _blind, ...rest } = input; setInput(event.target.checked ? { ...rest, blind: true } : rest, 'blind'); }} />
      Draw blind: players cannot see what they draw until it is sent</label>
    <label>Most strokes per drawing<input type="number" min={1} max={600} value={input.maxStrokes} onChange={event => setInput({ ...input, maxStrokes: Math.max(1, Math.min(600, Math.round(Number(event.target.value) || 1))) }, 'strokes')} /></label>
    <p className="field-title">A doodle to finish (optional)</p>
    <p className="hint">Draw a start, such as a squiggle or half a face; every player gets it and finishes it their own way.</p>
    {editing ? <div className="doodle-editor"><DrawingPad value={doodle} onChange={setDoodle} maxStrokes={60} label="The doodle players finish" />
      <div className="actions"><button className="small-button" onClick={() => { const { start: _start, ...rest } = input; setInput(doodle.strokes.length ? { ...rest, start: doodle } : rest, 'start'); setEditing(false); }}>Use this doodle</button>
        <button className="small-button" onClick={() => { setDoodle(input.start ?? emptyDrawing()); setEditing(false); }}>Cancel</button></div></div>
      : <div className="doodle-preview">{input.start && <DrawingView drawings={[input.start]} label="The doodle players finish" />}
        <div className="actions"><button className="small-button" onClick={() => setEditing(true)}>{input.start ? 'Change the doodle' : 'Draw a doodle'}</button>
          {input.start && <button className="small-button" onClick={() => { const { start: _start, ...rest } = input; setInput(rest, 'start'); setDoodle(emptyDrawing()); }}>Remove the doodle</button>}</div></div>}
  </fieldset>;
}
