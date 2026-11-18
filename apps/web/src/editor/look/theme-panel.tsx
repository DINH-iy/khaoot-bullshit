import { contrast, FONTS, resolveTheme, THEME_PRESETS, type FontName, type FullTheme, type Theme } from '@party/contracts';
import { Dropdown } from '../controls/dropdown.js';
import { Section } from '../controls/section.js';
import { Swatches } from '../controls/swatches.js';
import { useState } from 'react';
import { ExportPalette, ImportPalette } from './palette-dialog.js';

type Colors = FullTheme['colors'];
type ColorName = Exclude<keyof Colors, 'answers'>;
const COLOR_LABELS: Record<ColorName, string> = {
  background: 'Background', background2: 'Background, second colour', surface: 'Cards and panels', text: 'Text', muted: 'Quiet text',
  accent: 'Main buttons', accentText: 'Text on main buttons', success: 'Correct / saved', danger: 'Wrong / warning', answerText: 'Text on answers',
};
const FONT_LABELS: Record<FontName, string> = { system: 'Standard', rounded: 'Rounded', serif: 'Classic serif', slab: 'Slab', mono: 'Typewriter', condensed: 'Condensed', playful: 'Playful', elegant: 'Elegant' };
// Each font listed in itself, so the list shows what it looks like.
const FONT_OPTIONS = (Object.keys(FONTS) as FontName[]).map(font => ({ value: font, label: FONT_LABELS[font], style: { fontFamily: FONTS[font] } }));
const BACKGROUNDS = { glow: 'Glow', gradient: 'Gradient', solid: 'Plain', dots: 'Dots', stripes: 'Stripes', grid: 'Grid' } as const;
const TILES = { filled: 'Filled', flat: 'Flat', outline: 'Outline', glass: 'Glass' } as const;

// The marks before each answer: what they are, their shape and place, and what party choices use.
const MARK_CHOICES = [
  { key: 'markers', label: 'Marks', options: { letters: 'A B C', numbers: '1 2 3', shapes: '★ ● ▲', custom: 'Your own', none: 'None' } },
  { key: 'markerShape', label: 'Mark shape', options: { circle: 'Circle', square: 'Square', rounded: 'Rounded square', plain: 'Just the mark' } },
  { key: 'markerPlace', label: 'Mark place', options: { start: 'Before the answer', end: 'After the answer', top: 'Above the answer' } },
  { key: 'routeMarkers', label: 'On party choices', options: { arrows: 'Arrows', answers: 'The same marks' } },
] as const;

/** The author's own marks: typed with spaces between them (emoji, letters, short words), up to 8 of up to 12 characters. */
function CustomMarks({ marks, onChange }: { marks: string[]; onChange: (marks: string[]) => void }) {
  const [text, setText] = useState(marks.join(' '));
  // At most 12 characters each, cut between whole characters (never half an emoji).
  const cut = (mark: string) => Array.from(mark).reduce((kept, char) => (kept + char).length <= 12 ? kept + char : kept, '');
  const parse = (value: string) => value.split(/[\s,]+/).filter(Boolean).map(cut).filter(Boolean).slice(0, 8);
  return <label>Your marks, with spaces between them<input value={text} maxLength={120} placeholder="🎄 🎁 ⭐ 🔔" onChange={event => { setText(event.target.value); onChange(parse(event.target.value)); }} />
    <span className="hint">Up to 8 marks (emoji, letters or a short word). With more answers than marks, they repeat. Without any, the answers get A B C.</span></label>;
}

/** Readability problems with the current colours, in plain language. */
export function contrastWarnings(theme: FullTheme): string[] {
  const c = theme.colors; const warnings: string[] = [];
  const check = (front: string, back: string, what: string) => { const ratio = contrast(front, back); if (ratio < 4.5) warnings.push(`${what} is hard to read (contrast ${ratio.toFixed(1)}, aim for at least 4.5).`); };
  check(c.text, c.background, 'Text on the background'); check(c.text, c.surface, 'Text on cards'); check(c.muted, c.background, 'Quiet text on the background');
  check(c.accentText, c.accent, 'Text on main buttons');
  c.answers.forEach((answer, index) => check(c.answerText, answer, `Text on answer ${String.fromCharCode(65 + index)}`));
  return warnings;
}

