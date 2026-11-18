import { useState } from 'react';
import { AWARD_RULES as RULES, FINALE_STATS, resolveTheme, TEXT_DEFAULTS, type AwardRule, type FinaleStat, type TextKey } from '@party/contracts';
import { Segmented } from '../controls/segmented.js';
import { layerOf } from '../look/layer.js';
import { WheelTest } from './wheel-test.js';
import { uniqueKey, updateStage, type Definition, type Node, type Stage } from '../model.js';
import { Section } from '../controls/section.js';
import { ChoiceDialog } from '../controls/choice-dialog.js';
import { Dropdown } from '../controls/dropdown.js';
import { Swatches } from '../controls/swatches.js';
import { Icon } from '../controls/icons.js';

type Change = (next: Definition, group?: string) => void;
interface Wheel { key: string; title: string; entries: { key: string; label: string }[]; removePicked: boolean; spinSeconds: number; colors?: string[] }
const wheelsOf = (definition: Definition) => (definition['wheels'] as Wheel[] | undefined) ?? [];
const withWheels = (definition: Definition, wheels: Wheel[]): Definition => { const next = { ...definition }; if (wheels.length) next['wheels'] = wheels; else delete next['wheels']; return next; };

/** Wheels of fortune for this game: entries, whether a picked entry leaves the wheel, and how long it spins. */
export function WheelSettings({ definition, onChange, problems = [] }: { definition: Definition; onChange: Change; problems?: string[] }) {
  const wheels = wheelsOf(definition);
  const set = (key: string, change: (wheel: Wheel) => Wheel, field: string) => onChange(withWheels(definition, wheels.map(wheel => wheel.key === key ? change(wheel) : wheel)), `wheel:${key}:${field}`);
  const remove = (key: string) => onChange({ ...withWheels(definition, wheels.filter(wheel => wheel.key !== key)),
    // Scenes that spun this wheel no longer spin anything.
    nodes: definition.nodes.map(node => ({ ...node, stages: node.stages.map(stage => { if ((stage['spin'] as { wheel?: string } | undefined)?.wheel !== key) return stage; const copy = { ...stage }; delete copy['spin']; return copy; }) })) });
  return <Section title="Wheels of fortune" problems={problems} summary={wheels.length ? wheels.map(wheel => wheel.title).join(', ') : 'None'}>
    <p className="hint">Add a Wheel of fortune scene to spin one during the game. All the game’s wheels are here; the result stays in a corner of the shared screen until the next spin.</p>
    {wheels.map(wheel => <fieldset key={wheel.key} className="wheel-fields"><legend>{wheel.title}</legend>
      <WheelFields definition={definition} wheel={wheel} set={(change, field) => set(wheel.key, change, field)} onRemove={() => remove(wheel.key)} />
    </fieldset>)}
    <button className="small-button" disabled={wheels.length >= 10} onClick={() => onChange(withWheels(definition, [...wheels, { key: uniqueKey('wheel', wheels.map(wheel => wheel.key)), title: `Wheel ${wheels.length + 1}`, removePicked: true, spinSeconds: 5,
      entries: [{ key: 'entry-1', label: 'Sing a song' }, { key: 'entry-2', label: 'Do 10 push-ups' }, { key: 'entry-3', label: 'Tell a joke' }] }]))}>+ Wheel</button>
  </Section>;
}

