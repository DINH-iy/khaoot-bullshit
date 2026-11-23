import { translate } from '../../i18n/texts.js';
import { CONTROLS_TEXTS } from './controls.text.js';
const t = (key: keyof typeof CONTROLS_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROLS_TEXTS, key, values);
import { Icon } from './icons.js';
import { ColorPicker } from '../../ui/color-picker.js';

/**
 * A row of colour chips with a + chip to add one (a copy of the first or second colour,
 * alternating). Clicking a chip opens the colour picker; hovering or focusing it shows a
 * pencil and a bin on the chip itself (the bin always shown on touch screens). At least
 * `min` and at most `max` colours. Used for the answer colours (Look & feel) and a wheel's
 * own colours. `suggestions`: more colours offered in the picker next to these ones.
 */
export function Swatches({ colors, name, removeName, onChange, min = 2, max = 8, addName = t('addColour'), suggestions = [] }: {
  colors: string[]; name: (index: number) => string; removeName: (index: number) => string; onChange: (colors: string[]) => void;
  min?: number; max?: number; addName?: string; suggestions?: string[];
}) {
  return <div className="swatch-list">
    {colors.map((color, index) => <span key={index} className="swatch">
      <ColorPicker className="swatch-pick" value={color} label={name(index)} suggestions={[...colors, ...suggestions]}
        onChange={next => onChange(colors.map((entry, at) => at === index ? next : entry))} />
      <span className="swatch-tools">
        <span className="swatch-tool swatch-hint" aria-hidden="true"><Icon name="edit" size={14} /></span>
        {colors.length > min && <button type="button" className="swatch-tool swatch-remove" aria-label={removeName(index)} title={removeName(index)} onClick={() => onChange(colors.filter((_, at) => at !== index))}><Icon name="trash" size={14} /></button>}
      </span>
    </span>)}
    {colors.length < max && <button type="button" className="swatch-add" aria-label={addName} title={addName} onClick={() => onChange([...colors, colors[colors.length % 2]!])}><Icon name="plus" size={18} /></button>}
  </div>;
}
