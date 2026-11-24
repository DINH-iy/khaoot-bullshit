import { contrast, resolveTheme, SLIDER_STYLES, THEME_PRESETS, type FullTheme, type Theme } from '@party/contracts';
import { FontFields, fontLabel } from './font-fields.js';
import { fontCssFamily } from '../../presentation/theme-fonts.js';
import { themeStyle } from '../../presentation/look.js';
import { DialSlider } from '../../ui/dial-slider.js';
import '../../ui/game-slider.css';
import { Section } from '../controls/section.js';
import { Swatches } from '../controls/swatches.js';
import { ColorPicker } from '../../ui/color-picker.js';
import { useId, useRef, useState, type CSSProperties } from 'react';
import { ClockFace } from '../../room/stage-timer.js';
import { translate } from '../../i18n/texts.js';
import { LOOK_TEXTS } from './look.text.js';
const t = (key: keyof typeof LOOK_TEXTS.en, values?: Record<string, string | number>) => translate(LOOK_TEXTS, key, values);
/** A style's name in the editor's language (an unknown preset keeps its own name). */
const styleName = (key: string) => `s.${key}` in LOOK_TEXTS.en ? t(`s.${key}` as keyof typeof LOOK_TEXTS.en) : THEME_PRESETS[key]?.name ?? key;
import { ExportPalette, ImportPalette } from './palette-dialog.js';
import { NewStyleDialog, sameLook, StyleChangeDialog, useSavedStyles } from './saved-styles.js';
import { ConfirmDialog } from '../controls/confirm-dialog.js';
import { Icon } from '../controls/icons.js';
import type { SavedStyle } from '@party/contracts';

/** The card of a style: its backgrounds, title font, answer colours and button colour. */
/** The built-in styles in small groups, so the list stays short; a style not listed here lands in Everyday. */
const STYLE_GROUPS = { everyday: ['party', 'clean', 'elegant', 'pub', 'kids'], bold: ['neon', 'retro', 'terminal'], space: ['space', 'mars', 'saturn', 'neptune', 'ocean'], occasions: ['christmas', 'birthday'], brands: ['mbou'] } as const;
type StyleGroup = 'yours' | keyof typeof STYLE_GROUPS;
const GROUP_NAMES = { yours: 'gYours', everyday: 'gEveryday', bold: 'gBold', space: 'gSpace', occasions: 'gOccasions', brands: 'gBrands' } as const satisfies Record<StyleGroup, keyof typeof LOOK_TEXTS.en>;
const groupOf = (preset: string): keyof typeof STYLE_GROUPS => (Object.keys(STYLE_GROUPS) as (keyof typeof STYLE_GROUPS)[]).find(group => (STYLE_GROUPS[group] as readonly string[]).includes(preset)) ?? 'everyday';
const presetsIn = (group: keyof typeof STYLE_GROUPS) => Object.keys(THEME_PRESETS).filter(key => groupOf(key) === group);