/** One wheel's name, entries, whether a picked entry leaves the wheel, its spin time, its colours, and a test spin. */
function WheelFields({ definition, wheel, set, onRemove }: { definition: Definition; wheel: Wheel; set: (change: (wheel: Wheel) => Wheel, field: string) => void; onRemove?: () => void }) {
  const [testing, setTesting] = useState(false);
  // Without its own colours a wheel uses the game's answer colours (the look's), which are also where own colours start.
  const gameColors = resolveTheme(layerOf(definition, { kind: 'game' }).theme).colors.answers;
  const colors = wheel.colors;
  const setColors = (next: string[] | undefined) => set(current => { const copy = { ...current }; if (next) copy.colors = next; else delete copy.colors; return copy; }, 'colors');
  return <>
    <label>Name<input value={wheel.title} maxLength={80} onChange={event => set(current => ({ ...current, title: event.target.value }), 'title')} /></label>
    <p className="field-title">Entries</p>
    {wheel.entries.map((entry, position) => <div key={entry.key} className="option-row">
      <input aria-label={`Entry ${position + 1} of ${wheel.title}`} value={entry.label} maxLength={80} onChange={event => set(current => ({ ...current, entries: current.entries.map(item => item.key === entry.key ? { ...item, label: event.target.value } : item) }), `entry-${entry.key}`)} />
      <button className="icon-button" disabled={wheel.entries.length <= 2} aria-label={`Remove entry ${position + 1} of ${wheel.title}`} onClick={() => set(current => ({ ...current, entries: current.entries.filter(item => item.key !== entry.key) }), 'entries')}>×</button></div>)}
    <button className="small-button" disabled={wheel.entries.length >= 40} onClick={() => set(current => ({ ...current, entries: [...current.entries, { key: uniqueKey('entry', current.entries.map(item => item.key)), label: 'New entry' }] }), 'entries')}>+ Entry</button>
    <label className="choice"><input type="checkbox" checked={wheel.removePicked} onChange={event => set(current => ({ ...current, removePicked: event.target.checked }), 'remove')} />Take a picked entry off the wheel</label>
    <label className="ed-inline">Spin time<span className="ed-unit"><input type="number" min={2} max={15} value={wheel.spinSeconds} onChange={event => set(current => ({ ...current, spinSeconds: Math.round(Math.min(15, Math.max(2, Number(event.target.value) || 2))) }), 'seconds')} />sec</span></label>
    <Segmented label="Slice colours" value={colors ? 'own' : 'game'} choices={[{ value: 'game', label: 'The game’s answer colours' }, { value: 'own', label: 'Its own colours' }]}
      onChange={value => setColors(value === 'own' ? gameColors.slice(0, Math.max(2, Math.min(8, gameColors.length))) : undefined)} />
    {colors && <Swatches colors={colors} name={position => `Slice colour ${position + 1} of ${wheel.title}`} removeName={position => `Remove slice colour ${position + 1}`} addName="Add a slice colour" onChange={setColors} />}
    {/* The wheel's actions side by side: try it, and (in Game settings) remove it. */}
    <div className="wheel-actions">
      <button type="button" className="small-button with-icon" onClick={() => setTesting(true)}><Icon name="play" size={14} />Test spin…</button>
      {onRemove && <button type="button" className="small-button icon-only danger-icon" aria-label={`Remove ${wheel.title || 'this wheel'}`} title="Remove this wheel" onClick={onRemove}><Icon name="trash" size={18} /></button>}
    </div>
    {testing && <WheelTest definition={definition} wheel={wheel} onClose={() => setTesting(false)} />}
  </>;
}

/** A Wheel of fortune scene: the wheel the host spins here, edited right in the scene. */
export function WheelOfScene({ definition, stage, onChange }: { definition: Definition; stage: Stage; onChange: Change }) {
  const wheels = wheelsOf(definition); const key = (stage['spin'] as { wheel?: string } | undefined)?.wheel;
  const wheel = wheels.find(entry => entry.key === key);
  if (!wheel) return <p className="hint warn">This scene’s wheel is missing. Add one under Game settings → Wheels of fortune.</p>;
  return <fieldset className="wheel-fields"><legend>The wheel</legend>
    <WheelFields definition={definition} wheel={wheel} set={(change, field) => onChange(withWheels(definition, wheels.map(entry => entry.key === wheel.key ? change(entry) : entry)), `wheel:${wheel.key}:${field}`)} />
    <p className="hint">The host spins it on this scene; the result stays in a corner of the shared screen until the next spin.</p>
  </fieldset>;
}

/** On a scene: spin one of the game's wheels here, or stop showing the last result. */
export function SpinFields({ definition, node, index, onChange }: { definition: Definition; node: Node; index: number; onChange: Change }) {
  const wheels = wheelsOf(definition); const stage = node.stages[index]!; const spin = (stage['spin'] as { wheel?: string } | undefined)?.wheel ?? '';
  if (!wheels.length) return null;
  const edit = (change: (current: Stage) => Stage) => onChange(updateStage(definition, node.key, index, change));
  return <fieldset><legend>Wheel of fortune</legend>
    <label>On this scene<Dropdown value={spin} onChange={wheel => edit(current => { const copy = { ...current }; if (wheel) copy['spin'] = { wheel }; else delete copy['spin']; return copy; })}
      options={[{ value: '', label: 'No wheel' }, ...wheels.map(wheel => ({ value: wheel.key, label: `The host spins “${wheel.title}”` }))]} /></label>
    <label className="choice"><input type="checkbox" checked={Boolean(stage['wheelClear'])} onChange={event => edit(current => { const copy = { ...current }; if (event.target.checked) copy['wheelClear'] = true; else delete copy['wheelClear']; return copy; })} />
      Stop showing the last wheel result from this scene on</label>
  </fieldset>;
}

