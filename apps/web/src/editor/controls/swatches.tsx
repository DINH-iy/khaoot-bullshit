import { useRef } from 'react';
import { Icon } from './icons.js';

/**
 * A row of colour chips with a + chip to add one (a copy of the first or second colour,
 * alternating). Clicking a chip changes its colour; hovering or focusing it shows a pencil
 * and a bin on the chip itself (always shown on touch screens). At least `min` and at most
 * `max` colours. Used for the answer colours (Look & feel) and a wheel's own colours.
 */
export function Swatches({ colors, name, removeName, onChange, min = 2, max = 8, addName = 'Add a colour' }: {
  colors: string[]; name: (index: number) => string; removeName: (index: number) => string; onChange: (colors: string[]) => void;
  min?: number; max?: number; addName?: string;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const edit = (index: number) => {
    const input = inputs.current[index];
    try { input?.showPicker(); } catch { input?.click(); }
  };
  return <div className="swatch-list">
    {colors.map((color, index) => <span key={index} className="swatch" style={{ background: color }} title={color.toUpperCase()}>
      <input ref={element => { inputs.current[index] = element; }} type="color" aria-label={name(index)} value={color} onChange={event => onChange(colors.map((entry, at) => at === index ? event.target.value : entry))} />
      <span className="swatch-tools">
        <button type="button" className="swatch-tool" tabIndex={-1} aria-hidden="true" onClick={() => edit(index)}><Icon name="edit" size={14} /></button>
        {colors.length > min && <button type="button" className="swatch-tool swatch-remove" aria-label={removeName(index)} title={removeName(index)} onClick={() => onChange(colors.filter((_, at) => at !== index))}><Icon name="trash" size={14} /></button>}
      </span>
    </span>)}
    {colors.length < max && <button type="button" className="swatch-add" aria-label={addName} title={addName} onClick={() => onChange([...colors, colors[colors.length % 2]!])}><Icon name="plus" size={18} /></button>}
  </div>;
}