function StyleCard({ name, theme, on, onClick }: { name: string; theme: FullTheme; on: boolean; onClick: () => void }) {
  return <button type="button" className={`preset-card${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}
    style={{ background: `linear-gradient(160deg, ${theme.colors.background}, ${theme.colors.background2})`, color: theme.colors.text, fontFamily: fontCssFamily(theme.headingFont) }}>
    <strong>{name}</strong>
    <span className="swatches" aria-hidden="true">{theme.colors.answers.slice(0, 4).map((color, index) => <i key={`${color}${index}`} style={{ background: color }} />)}<i style={{ background: theme.colors.accent }} /></span>
  </button>;
}

type Colors = FullTheme['colors'];
type ColorName = Exclude<keyof Colors, 'answers'>;
const COLOR_LABELS = { background: 'cBackground', background2: 'cBackground2', surface: 'cSurface', text: 'cText', muted: 'cMuted', accent: 'cAccent', accentText: 'cAccentText', success: 'cSuccess', danger: 'cDanger', answerText: 'cAnswerText' } as const satisfies Record<ColorName, keyof typeof LOOK_TEXTS.en>;
const BACKGROUND_KEYS = { glow: 'bGlow', gradient: 'bGradient', solid: 'bSolid', dots: 'bDots', stripes: 'bStripes', grid: 'bGrid' } as const;
const TILE_KEYS = { filled: 'tFilled', flat: 'tFlat', outline: 'tOutline', glass: 'tGlass' } as const;
const SLIDER_KEYS = { blade: 'sliderBlade', notch: 'sliderNotch', ring: 'sliderRing', dial: 'sliderDial' } as const;
const DEMO_YEARS = Array.from({ length: 501 }, (_, index) => String(1500 + index));

function DialPreview({ colors }: { colors: FullTheme['colors'] }) {
  const id = useId();
  const [value, setValue] = useState(223);
  return <div className="dial-preview" style={{
    '--dial-accent': colors.accent, '--dial-ink': colors.accentText, '--dial-surface': colors.surface,
    '--dial-track': colors.muted, '--dial-label': colors.text, background: colors.surface, color: colors.text,
  } as CSSProperties}>
    <label htmlFor={id} className="visually-hidden">{t('sliderDemo')}</label>
    <DialSlider id={id} labels={DEMO_YEARS} value={value} onChange={setValue} />
  </div>;
}


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
  const saved = useSavedStyles();
  // The style this look is exactly (nothing changed yet): a built-in one, or a saved one.
  const keys = Object.entries(layer).filter(([, value]) => value !== undefined).map(([key]) => key);
  const current: { key: string; name: string; own: SavedStyle | null } | null =
    keys.length === 1 && layer.preset && THEME_PRESETS[layer.preset] ? { key: `preset:${layer.preset}`, name: styleName(layer.preset), own: null }
      : (() => { const own = theme && saved.styles.find(style => sameLook(style.theme, layer)); return own ? { key: `saved:${own.id}`, name: own.name, own } : null; })();
  // What a change to that style does, once asked: also update a saved style (its id), or only change this look (null).
  const [decision, setDecision] = useState<{ key: string; styleId: string | null } | null>(null);
  // A change waiting for the answer; more changes while the question is open join it.
  const [pending, setPending] = useState<Theme | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [removing, setRemoving] = useState<SavedStyle | null>(null);
  const [savedName, setSavedName] = useState(''); const [forked, setForked] = useState('');
  // The group shown: the one picked, else the one holding this look's style (your own styles when it is yours).
  const [group, setGroup] = useState<StyleGroup | null>(null);
  const shownGroup: StyleGroup = group ?? (current?.own ? 'yours' : layer.preset && THEME_PRESETS[layer.preset] ? groupOf(layer.preset) : saved.styles.length ? 'yours' : 'everyday');
  // A change to a built-in style while it becomes a new style of yours: the newest look, applied once it exists.
  const forking = useRef<Theme | null>(null);
  const apply = (next: Theme) => {
    if (forking.current) { forking.current = next; return; }
    if (pending) { setPending(next); return; }
    if (!current) { onChange(next); return; }
    // Built-in styles are never changed: the first change makes a new style of yours (“My Neon night”), and the
    // look follows it. If saving fails (the list is full), this look still changes and the error shows.
    if (!current.own && decision?.key !== current.key) {
      forking.current = next; const base = t('styleCopyName', { name: current.name }).slice(0, 56);
      const taken = new Set(saved.styles.map(style => style.name));
      let name = base; for (let number = 2; taken.has(name); number++) name = `${base} ${number}`;
      void createFrom(name, next).then(id => {
        const look = forking.current ?? next; forking.current = null; onChange(look);
        if (id) { setForked(name); if (look !== next) void saved.save({ id, name, theme: look }, true); }
        else setDecision({ key: current.key, styleId: null });
      });
      return;
    }
    if (decision?.key === current.key) {
      onChange(next);
      if (decision.styleId && current.own) { void saved.save({ id: current.own.id, name: current.own.name, theme: next }, true); setDecision({ key: `saved:${current.own.id}`, styleId: current.own.id }); }
      return;
    }
    setPending(next);
  };
  const set = (patch: Partial<Theme>) => apply({ ...(pending ?? layer), ...patch });
  const setColor = (name: keyof Colors, value: string | string[]) => set({ colors: { ...((pending ?? layer).colors ?? {}), [name]: value } });
  // Picking a style starts afresh: its first change asks again.
  const chooseStyle = (next: Theme | undefined) => { setPending(null); setDecision(null); setSavedName(''); setForked(''); onChange(next); };
  const createFrom = async (name: string, look: Theme) => {
    setBusy(true);
    const id = await saved.create(name, look);
    setBusy(false);
    if (!id) return null;
    setDecision({ key: `saved:${id}`, styleId: id }); setSavedName(name); setGroup('yours');
    return id;
  };
  const answers = full.colors.answers;
  // Every colour of this look, offered in the colour picker for reuse.
  const lookColors = [...answers, ...(Object.keys(COLOR_LABELS) as ColorName[]).map(name => full.colors[name])];
  const warnings = contrastWarnings(full);
  // Small named groups (K4): only the style starts open; each group shows what is set when closed, and stays as it was left.
  const presetName = current?.name ?? (layer.preset && THEME_PRESETS[layer.preset] ? styleName(layer.preset) : t('yourOwn'));
  const fonts = fontCssFamily(full.headingFont) === fontCssFamily(full.font) ? fontLabel(full.font) : t('fontsTitles', { font: fontLabel(full.font), titles: fontLabel(full.headingFont) });
  const markName = { letters: 'A B C', numbers: '1 2 3', shapes: t('markShapes'), custom: t('markOwn'), none: t('markNone') }[full.markers];
  return <div className="look-panel">
    <Section title={t('style')} memory="look:style" open summary={presetName}>
      {/* One group at a time (your own styles, then the built-in ones by kind), so the list stays short. */}
      <div className="segmented style-groups" role="group" aria-label={t('styleGroups')}>{(['yours', ...Object.keys(STYLE_GROUPS)] as StyleGroup[]).map(key =>
        <button key={key} type="button" aria-pressed={shownGroup === key} onClick={() => setGroup(key)}>{t(GROUP_NAMES[key])}</button>)}</div>
      {shownGroup === 'yours' ? <div className="preset-grid">
        {saved.styles.map(style => <div key={style.id} className="saved-style">
          <StyleCard name={style.name} theme={resolveTheme(...below, style.theme)} on={current?.own?.id === style.id} onClick={() => chooseStyle(style.theme)} />
          <button type="button" className="small-button icon-only danger-icon" aria-label={t('styleRemoveLabel', { name: style.name })} title={t('styleRemoveLabel', { name: style.name })}
            onClick={() => setRemoving(style)}><Icon name="trash" size={16} /></button>
        </div>)}
        {/* Saving this look as a new style: a tile like the styles, with a dashed edge. */}
        <button type="button" className="preset-card new-style-card" aria-label={t('styleSaveNew')} title={t('styleSaveNew')} onClick={() => setNaming(true)}><Icon name="plus" size={22} /><span>{t('newStyle')}</span></button>
      </div>
      : <div className="preset-grid">{presetsIn(shownGroup).map(key =>
        <StyleCard key={key} name={styleName(key)} theme={THEME_PRESETS[key]!.theme} on={current?.key === `preset:${key}`} onClick={() => chooseStyle({ preset: key })} />)}</div>}
      {savedName && <p role="status" className="hint">{forked === savedName ? t('styleForked', { name: savedName }) : t('styleSaved', { name: savedName })}</p>}
      {saved.error && <p role="alert" className="error">{t(saved.error)}</p>}
      <p className="hint">{t('styleHint')}</p>
    </Section>

    {warnings.length > 0 && <div className="look-warnings" role="status"><h3>{t('readability')}</h3><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}

    <Section title={t('colours')} memory="look:colours" summary={noAnswers ? t('coloursSummary') : t('answerColoursN', { count: answers.length })}>
      <div className="color-grid">{(Object.keys(COLOR_LABELS) as ColorName[]).filter(name => !noAnswers || name !== 'answerText').map(name =>
        <ColorPicker key={name} className="color-field" value={full.colors[name]} label={t(COLOR_LABELS[name])} suggestions={lookColors} onChange={value => setColor(name, value)}>
          <span className="color-field-text"><span>{t(COLOR_LABELS[name])}</span><code>{full.colors[name].toUpperCase()}</code></span>
        </ColorPicker>)}</div>
      {!noAnswers && <><p className="field-title">{t('answerColours')}</p>
      <Swatches colors={answers} name={index => t('answerColour', { letter: String.fromCharCode(65 + index) })} removeName={index => t('removeAnswerColour', { letter: String.fromCharCode(65 + index) })}
        suggestions={lookColors} onChange={next => setColor('answers', next)} />
      <p className="hint">{t('coloursRepeat')}</p></>}
      {/* Bringing colours in from a brand kit, or taking them out: below the colours they change. */}
      <div className="palette-actions">
        <button type="button" className="small-button" onClick={() => setPalette('import')}>{t('importColours')}</button>
        <button type="button" className="small-button" onClick={() => setPalette('export')}>{t('exportColours')}</button>
      </div>
      {palette === 'import' && <ImportPalette onApply={patch => set({ colors: { ...((pending ?? layer).colors ?? {}), ...patch } })} onClose={() => setPalette(null)} />}
      {palette === 'export' && <ExportPalette colors={full.colors} title={title} onClose={() => setPalette(null)} />}
    </Section>

    <Section title={t('text')} memory="look:text" summary={`${fonts} · ${Math.round(full.textScale * 100)}%`}>
      <FontFields theme={layer} full={full} onChange={set} inherited={below.length
        ? resolveTheme(...below, { ...layer, font: undefined, headingFont: undefined }) : undefined} />
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

    {!noAnswers && <Section title={t('sliders')} memory="look:sliders" summary={t(SLIDER_KEYS[full.sliderStyle])}>
      <div className="preset-grid" role="group" aria-label={t('sliders')} style={themeStyle(full)}>
        {SLIDER_STYLES.map(style => <button key={style} type="button" className="slider-option"
          aria-pressed={full.sliderStyle === style} onClick={() => set({ sliderStyle: style })}>
          <span className={`game-slider slider-${style} slider-sample`} aria-hidden="true" />
          {t(SLIDER_KEYS[style])}
        </button>)}
      </div>
      {full.sliderStyle === 'dial' && <DialPreview colors={full.colors} />}
    </Section>}

    {!noAnswers && <Section title={t('timerTitle')} memory="look:timer" summary={t(full.timerStyle === 'clock' ? 'timerClock' : 'timerDigits')}>
      <div className="segmented" role="group" aria-label={t('timerTitle')}>{(['digits', 'clock'] as const).map(key =>
        <button key={key} type="button" aria-pressed={full.timerStyle === key} onClick={() => set({ timerStyle: key })}>{t(key === 'clock' ? 'timerClock' : 'timerDigits')}</button>)}</div>
      {full.timerStyle === 'clock' && <><p className="field-title">{t('timerTurn')}</p>
        <div className="segmented" role="group" aria-label={t('timerTurn')}>{(['clockwise', 'counterclockwise'] as const).map(key =>
          <button key={key} type="button" aria-pressed={full.timerTurn === key} onClick={() => set({ timerTurn: key })}>{t(key === 'clockwise' ? 'timerClockwise' : 'timerCounter')}</button>)}</div>
        {/* A live example: full, then emptying, then the red end. */}
        <div className="timer-samples room" role="img" aria-label={t('timerSample')} style={themeStyle(full)}>
          {[[20, 20], [14, 20], [3, 20], [0, 20]].map(([left, total]) => <ClockFace key={left} left={left! * 1000} total={total! * 1000} ending={left! <= 5} up={left === 0} clockwise={full.timerTurn !== 'counterclockwise'} />)}</div></>}
      <p className="hint">{t('timerHint')}</p>
    </Section>}

    {!noAnswers && <Section title={t('answerMarks')} memory="look:marks" summary={markName}>
      {markChoices().map(({ key, label, options }) => <div key={key}>
        <p className="field-title">{label}</p>
        <div className="segmented" role="group" aria-label={label}>{Object.entries(options).map(([value, name]) => <button key={value} aria-pressed={full[key] === value} onClick={() => set({ [key]: value })}>{name}</button>)}</div>
        {key === 'markers' && full.markers === 'custom' && <CustomMarks marks={full.customMarks} onChange={customMarks => set({ customMarks })} />}
      </div>)}
      <p className="hint">{t('marksHint')}</p>
    </Section>}
    {theme && <button type="button" className="small-button danger-outline" onClick={() => chooseStyle(undefined)}>{t('removeAll')}</button>}
    {pending && current?.own && <StyleChangeDialog styleName={current.name} busy={busy} error={saved.error ? t(saved.error) : ''}
      onCreate={name => { const look = pending; void createFrom(name, look).then(done => { if (done) { setPending(null); onChange(look); } }); }}
      onUpdate={() => { const look = pending; const own = current.own!; setPending(null); setDecision({ key: `saved:${own.id}`, styleId: own.id });
        void saved.save({ id: own.id, name: own.name, theme: look }); onChange(look); }}
      onCancel={() => setPending(null)} />}
    {naming && <NewStyleDialog error={saved.error ? t(saved.error) : ''} defaultName={current ? t('styleCopyName', { name: current.name }) : t('styleDefaultName')} busy={busy}
      onSave={name => { void createFrom(name, layer).then(done => { if (done) setNaming(false); }); }} onCancel={() => setNaming(false)} />}
    {removing && <ConfirmDialog title={t('styleRemoveAsk', { name: removing.name })} text={t('styleRemoveText')} confirm={t('styleRemoveConfirm')}
      onConfirm={() => { const style = removing; setRemoving(null); void saved.remove(style.id); }} onCancel={() => setRemoving(null)} />}
  </div>;
}