// How each award is decided (as the server works it out), for the add-an-award popup.
const AWARD_RULES: Record<AwardRule, string> = {
  winner: 'The most points at the end.',
  mostCorrect: 'The most right answers in quiz and ordering rounds.',
  mostWrong: 'The most wrong answers in quiz and ordering rounds.',
  fastest: 'Quickest on average in rounds with a right answer (at least two answers).',
  slowest: 'Slowest on average in rounds with a right answer (at least two answers).',
  mostVotes: 'The most votes for their answers in vote scenes.',
  minigameChamp: 'Won the most minigames played solo.',
  luckiest: 'The most points from Lucky doors.',
  mostReactions: 'Sent the most reactions during the game.',
  scene: 'The most points in one scene you choose (can be added more than once).',
  fewest: 'The wooden spoon: the fewest points at the end.',
};
interface Award { rule: AwardRule; title?: string; nodeKey?: string }
/**
 * The end-of-game show: which awards appear, in which order, each with its own title if
 * wanted; "best in one scene" names its scene. Awards without anything to show are skipped
 * by themselves. Older games keep a plain list of rules; it becomes this list when edited.
 */
export function FinaleSettings({ definition, onChange, problems = [] }: { definition: Definition; onChange: Change; problems?: string[] }) {
  const finale = definition['finale'] as { stats?: FinaleStat[]; awards?: Award[] } | undefined;
  const chosen: Award[] = finale?.awards ?? (finale?.stats ?? [...FINALE_STATS]).map(rule => ({ rule }));
  const set = (awards: Award[], field = 'finale') => onChange({ ...definition, finale: { awards } }, field);
  const standard = (rule: AwardRule) => TEXT_DEFAULTS[`stat.${rule}` as TextKey];
  const shown = (award: Award) => award.title || standard(award.rule);
  const update = (position: number, change: Partial<Award>) => set(chosen.map((award, at) => { if (at !== position) return award; const next = { ...award, ...change }; if (!next.title) delete next.title; return next; }), `finale:${position}`);
  // Each statistic once; "best in one scene" as often as wanted.
  const available = RULES.filter(rule => rule === 'scene' || !chosen.some(award => award.rule === rule)); const [picking, setPicking] = useState(false);
  const scenes = definition.nodes.map(node => ({ value: node.key, label: sceneLabel(definition, node.key) }));
  return <Section title="End-of-game awards" problems={problems} summary={chosen.length ? `${chosen.length} awards` : 'None'}>
    <p className="hint">After the last scene, the screens show these awards one by one. Pick the ones you want, put them in order, and give them your own title if you like.</p>
    <ol className="award-list">{chosen.map((award, position) => <li key={position}>
      <div className="award-main">
        <input aria-label={`Title of award ${position + 1}`} value={award.title ?? ''} placeholder={standard(award.rule)} maxLength={60} onChange={event => update(position, { title: event.target.value })} />
        <small>{award.rule === 'scene' ? 'Most points in:' : AWARD_RULES[award.rule]}</small>
        {award.rule === 'scene' && <label className="visually-hidden-label"><span className="visually-hidden">Scene of award {position + 1}</span><Dropdown value={award.nodeKey ?? ''} placeholder="Choose a scene" options={scenes} onChange={nodeKey => update(position, { nodeKey })} /></label>}
      </div>
      <button className="icon-button" aria-label={`Move ${shown(award)} up`} disabled={position === 0} onClick={() => { const next = [...chosen]; [next[position - 1], next[position]] = [next[position]!, next[position - 1]!]; set(next); }}>↑</button>
      <button className="icon-button" aria-label={`Remove ${shown(award)}`} onClick={() => set(chosen.filter((_, at) => at !== position))}>×</button></li>)}</ol>
    {chosen.length === 0 && <p className="hint">No awards: the game ends with the final scores only.</p>}
    {available.length > 0 && chosen.length < 16 && <button type="button" className="small-button" onClick={() => setPicking(true)}>Add an award…</button>}
    {picking && <ChoiceDialog title="Add an award" intro="It is added at the end of the list; move it up to show it earlier." choices={available.map(rule => ({ value: rule, label: standard(rule), description: AWARD_RULES[rule], icon: 'scoreboard' }))}
      onPick={rule => { setPicking(false); const first = definition.nodes[0]?.key; set([...chosen, rule === 'scene' && first ? { rule: 'scene', nodeKey: first } : { rule: rule as AwardRule }]); }} onClose={() => setPicking(false)} />}
  </Section>;
}
// A scene's name for the award's scene list.
function sceneLabel(definition: Definition, key: string) {
  const node = definition.nodes.find(entry => entry.key === key); const stage = node?.stages[0];
  const text = String(stage?.title ?? stage?.prompt ?? key); return text.length > 50 ? `${text.slice(0, 48)}…` : text;
}