/** Colours, fonts, shapes and backgrounds. Every change is a block of choices, never code. */
/** `noAnswers`: for a screen without answers (the site's join screen): no answer colours, tiles or marks. */
export function ThemePanel({ theme, below, title = '', onChange, noAnswers = false }: { theme: Theme | undefined; below: (Theme | undefined)[]; title?: string; onChange: (theme: Theme | undefined) => void; noAnswers?: boolean }) {
  const [palette, setPalette] = useState<'import' | 'export' | null>(null);
  const layer = theme ?? {}; const full = resolveTheme(...below, theme);
  const set = (patch: Partial<Theme>) => onChange({ ...layer, ...patch });
  const setColor = (name: keyof Colors, value: string | string[]) => set({ colors: { ...(layer.colors ?? {}), [name]: value } });
  const answers = full.colors.answers;
  const warnings = contrastWarnings(full);
  // Small named groups (K4): only the style starts open; each group shows what is set when closed, and stays as it was left.
  const presetName = layer.preset && THEME_PRESETS[layer.preset] ? THEME_PRESETS[layer.preset]!.name : 'Your own';
  const fonts = full.headingFont === full.font ? FONT_LABELS[full.font] : `${FONT_LABELS[full.font]}, titles ${FONT_LABELS[full.headingFont]}`;
  const markName = { letters: 'A B C', numbers: '1 2 3', shapes: 'Shapes', custom: 'Your own', none: 'None' }[full.markers];
  return <div className="look-panel">
    <Section title="Style" memory="look:style" open summary={presetName}>
      <div className="preset-grid">{Object.entries(THEME_PRESETS).map(([key, preset]) => <button key={key} className={`preset-card${layer.preset === key ? ' on' : ''}`} aria-pressed={layer.preset === key}
        onClick={() => onChange({ preset: key })} style={{ background: `linear-gradient(160deg, ${preset.theme.colors.background}, ${preset.theme.colors.background2})`, color: preset.theme.colors.text, fontFamily: FONTS[preset.theme.headingFont] }}>
        <strong>{preset.name}</strong>
        <span className="swatches" aria-hidden="true">{preset.theme.colors.answers.slice(0, 4).map(color => <i key={color} style={{ background: color }} />)}<i style={{ background: preset.theme.colors.accent }} /></span>
      </button>)}</div>
      <p className="hint">Choosing a style replaces the changes below. Undo brings them back.</p>
    </Section>

    {warnings.length > 0 && <div className="look-warnings" role="status"><h3>Readability</h3><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}

    <Section title="Colours" memory="look:colours" summary={noAnswers ? 'Background, cards, text, buttons' : `${answers.length} answer colours`}>
      <div className="color-grid">{(Object.keys(COLOR_LABELS) as ColorName[]).filter(name => !noAnswers || name !== 'answerText').map(name => <label key={name} className="color-field">
        <input type="color" value={full.colors[name]} onChange={event => setColor(name, event.target.value)} />{COLOR_LABELS[name]}</label>)}</div>
      {!noAnswers && <><p className="field-title">Answer colours, in order</p>
      <Swatches colors={answers} name={index => `Answer ${String.fromCharCode(65 + index)} colour`} removeName={index => `Remove answer colour ${String.fromCharCode(65 + index)}`}
        onChange={next => setColor('answers', next)} />
      <p className="hint">With more answers than colours, the colours repeat.</p></>}
      {/* Bringing colours in from a brand kit, or taking them out: below the colours they change. */}
      <div className="palette-actions">
        <button type="button" className="link-button" onClick={() => setPalette('import')}>Import colours…</button>
        <button type="button" className="link-button" onClick={() => setPalette('export')}>Export colours…</button>
      </div>
      {palette === 'import' && <ImportPalette onApply={patch => set({ colors: { ...(layer.colors ?? {}), ...patch } })} onClose={() => setPalette(null)} />}
      {palette === 'export' && <ExportPalette colors={full.colors} title={title} onClose={() => setPalette(null)} />}
    </Section>

    <Section title="Text" memory="look:text" summary={`${fonts} · ${Math.round(full.textScale * 100)}%`}>
      <label>Font<Dropdown value={full.font} onChange={font => set({ font: font as FontName })} options={FONT_OPTIONS} /></label>
      <label>Font for titles<Dropdown value={full.headingFont} onChange={font => set({ headingFont: font as FontName })} options={FONT_OPTIONS} /></label>
      <label>Text size · {Math.round(full.textScale * 100)}%<input type="range" min={80} max={160} step={5} value={Math.round(full.textScale * 100)} onChange={event => set({ textScale: Number(event.target.value) / 100 })} /></label>
      <label className="choice"><input type="checkbox" checked={full.uppercaseHeadings} onChange={event => set({ uppercaseHeadings: event.target.checked })} />Titles in capitals</label>
    </Section>

    <Section title="Shapes and background" memory="look:shapes" summary={`${BACKGROUNDS[full.background]}${noAnswers ? '' : ` · ${TILES[full.tiles]}`}${full.gradients ? ' · gradient' : ''}`}>
      <label>Corner roundness · {full.radius}px<input type="range" min={0} max={40} value={full.radius} onChange={event => set({ radius: Number(event.target.value) })} /></label>
      <p className="field-title">Background</p>
      <div className="segmented" role="group" aria-label="Background">{(Object.keys(BACKGROUNDS) as (keyof typeof BACKGROUNDS)[]).map(key => <button key={key} aria-pressed={full.background === key} onClick={() => set({ background: key })}>{BACKGROUNDS[key]}</button>)}</div>
      {!noAnswers && <><p className="field-title">Answer tiles</p>
      <div className="segmented" role="group" aria-label="Answer tiles">{(Object.keys(TILES) as (keyof typeof TILES)[]).map(key => <button key={key} aria-pressed={full.tiles === key} onClick={() => set({ tiles: key })}>{TILES[key]}</button>)}</div></>}
      <label className="choice"><input type="checkbox" checked={full.gradients} onChange={event => set({ gradients: event.target.checked })} />{noAnswers ? 'Gradient effect on the main button' : 'Gradient effect on answer tiles and main buttons'}</label>
    </Section>

    {!noAnswers && <Section title="Answer marks" memory="look:marks" summary={markName}>
      {MARK_CHOICES.map(({ key, label, options }) => <div key={key}>
        <p className="field-title">{label}</p>
        <div className="segmented" role="group" aria-label={label}>{Object.entries(options).map(([value, name]) => <button key={value} aria-pressed={full[key] === value} onClick={() => set({ [key]: value })}>{name}</button>)}</div>
        {key === 'markers' && full.markers === 'custom' && <CustomMarks marks={full.customMarks} onChange={customMarks => set({ customMarks })} />}
      </div>)}
      <p className="hint">The marks show before (or after, or above) each answer on the phones and the shared screen.</p>
    </Section>}
    {theme && <button className="small-button" onClick={() => onChange(undefined)}>Remove all look changes here</button>}
  </div>;
}

