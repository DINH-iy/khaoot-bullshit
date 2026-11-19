import { contrast, FONTS, resolveTheme, THEME_PRESETS, type FontName, type FullTheme, type Theme } from '@party/contracts';
import { Dropdown } from '../../ui/dropdown.js';
import { Section } from '../controls/section.js';
import { Swatches } from '../controls/swatches.js';
import { useState } from 'react';
import { translate } from '../../i18n/texts.js';
import { LOOK_TEXTS } from './look.text.js';
const t = (key: keyof typeof LOOK_TEXTS.en, values?: Record<string, string | number>) => translate(LOOK_TEXTS, key, values);
/** A style's name in the editor's language (an unknown preset keeps its own name). */
const styleName = (key: string) => `s.${key}` in LOOK_TEXTS.en ? t(`s.${key}` as keyof typeof LOOK_TEXTS.en) : THEME_PRESETS[key]?.name ?? key;
import { ExportPalette, ImportPalette } from './palette-dialog.js';

type Colors = FullTheme['colors'];
type ColorName = Exclude<keyof Colors, 'answers'>;
const COLOR_LABELS = { background: 'cBackground', background2: 'cBackground2', surface: 'cSurface', text: 'cText', muted: 'cMuted', accent: 'cAccent', accentText: 'cAccentText', success: 'cSuccess', danger: 'cDanger', answerText: 'cAnswerText' } as const satisfies Record<ColorName, keyof typeof LOOK_TEXTS.en>;
const FONT_KEYS = { system: 'fSystem', rounded: 'fRounded', serif: 'fSerif', slab: 'fSlab', mono: 'fMono', condensed: 'fCondensed', playful: 'fPlayful', elegant: 'fElegant' } as const satisfies Record<FontName, keyof typeof LOOK_TEXTS.en>;
const fontLabel = (font: FontName) => t(FONT_KEYS[font]);
// Each font listed in itself, so the list shows what it looks like.
const fontOptions = () => (Object.keys(FONTS) as FontName[]).map(font => ({ value: font, label: fontLabel(font), style: { fontFamily: FONTS[font] } }));
const BACKGROUND_KEYS = { glow: 'bGlow', gradient: 'bGradient', solid: 'bSolid', dots: 'bDots', stripes: 'bStripes', grid: 'bGrid' } as const;
const TILE_KEYS = { filled: 'tFilled', flat: 'tFlat', outline: 'tOutline', glass: 'tGlass' } as const;


// The marks before each answer: what they are, their shape and place, and what party choices use.
const markChoices = () => [
  { key: 'markers', label: t('marks'), options: { letters: 'A B C', numbers: '1 2 3', shapes: '★ ● ▲', custom: t('markOwn'), none: t('markNone') } },
  { key: 'markerShape', label: t('markShape'), options: { circle: t('circle'), square: t('square'), rounded: t('roundedSquare'), plain: t('plain') } },
  { key: 'markerPlace', label: t('markPlace'), options: { start: t('before'), end: t('after'), top: t('above') } },
  { key: 'routeMarkers', label: t('onChoices'), options: { arrows: t('arrows'), answers: t('sameMarks') } },
] as const;

/** The author's own marks: typed with spaces between them (emoji, letters, short words), up to 8 of up to 12 characters. */
function CustomMarks({ marks, onChange }: { marks: string[]; onChange: (marks: string[]) => void }) {
  const [text, setText] = useState(marks.join(' '));
  // At most 12 characters each, cut between whole characters (never half an emoji).
  const cut = (mark: string) => Array.from(mark).reduce((kept, char) => (kept + char).length <= 12 ? kept + char : kept, '');
  const parse = (value: string) => value.split(/[\s,]+/).filter(Boolean).map(cut).filter(Boolean).slice(0, 8);
  return <label>{t('yourMarks')}<input value={text} maxLength={120} placeholder="🎄 🎁 ⭐ 🔔" onChange={event => { setText(event.target.value); onChange(parse(event.target.value)); }} />
    <span className="hint">{t('yourMarksHint')}</span></label>;
}

