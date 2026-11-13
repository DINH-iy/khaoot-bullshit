import { useRef, useState } from 'react';
import { ANIMATION_PRESETS, DEFAULT_ANIMATIONS, EASINGS, MOMENTS, resolveAnimation, type AnimationChoice, type CustomAnimation, type Moment } from '@party/contracts';
import { play } from '../../presentation/look.js';

type Frame = CustomAnimation['keyframes'][number];
const EASING_LABELS: Record<keyof typeof EASINGS, string> = { smooth: 'Smooth', linear: 'Steady', 'ease-in': 'Speeds up', 'ease-out': 'Slows down', springy: 'Springy (overshoots)', snappy: 'Snappy' };
const LISTS: Moment[] = ['answersEnter', 'reveal', 'scoreboard'];
/** One slider per thing a block can change. The empty state means "keep it as in the block before". */
const PROPERTIES: { key: Exclude<keyof Frame, 'at'>; label: string; min: number; max: number; step: number; rest: number; unit: string }[] = [
  { key: 'opacity', label: 'Visible', min: 0, max: 1, step: .05, rest: 1, unit: '' },
  { key: 'x', label: 'Move sideways', min: -300, max: 300, step: 5, rest: 0, unit: 'px' },
  { key: 'y', label: 'Move up/down', min: -300, max: 300, step: 5, rest: 0, unit: 'px' },
  { key: 'scale', label: 'Size', min: 0, max: 3, step: .05, rest: 1, unit: '×' },
  { key: 'rotate', label: 'Turn', min: -720, max: 720, step: 5, rest: 0, unit: '°' },
  { key: 'blur', label: 'Blur', min: 0, max: 30, step: 1, rest: 0, unit: 'px' },
];

