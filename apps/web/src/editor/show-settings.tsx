import { FINALE_STATS, TEXT_DEFAULTS, type FinaleStat, type TextKey } from '@party/contracts';
import { uniqueKey, updateStage, type Definition, type Node, type Stage } from './model.js';
import { Section } from './section.js';

type Change = (next: Definition, group?: string) => void;
interface Wheel { key: string; title: string; entries: { key: string; label: string }[]; removePicked: boolean; spinSeconds: number }
const wheelsOf = (definition: Definition) => (definition['wheels'] as Wheel[] | undefined) ?? [];
const withWheels = (definition: Definition, wheels: Wheel[]): Definition => { const next = { ...definition }; if (wheels.length) next['wheels'] = wheels; else delete next['wheels']; return next; };

/** Wheels of fortune for this game: entries, whether a picked entry leaves the wheel, and how long it spins. */
export function WheelSettings({ definition, onChange }: { definition: Definition; onChange: Change }) {
  const wheels = wheelsOf(definition);
  const set = (key: string, change: (wheel: Wheel) => Wheel, field: string) => onChange(withWheels(definition, wheels.map(wheel => wheel.key === key ? change(wheel) : wheel)), `wheel:${key}:${field}`);
  const remove = (key: string) => onChange({ ...withWheels(definition, wheels.filter(wheel => wheel.key !== key)),
    // Scenes that spun this wheel no longer spin anything.
    nodes: definition.nodes.map(node => ({ ...node, stages: node.stages.map(stage => { if ((stage['spin'] as { wheel?: string } | undefined)?.wheel !== key) return stage; const copy = { ...stage }; delete copy['spin']; return copy; }) })) });
  return <Section title="Wheels of fortune" summary={wheels.length ? wheels.map(wheel => wheel.title).join(', ') : 'None'}>
    <p className="hint">Add a Wheel of fortune scene to spin one during the game. All the game’s wheels are here; the result stays in a corner of the shared screen until the next spin.</p>
    {wheels.map(wheel => <fieldset key={wheel.key} className="wheel-fields"><legend>{wheel.title}</legend>
      <WheelFields wheel={wheel} set={(change, field) => set(wheel.key, change, field)} />
      <button className="small-button danger-outline" onClick={() => remove(wheel.key)}>Remove this wheel</button>
    </fieldset>)}
    <button className="small-button" disabled={wheels.length >= 10} onClick={() => onChange(withWheels(definition, [...wheels, { key: uniqueKey('wheel', wheels.map(wheel => wheel.key)), title: `Wheel ${wheels.length + 1}`, removePicked: true, spinSeconds: 5,
      entries: [{ key: 'entry-1', label: 'Sing a song' }, { key: 'entry-2', label: 'Do 10 push-ups' }, { key: 'entry-3', label: 'Tell a joke' }] }]))}>+ Wheel</button>
  </Section>;
}

/** One wheel's name, entries, whether a picked entry leaves the wheel, and its spin time. */
function WheelFields({ wheel, set }: { wheel: Wheel; set: (change: (wheel: Wheel) => Wheel, field: string) => void }) {
  return <>
    <label>Name<input value={wheel.title} maxLength={80} onChange={event => set(current => ({ ...current, title: event.target.value }), 'title')} /></label>
    <p className="field-title">Entries</p>
    {wheel.entries.map((entry, position) => <div key={entry.key} className="option-row">
      <input aria-label={`Entry ${position + 1} of ${wheel.title}`} value={entry.label} maxLength={80} onChange={event => set(current => ({ ...current, entries: current.entries.map(item => item.key === entry.key ? { ...item, label: event.target.value } : item) }), `entry-${entry.key}`)} />
      <button className="icon-button" disabled={wheel.entries.length <= 2} aria-label={`Remove entry ${position + 1} of ${wheel.title}`} onClick={() => set(current => ({ ...current, entries: current.entries.filter(item => item.key !== entry.key) }), 'entries')}>×</button></div>)}
    <button className="small-button" disabled={wheel.entries.length >= 40} onClick={() => set(current => ({ ...current, entries: [...current.entries, { key: uniqueKey('entry', current.entries.map(item => item.key)), label: 'New entry' }] }), 'entries')}>+ Entry</button>
    <label className="choice"><input type="checkbox" checked={wheel.removePicked} onChange={event => set(current => ({ ...current, removePicked: event.target.checked }), 'remove')} />Take a picked entry off the wheel</label>
    <label className="ed-inline">Spin time<span className="ed-unit"><input type="number" min={2} max={15} value={wheel.spinSeconds} onChange={event => set(current => ({ ...current, spinSeconds: Math.round(Math.min(15, Math.max(2, Number(event.target.value) || 2))) }), 'seconds')} />sec</span></label>
  </>;
}

