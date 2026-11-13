import { FINALE_STATS, TEXT_DEFAULTS, type FinaleStat, type TextKey } from '@party/contracts';
import { uniqueKey, updateStage, type Definition, type Node, type Stage } from './model.js';

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
  return <details className="game-settings" open={wheels.length > 0}><summary>Wheels of fortune</summary>
    <p className="hint">Make a wheel here, then choose on a scene that the host spins it there. The result stays in a corner of the shared screen until the next spin: handy for challenges or forfeits.</p>
    {wheels.map(wheel => <fieldset key={wheel.key} className="wheel-fields"><legend>{wheel.title}</legend>
      <label>Name<input value={wheel.title} maxLength={80} onChange={event => set(wheel.key, current => ({ ...current, title: event.target.value }), 'title')} /></label>
      {wheel.entries.map((entry, position) => <div key={entry.key} className="option-row">
        <input aria-label={`Entry ${position + 1} of ${wheel.title}`} value={entry.label} maxLength={80} onChange={event => set(wheel.key, current => ({ ...current, entries: current.entries.map(item => item.key === entry.key ? { ...item, label: event.target.value } : item) }), `entry-${entry.key}`)} />
        <button className="small-button" disabled={wheel.entries.length <= 2} aria-label={`Remove entry ${position + 1} of ${wheel.title}`} onClick={() => set(wheel.key, current => ({ ...current, entries: current.entries.filter(item => item.key !== entry.key) }), 'entries')}>Remove</button></div>)}
      <button className="small-button" disabled={wheel.entries.length >= 40} onClick={() => set(wheel.key, current => ({ ...current, entries: [...current.entries, { key: uniqueKey('entry', current.entries.map(item => item.key)), label: 'New entry' }] }), 'entries')}>Add an entry</button>
      <label className="choice"><input type="checkbox" checked={wheel.removePicked} onChange={event => set(wheel.key, current => ({ ...current, removePicked: event.target.checked }), 'remove')} />Take a picked entry off the wheel (it starts over when all are used)</label>
      <label>Spin time (seconds)<input type="number" min={2} max={15} value={wheel.spinSeconds} onChange={event => set(wheel.key, current => ({ ...current, spinSeconds: Math.round(Math.min(15, Math.max(2, Number(event.target.value) || 2))) }), 'seconds')} /></label>
      <button className="small-button danger-outline" onClick={() => remove(wheel.key)}>Remove this wheel</button>
    </fieldset>)}
    <button className="small-button" disabled={wheels.length >= 10} onClick={() => onChange(withWheels(definition, [...wheels, { key: uniqueKey('wheel', wheels.map(wheel => wheel.key)), title: `Wheel ${wheels.length + 1}`, removePicked: true, spinSeconds: 5,
      entries: [{ key: 'entry-1', label: 'Sing a song' }, { key: 'entry-2', label: 'Do 10 push-ups' }, { key: 'entry-3', label: 'Tell a joke' }] }]))}>Add a wheel</button>
  </details>;
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
  return <details className="game-settings"><summary>End-of-game awards</summary>
    <p className="hint">After the last scene, the screens show these awards one by one. Pick the ones you want and put them in order. Their titles can be changed under Look &amp; feel → Texts.</p>
    <ol className="part-list">{chosen.map((stat, position) => <li key={stat}><span>{name(stat)}</span>
      <button className="small-button" aria-label={`Move ${name(stat)} up`} disabled={position === 0} onClick={() => { const next = [...chosen]; [next[position - 1], next[position]] = [next[position]!, next[position - 1]!]; set(next); }}>↑</button>
      <button className="small-button" aria-label={`Remove ${name(stat)}`} onClick={() => set(chosen.filter(entry => entry !== stat))}>Remove</button></li>)}</ol>
    {chosen.length === 0 && <p className="hint">No awards: the game ends with the final scores only.</p>}
    {available.length > 0 && <label>Add an award<select value="" onChange={event => { if (event.target.value) set([...chosen, event.target.value as FinaleStat]); }}>
      <option value="">Choose…</option>{available.map(stat => <option key={stat} value={stat}>{name(stat)}</option>)}</select></label>}
  </details>;
}