/** A box (or a row of boxes, for lists) that plays an animation on request. */
function Sample({ animation, list }: { animation: CustomAnimation | null; list: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return <div className="anim-sample">
    <div ref={ref} className={`anim-stage${list ? ' list' : ''}`} aria-hidden="true">{list ? [1, 2, 3, 4].map(index => <span key={index} className="tile">{String.fromCharCode(64 + index)}</span>) : <span className="anim-box">Aa</span>}</div>
    <button className="small-button" disabled={!animation} onClick={() => play(ref.current, animation, { staggerChildren: list })}>▶ Play</button>
  </div>;
}

/** For each moment in the game: pick a ready-made animation, or build one from blocks. */
export function AnimationPanel({ animations, below, onChange }: { animations: Record<string, AnimationChoice> | undefined; below: Record<string, AnimationChoice>; onChange: (animations: Record<string, AnimationChoice>) => void }) {
  const current = animations ?? {}; const [open, setOpen] = useState<Moment | null>(null);
  const set = (moment: Moment, choice: AnimationChoice | null) => { const next = { ...current }; if (choice) next[moment] = choice; else delete next[moment]; onChange(next); };
  // Animations built anywhere in this game can be reused for other moments.
  const own = [...Object.values(below), ...Object.values(current)].filter((choice): choice is Extract<AnimationChoice, { custom: CustomAnimation }> => 'custom' in choice)
    .filter((choice, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(choice)) === index);
  return <div className="look-panel">
    <p className="hint">Players who ask their phone for less motion see no animations, whatever you choose here.</p>
    {(Object.keys(MOMENTS) as Moment[]).map(moment => {
      const choice = current[moment] ?? below[moment]; const resolved = resolveAnimation(choice, moment);
      const presetKey = choice && 'preset' in choice ? choice.preset : choice ? null : DEFAULT_ANIMATIONS[moment];
      const list = LISTS.includes(moment);
      return <fieldset key={moment} className="moment"><legend>{MOMENTS[moment]}</legend>
        <div className="moment-row">
          <label className="visually-hidden" htmlFor={`anim-${moment}`}>Animation for: {MOMENTS[moment]}</label>
          <select id={`anim-${moment}`} value={presetKey ? `preset:${presetKey}` : `own:${own.findIndex(entry => JSON.stringify(entry) === JSON.stringify(choice))}`}
            onChange={event => { const [kind, value] = event.target.value.split(':') as [string, string]; set(moment, kind === 'preset' ? (value === DEFAULT_ANIMATIONS[moment] && !below[moment] ? null : { preset: value }) : own[Number(value)]!); }}>
            <optgroup label="Ready-made">{Object.entries(ANIMATION_PRESETS).map(([key, preset]) => <option key={key} value={`preset:${key}`}>{preset.name}{key === DEFAULT_ANIMATIONS[moment] ? ' (standard)' : ''}</option>)}</optgroup>
            {own.length > 0 && <optgroup label="Built in this game">{own.map((entry, index) => <option key={index} value={`own:${index}`}>{entry.name || `My animation ${index + 1}`}</option>)}</optgroup>}
          </select>
          <Sample animation={resolved} list={list} />
          <button className="small-button" aria-expanded={open === moment} onClick={() => setOpen(open === moment ? null : moment)}>{open === moment ? 'Close the builder' : 'Build your own'}</button>
        </div>
        {open === moment && <Builder start={resolved ?? ANIMATION_PRESETS['fade']!.animation!} name={choice && 'custom' in choice ? choice.name ?? '' : ''} list={list}
          onSave={(custom, name) => set(moment, { custom, ...(name ? { name } : {}) })} />}
      </fieldset>;
    })}
  </div>;
}

/** Blocks on a timeline: each block says how things look at that point; the animation moves smoothly between them. */
function Builder({ start, name: startName, list, onSave }: { start: CustomAnimation; name: string; list: boolean; onSave: (animation: CustomAnimation, name: string) => void }) {
  const [draft, setDraft] = useState<CustomAnimation>(start); const [name, setName] = useState(startName);
  const frames = draft.keyframes;
  const setFrame = (index: number, frame: Frame) => setDraft({ ...draft, keyframes: frames.map((entry, at) => at === index ? frame : entry) });
  const addFrame = () => {
    const last = frames.at(-1)!; const before = frames.at(-2) ?? last; const at = Math.min(1, Math.round(((before.at + last.at) / 2) * 100) / 100);
    const keyframes = [...frames.slice(0, -1), { at }, last].sort((a, b) => a.at - b.at); setDraft({ ...draft, keyframes });
  };
  const valid = frames.length >= 2 && frames[0]!.at === 0 && frames.at(-1)!.at === 1 && frames.every((frame, index) => index === 0 || frame.at >= frames[index - 1]!.at);
  return <div className="anim-builder">
    <ol className="frame-list">{frames.map((frame, index) => <li key={index} className="frame-block">
      <div className="frame-head"><strong>{index === 0 ? 'Start' : index === frames.length - 1 ? 'End' : `Step ${index}`}</strong>
        {index > 0 && index < frames.length - 1 && <label>At {Math.round(frame.at * 100)}%<input type="range" min={1} max={99} value={Math.round(frame.at * 100)} onChange={event => setFrame(index, { ...frame, at: Number(event.target.value) / 100 })} /></label>}
        {index > 0 && index < frames.length - 1 && <button className="small-button" onClick={() => setDraft({ ...draft, keyframes: frames.filter((_, at) => at !== index) })}>Remove</button>}</div>
      <div className="frame-props">{PROPERTIES.map(property => {
        const value = frame[property.key]; const used = value !== undefined;
        return <div key={property.key} className={`frame-prop${used ? '' : ' unused'}`}>
          <label className="choice"><input type="checkbox" checked={used} onChange={event => { const next = { ...frame }; if (event.target.checked) next[property.key] = property.rest; else delete next[property.key]; setFrame(index, next); }} />{property.label}</label>
          {used && <label className="visually-hidden-label"><span className="visually-hidden">{property.label} value</span>
            <input type="range" min={property.min} max={property.max} step={property.step} value={value} onChange={event => setFrame(index, { ...frame, [property.key]: Number(event.target.value) })} />
            <output>{property.key === 'opacity' ? `${Math.round(value * 100)}%` : `${value}${property.unit}`}</output></label>}
        </div>;
      })}</div>
    </li>)}</ol>
    <button className="small-button" disabled={frames.length >= 8} onClick={addFrame}>Add a step in between</button>
    <div className="anim-timing">
      <label>Length · {(draft.durationMs / 1000).toFixed(2)} s<input type="range" min={50} max={3000} step={50} value={draft.durationMs} onChange={event => setDraft({ ...draft, durationMs: Number(event.target.value) })} /></label>
      <label>Wait first · {((draft.delayMs ?? 0) / 1000).toFixed(2)} s<input type="range" min={0} max={2000} step={50} value={draft.delayMs ?? 0} onChange={event => setDraft({ ...draft, delayMs: Number(event.target.value) })} /></label>
      <label>Movement<select value={draft.easing} onChange={event => setDraft({ ...draft, easing: event.target.value as keyof typeof EASINGS })}>{(Object.keys(EASINGS) as (keyof typeof EASINGS)[]).map(key => <option key={key} value={key}>{EASING_LABELS[key]}</option>)}</select></label>
      <label>Play it · {draft.repeat ?? 1}×<input type="range" min={1} max={10} value={draft.repeat ?? 1} onChange={event => setDraft({ ...draft, repeat: Number(event.target.value) })} /></label>
      {list && <label>Between items · {((draft.staggerMs ?? 0) / 1000).toFixed(2)} s<input type="range" min={0} max={500} step={10} value={draft.staggerMs ?? 0} onChange={event => setDraft({ ...draft, staggerMs: Number(event.target.value) })} /></label>}
      <label>Name<input value={name} maxLength={60} placeholder="My animation" onChange={event => setName(event.target.value)} /></label>
    </div>
    <div className="actions"><Sample animation={valid ? draft : null} list={list} />
      <button className="accent" disabled={!valid} onClick={() => onSave(draft, name.trim())}>Use this animation</button></div>
  </div>;
}
