import { contrast, FONTS, resolveTheme, THEME_PRESETS, type FontName, type FullTheme, type Theme } from '@party/contracts';

type Colors = FullTheme['colors'];
type ColorName = Exclude<keyof Colors, 'answers'>;
const COLOR_LABELS: Record<ColorName, string> = {
  background: 'Background', background2: 'Background, second colour', surface: 'Cards and panels', text: 'Text', muted: 'Quiet text',
  accent: 'Main buttons', accentText: 'Text on main buttons', success: 'Correct / saved', danger: 'Wrong / warning', answerText: 'Text on answers',
};
const FONT_LABELS: Record<FontName, string> = { system: 'Standard', rounded: 'Rounded', serif: 'Classic serif', slab: 'Slab', mono: 'Typewriter', condensed: 'Condensed', playful: 'Playful', elegant: 'Elegant' };
const BACKGROUNDS = { glow: 'Glow', gradient: 'Gradient', solid: 'Plain', dots: 'Dots', stripes: 'Stripes', grid: 'Grid' } as const;
const TILES = { filled: 'Filled', flat: 'Flat', outline: 'Outline', glass: 'Glass' } as const;

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
export function ThemePanel({ theme, below, onChange }: { theme: Theme | undefined; below: (Theme | undefined)[]; onChange: (theme: Theme | undefined) => void }) {
  const layer = theme ?? {}; const full = resolveTheme(...below, theme);
  const set = (patch: Partial<Theme>) => onChange({ ...layer, ...patch });
  const setColor = (name: keyof Colors, value: string | string[]) => set({ colors: { ...(layer.colors ?? {}), [name]: value } });
  const answers = full.colors.answers;
  const warnings = contrastWarnings(full);
  return <div className="look-panel">
    <fieldset><legend>Start from a style</legend>
      <div className="preset-grid">{Object.entries(THEME_PRESETS).map(([key, preset]) => <button key={key} className={`preset-card${layer.preset === key ? ' on' : ''}`} aria-pressed={layer.preset === key}
        onClick={() => onChange({ preset: key })} style={{ background: `linear-gradient(160deg, ${preset.theme.colors.background}, ${preset.theme.colors.background2})`, color: preset.theme.colors.text, fontFamily: FONTS[preset.theme.headingFont] }}>
        <strong>{preset.name}</strong>
        <span className="swatches" aria-hidden="true">{preset.theme.colors.answers.slice(0, 4).map(color => <i key={color} style={{ background: color }} />)}<i style={{ background: preset.theme.colors.accent }} /></span>
      </button>)}</div>
      <p className="hint">Choosing a style replaces the changes below. Undo brings them back.</p>
    </fieldset>

    {warnings.length > 0 && <div className="look-warnings" role="status"><h3>Readability</h3><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}

    <fieldset><legend>Colours</legend>
      <div className="color-grid">{(Object.keys(COLOR_LABELS) as ColorName[]).map(name => <label key={name} className="color-field">
        <input type="color" value={full.colors[name]} onChange={event => setColor(name, event.target.value)} />{COLOR_LABELS[name]}</label>)}</div>
      <p className="field-title">Answer colours, in order</p>
      <div className="answer-colors">{answers.map((color, index) => <span key={index} className="answer-color">
        <input type="color" aria-label={`Answer ${String.fromCharCode(65 + index)} colour`} value={color} onChange={event => setColor('answers', answers.map((entry, at) => at === index ? event.target.value : entry))} />
        <button className="small-button" aria-label={`Remove answer colour ${String.fromCharCode(65 + index)}`} disabled={answers.length <= 2} onClick={() => setColor('answers', answers.filter((_, at) => at !== index))}>×</button></span>)}
        <button className="small-button" disabled={answers.length >= 8} onClick={() => setColor('answers', [...answers, answers[answers.length % 2]!])}>Add a colour</button></div>
      <p className="hint">With more answers than colours, the colours repeat.</p>
    </fieldset>

    <fieldset><legend>Text</legend>
      <label>Font<select value={full.font} onChange={event => set({ font: event.target.value as FontName })}>{(Object.keys(FONTS) as FontName[]).map(font => <option key={font} value={font}>{FONT_LABELS[font]}</option>)}</select></label>
      <label>Font for titles<select value={full.headingFont} onChange={event => set({ headingFont: event.target.value as FontName })}>{(Object.keys(FONTS) as FontName[]).map(font => <option key={font} value={font}>{FONT_LABELS[font]}</option>)}</select></label>
      <label>Text size · {Math.round(full.textScale * 100)}%<input type="range" min={80} max={160} step={5} value={Math.round(full.textScale * 100)} onChange={event => set({ textScale: Number(event.target.value) / 100 })} /></label>
      <label className="choice"><input type="checkbox" checked={full.uppercaseHeadings} onChange={event => set({ uppercaseHeadings: event.target.checked })} />Titles in capitals</label>
    </fieldset>

    <fieldset><legend>Shapes and background</legend>
      <label>Corner roundness · {full.radius}px<input type="range" min={0} max={40} value={full.radius} onChange={event => set({ radius: Number(event.target.value) })} /></label>
      <p className="field-title">Background</p>
      <div className="segmented" role="group" aria-label="Background">{(Object.keys(BACKGROUNDS) as (keyof typeof BACKGROUNDS)[]).map(key => <button key={key} aria-pressed={full.background === key} onClick={() => set({ background: key })}>{BACKGROUNDS[key]}</button>)}</div>
      <p className="field-title">Answer tiles</p>
      <div className="segmented" role="group" aria-label="Answer tiles">{(Object.keys(TILES) as (keyof typeof TILES)[]).map(key => <button key={key} aria-pressed={full.tiles === key} onClick={() => set({ tiles: key })}>{TILES[key]}</button>)}</div>
    </fieldset>
    {theme && <button className="small-button" onClick={() => onChange(undefined)}>Remove all look changes here</button>}
  </div>;
}