/** Readability problems with the current colours, in plain language. */
export function contrastWarnings(theme: FullTheme): string[] {
  const c = theme.colors; const warnings: string[] = [];
  const check = (front: string, back: string, what: string) => { const ratio = contrast(front, back); if (ratio < 4.5) warnings.push(t('hardToRead', { what, ratio: ratio.toFixed(1) })); };
  check(c.text, c.background, t('onBackground')); check(c.text, c.surface, t('onCards')); check(c.muted, c.background, t('quietOnBackground'));
  check(c.accentText, c.accent, t('onButtons'));
  c.answers.forEach((answer, index) => check(c.answerText, answer, t('onAnswer', { letter: String.fromCharCode(65 + index) })));
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
  const presetName = layer.preset && THEME_PRESETS[layer.preset] ? styleName(layer.preset) : t('yourOwn');
  const fonts = full.headingFont === full.font ? fontLabel(full.font) : t('fontsTitles', { font: fontLabel(full.font), titles: fontLabel(full.headingFont) });
  const markName = { letters: 'A B C', numbers: '1 2 3', shapes: t('markShapes'), custom: t('markOwn'), none: t('markNone') }[full.markers];
  return <div className="look-panel">
    <Section title={t('style')} memory="look:style" open summary={presetName}>
      <div className="preset-grid">{Object.entries(THEME_PRESETS).map(([key, preset]) => <button key={key} className={`preset-card${layer.preset === key ? ' on' : ''}`} aria-pressed={layer.preset === key}
        onClick={() => onChange({ preset: key })} style={{ background: `linear-gradient(160deg, ${preset.theme.colors.background}, ${preset.theme.colors.background2})`, color: preset.theme.colors.text, fontFamily: FONTS[preset.theme.headingFont] }}>
        <strong>{styleName(key)}</strong>
        <span className="swatches" aria-hidden="true">{preset.theme.colors.answers.slice(0, 4).map(color => <i key={color} style={{ background: color }} />)}<i style={{ background: preset.theme.colors.accent }} /></span>
      </button>)}</div>
      <p className="hint">{t('styleHint')}</p>
    </Section>

    {warnings.length > 0 && <div className="look-warnings" role="status"><h3>{t('readability')}</h3><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}

    <Section title={t('colours')} memory="look:colours" summary={noAnswers ? t('coloursSummary') : t('answerColoursN', { count: answers.length })}>
      <div className="color-grid">{(Object.keys(COLOR_LABELS) as ColorName[]).filter(name => !noAnswers || name !== 'answerText').map(name => <label key={name} className="color-field">
        <input type="color" value={full.colors[name]} onChange={event => setColor(name, event.target.value)} />{t(COLOR_LABELS[name])}</label>)}</div>
      {!noAnswers && <><p className="field-title">{t('answerColours')}</p>
      <Swatches colors={answers} name={index => t('answerColour', { letter: String.fromCharCode(65 + index) })} removeName={index => t('removeAnswerColour', { letter: String.fromCharCode(65 + index) })}
        onChange={next => setColor('answers', next)} />
      <p className="hint">{t('coloursRepeat')}</p></>}
      {/* Bringing colours in from a brand kit, or taking them out: below the colours they change. */}
      <div className="palette-actions">
        <button type="button" className="small-button" onClick={() => setPalette('import')}>{t('importColours')}</button>
        <button type="button" className="small-button" onClick={() => setPalette('export')}>{t('exportColours')}</button>
      </div>
      {palette === 'import' && <ImportPalette onApply={patch => set({ colors: { ...(layer.colors ?? {}), ...patch } })} onClose={() => setPalette(null)} />}
      {palette === 'export' && <ExportPalette colors={full.colors} title={title} onClose={() => setPalette(null)} />}
    </Section>

    <Section title={t('text')} memory="look:text" summary={`${fonts} · ${Math.round(full.textScale * 100)}%`}>
      <label>{t('font')}<Dropdown value={full.font} onChange={font => set({ font: font as FontName })} options={fontOptions()} /></label>
      <label>{t('titleFont')}<Dropdown value={full.headingFont} onChange={font => set({ headingFont: font as FontName })} options={fontOptions()} /></label>
      <label>{t('textSize', { percent: Math.round(full.textScale * 100) })}<input type="range" min={80} max={160} step={5} value={Math.round(full.textScale * 100)} onChange={event => set({ textScale: Number(event.target.value) / 100 })} /></label>
      <label className="choice"><input type="checkbox" checked={full.uppercaseHeadings} onChange={event => set({ uppercaseHeadings: event.target.checked })} />{t('capitals')}</label>
    </Section>

    <Section title={t('shapes')} memory="look:shapes" summary={`${t(BACKGROUND_KEYS[full.background])}${noAnswers ? '' : ` · ${t(TILE_KEYS[full.tiles])}`}${full.gradients ? t('gradient') : ''}`}>
      <label>{t('roundness', { px: full.radius })}<input type="range" min={0} max={40} value={full.radius} onChange={event => set({ radius: Number(event.target.value) })} /></label>
      <p className="field-title">{t('background')}</p>
      <div className="segmented" role="group" aria-label={t('background')}>{(Object.keys(BACKGROUND_KEYS) as (keyof typeof BACKGROUND_KEYS)[]).map(key => <button key={key} aria-pressed={full.background === key} onClick={() => set({ background: key })}>{t(BACKGROUND_KEYS[key])}</button>)}</div>
      <p className="field-title">{t('backgroundMotion')}</p>
      <div className="segmented" role="group" aria-label={t('backgroundMotion')}>{(['none', 'starlight', 'light-lines'] as const).map(key =>
        <button key={key} type="button" aria-pressed={full.backgroundMotion === key} onClick={() => set({ backgroundMotion: key })}>{t(key === 'none' ? 'motionOff' : key === 'starlight' ? 'motionStars' : 'motionLines')}</button>)}</div>
      {!noAnswers && <><p className="field-title">{t('answerTiles')}</p>
      <div className="segmented" role="group" aria-label={t('answerTiles')}>{(Object.keys(TILE_KEYS) as (keyof typeof TILE_KEYS)[]).map(key => <button key={key} aria-pressed={full.tiles === key} onClick={() => set({ tiles: key })}>{t(TILE_KEYS[key])}</button>)}</div></>}
      <label className="choice"><input type="checkbox" checked={full.gradients} onChange={event => set({ gradients: event.target.checked })} />{t(noAnswers ? 'gradientButton' : 'gradientAll')}</label>
    </Section>

    {!noAnswers && <Section title={t('answerMarks')} memory="look:marks" summary={markName}>
      {markChoices().map(({ key, label, options }) => <div key={key}>
        <p className="field-title">{label}</p>
        <div className="segmented" role="group" aria-label={label}>{Object.entries(options).map(([value, name]) => <button key={value} aria-pressed={full[key] === value} onClick={() => set({ [key]: value })}>{name}</button>)}</div>
        {key === 'markers' && full.markers === 'custom' && <CustomMarks marks={full.customMarks} onChange={customMarks => set({ customMarks })} />}
      </div>)}
      <p className="hint">{t('marksHint')}</p>
    </Section>}
    {theme && <button className="small-button" onClick={() => onChange(undefined)}>{t('removeAll')}</button>}
  </div>;
}