/** A Wheel of fortune scene: the wheel the host spins here, edited right in the scene. */
export function WheelOfScene({ definition, stage, onChange }: { definition: Definition; stage: Stage; onChange: Change }) {
  const wheels = wheelsOf(definition); const key = (stage['spin'] as { wheel?: string } | undefined)?.wheel;
  const wheel = wheels.find(entry => entry.key === key);
  if (!wheel) return <p className="hint warn">This scene’s wheel is missing. Add one under Game settings → Wheels of fortune.</p>;
  return <fieldset className="wheel-fields"><legend>The wheel</legend>
    <WheelFields wheel={wheel} set={(change, field) => onChange(withWheels(definition, wheels.map(entry => entry.key === wheel.key ? change(entry) : entry)), `wheel:${wheel.key}:${field}`)} />
    <p className="hint">The host spins it on this scene; the result stays in a corner of the shared screen until the next spin.</p>
  </fieldset>;
}

/** On a scene: spin one of the game's wheels here, or stop showing the last result. */
export function SpinFields({ definition, node, index, onChange }: { definition: Definition; node: Node; index: number; onChange: Change }) {
  const wheels = wheelsOf(definition); const stage = node.stages[index]!; const spin = (stage['spin'] as { wheel?: string } | undefined)?.wheel ?? '';
  if (!wheels.length) return null;
  const edit = (change: (current: Stage) => Stage) => onChange(updateStage(definition, node.key, index, change));
  return <fieldset><legend>Wheel of fortune</legend>
    <label>On this scene<select value={spin} onChange={event => edit(current => { const copy = { ...current }; if (event.target.value) copy['spin'] = { wheel: event.target.value }; else delete copy['spin']; return copy; })}>
      <option value="">No wheel</option>{wheels.map(wheel => <option key={wheel.key} value={wheel.key}>The host spins “{wheel.title}”</option>)}</select></label>
    <label className="choice"><input type="checkbox" checked={Boolean(stage['wheelClear'])} onChange={event => edit(current => { const copy = { ...current }; if (event.target.checked) copy['wheelClear'] = true; else delete copy['wheelClear']; return copy; })} />
      Stop showing the last wheel result from this scene on</label>
  </fieldset>;
}

/** The end-of-game show: which awards appear, and in which order. Awards without anything to show are skipped by themselves. */
export function FinaleSettings({ definition, onChange }: { definition: Definition; onChange: Change }) {
  const chosen = ((definition['finale'] as { stats?: FinaleStat[] } | undefined)?.stats) ?? [...FINALE_STATS];
  const set = (stats: FinaleStat[]) => onChange({ ...definition, finale: { stats } }, 'finale');
  const name = (stat: FinaleStat) => TEXT_DEFAULTS[`stat.${stat}` as TextKey];
  const available = FINALE_STATS.filter(stat => !chosen.includes(stat));
  return <Section title="End-of-game awards" summary={chosen.length ? `${chosen.length} awards` : 'None'}>
    <p className="hint">After the last scene, the screens show these awards one by one. Pick the ones you want and put them in order. Their titles can be changed under Look &amp; feel → Texts.</p>
    <ol className="part-list">{chosen.map((stat, position) => <li key={stat}><span>{name(stat)}</span>
      <button className="icon-button" aria-label={`Move ${name(stat)} up`} disabled={position === 0} onClick={() => { const next = [...chosen]; [next[position - 1], next[position]] = [next[position]!, next[position - 1]!]; set(next); }}>↑</button>
      <button className="icon-button" aria-label={`Remove ${name(stat)}`} onClick={() => set(chosen.filter(entry => entry !== stat))}>×</button></li>)}</ol>
    {chosen.length === 0 && <p className="hint">No awards: the game ends with the final scores only.</p>}
    {available.length > 0 && <label>Add an award<select value="" onChange={event => { if (event.target.value) set([...chosen, event.target.value as FinaleStat]); }}>
      <option value="">Choose…</option>{available.map(stat => <option key={stat} value={stat}>{name(stat)}</option>)}</select></label>}
  </Section>;
}
