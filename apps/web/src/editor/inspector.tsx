import { useEffect, useState } from 'react';
import type { DefinitionIssue } from '@party/contracts';
import { MinigameFields } from './minigame-fields.js';
import { DrawingFields } from './drawing-fields.js';
import { cardText, connect, connectProblem, deleteScene, disconnect, isRoute, isVotable, optionsOf, setRouteOptions, uniqueKey, updateStage, type Definition, type Node, type Option, type Stage } from './model.js';

type Change = (next: Definition, group?: string) => void;
const toSeconds = (ms: unknown) => typeof ms === 'number' ? String(Math.round(ms / 1000)) : '';
const toMs = (text: string) => { const value = Number(text); return text.trim() === '' ? null : Number.isFinite(value) ? Math.round(Math.min(3600, Math.max(1, value))) * 1000 : null; };
const points = (milli: unknown) => typeof milli === 'string' ? String(Number(milli) / 1000) : '';
const milli = (text: string) => { const value = Math.round(Number(text)); return Number.isFinite(value) && value >= 0 ? String(value * 1000) : '0'; };
export const sceneName = (definition: Definition, key: string) => { const node = definition.nodes.find(candidate => candidate.key === key); return node ? cardText(definition, node).title : key; };

/** Every field of one part (stage) of a scene. */
export function StageFields({ definition, node, index, onChange }: { definition: Definition; node: Node; index: number; onChange: Change }) {
  const stage = node.stages[index]!; const group = `${node.key}:${index}`;
  const edit = (change: (current: Stage) => Stage, field = '') => onChange(updateStage(definition, node.key, index, change), `${group}:${field}`);
  const input = stage['input'] as { kind?: string; options?: Option[]; items?: Option[]; layout?: string; maxLength?: number; accept?: string[] } | undefined;
  const scoring = stage['scoring'] as { kind?: string; correctChoiceKey?: string; correctOrder?: string[]; awardMilli?: string } | undefined;
  const id = (field: string) => `${node.key}-${index}-${field}`;
  return <div className="stage-fields">
    {stage.kind === 'info' && <label>Title<input value={String(stage.title ?? '')} maxLength={120} onChange={event => edit(current => ({ ...current, title: event.target.value }), 'title')} /></label>}
    <label>{stage.kind === 'info' ? 'Text on every screen' : stage.kind === 'scoreboard' ? 'Heading' : stage.kind === 'route' ? 'Question to the party' : stage.kind === 'minigame' ? 'Title on the screens' : 'Question or instruction'}
      <textarea value={String(stage.prompt ?? '')} maxLength={2000} onChange={event => edit(current => ({ ...current, prompt: event.target.value }), 'prompt')} /></label>
    {!(stage.kind === 'route' && (stage['decide'] as { method?: string }).method === 'host') && stage.kind !== 'scoreboard' &&
      <label>Timer in seconds (empty: no timer)<input type="number" inputMode="numeric" min={1} max={3600} value={toSeconds(stage.durationMs)} onChange={event => edit(current => ({ ...current, durationMs: toMs(event.target.value) }), 'timer')} /></label>}

    {stage.kind === 'collect' && input?.kind === 'choice' && <fieldset><legend>Answer options</legend>
      {(input.options ?? []).map((option, position) => <div key={option.key} className="option-row">
        {scoring?.kind === 'correct-choice' && <input type="radio" name={id('correct')} aria-label={`${option.label} is the correct answer`} checked={scoring.correctChoiceKey === option.key} onChange={() => edit(current => ({ ...current, scoring: { ...scoring, correctChoiceKey: option.key } }))} />}
        <input aria-label={`Answer option ${position + 1}`} value={option.label} maxLength={240} onChange={event => edit(current => ({ ...current, input: { ...input, options: input.options!.map(entry => entry.key === option.key ? { ...entry, label: event.target.value } : entry) } }), `option-${option.key}`)} />
        <button className="small-button" disabled={(input.options ?? []).length <= 2} aria-label={`Remove answer option ${position + 1}`} onClick={() => edit(current => {
          const options = input.options!.filter(entry => entry.key !== option.key);
          return { ...current, input: { ...input, options }, ...(scoring?.kind === 'correct-choice' && scoring.correctChoiceKey === option.key ? { scoring: { ...scoring, correctChoiceKey: options[0]!.key } } : {}) };
        })}>Remove</button></div>)}
      <button className="small-button" disabled={(input.options ?? []).length >= 12} onClick={() => edit(current => ({ ...current, input: { ...input, options: [...input.options!, { key: uniqueKey('answer', input.options!.map(entry => entry.key)), label: 'New answer' }] } }))}>Add answer option</button>
      <label>Show answers as<select value={input.layout ?? 'list'} onChange={event => edit(current => ({ ...current, input: { ...input, layout: event.target.value } }))}><option value="tiles">Tiles</option><option value="list">A list</option></select></label>
      <label>Scoring<select value={scoring?.kind === 'correct-choice' ? 'correct' : 'none'} onChange={event => edit(current => ({ ...current, scoring: event.target.value === 'correct' ? { kind: 'correct-choice', correctChoiceKey: input.options![0]!.key, awardMilli: '10000' } : { kind: 'none' } }))}>
        <option value="correct">One correct answer gives points</option><option value="none">No points (an opinion question)</option></select></label>
      {scoring?.kind === 'correct-choice' && <label>Points for the correct answer<input type="number" min={0} value={points(scoring.awardMilli)} onChange={event => edit(current => ({ ...current, scoring: { ...scoring, awardMilli: milli(event.target.value) } }), 'points')} /></label>}
    </fieldset>}
    {stage.kind === 'collect' && input?.kind === 'order' && <fieldset><legend>Items, in the correct order</legend>
      {(input.items ?? []).map((item, position) => <div key={item.key} className="option-row">
        <span className="order-number">{position + 1}.</span>
        <input aria-label={`Item ${position + 1}`} value={item.label} maxLength={240} onChange={event => edit(current => ({ ...current, input: { ...input, items: input.items!.map(entry => entry.key === item.key ? { ...entry, label: event.target.value } : entry) } }), `item-${item.key}`)} />
        <button className="small-button" aria-label={`Move item ${position + 1} up`} disabled={position === 0} onClick={() => edit(current => { const items = [...input.items!]; [items[position - 1], items[position]] = [items[position]!, items[position - 1]!]; return { ...current, input: { ...input, items }, scoring: { ...scoring, kind: 'correct-order', correctOrder: items.map(entry => entry.key) } }; })}>↑</button>
        <button className="small-button" aria-label={`Remove item ${position + 1}`} disabled={(input.items ?? []).length <= 2} onClick={() => edit(current => { const items = input.items!.filter(entry => entry.key !== item.key); return { ...current, input: { ...input, items }, scoring: { ...scoring, kind: 'correct-order', correctOrder: items.map(entry => entry.key) } }; })}>Remove</button></div>)}
      <button className="small-button" disabled={(input.items ?? []).length >= 8} onClick={() => edit(current => { const items = [...input.items!, { key: uniqueKey('item', input.items!.map(entry => entry.key)), label: 'New item' }]; return { ...current, input: { ...input, items }, scoring: { ...scoring, kind: 'correct-order', correctOrder: items.map(entry => entry.key) } }; })}>Add item</button>
      <p className="hint">Players see the items shuffled. Points only for the exact order.</p>
      {scoring?.kind === 'correct-order' && <label>Points for the correct order<input type="number" min={0} value={points(scoring.awardMilli)} onChange={event => edit(current => ({ ...current, scoring: { ...scoring, awardMilli: milli(event.target.value) } }), 'points')} /></label>}
    </fieldset>}
    {stage.kind === 'collect' && input?.kind === 'text' && <label>Longest answer (characters)<input type="number" min={1} max={2000} value={input.maxLength ?? 240} onChange={event => edit(current => ({ ...current, input: { ...input, maxLength: Math.max(1, Math.min(2000, Math.round(Number(event.target.value) || 1))) } }), 'length')} /></label>}
    {stage.kind === 'collect' && input?.kind === 'media' && <fieldset><legend>Players may upload</legend>{(['image', 'gif', 'video'] as const).map(kind => <label key={kind} className="choice"><input type="checkbox" checked={(input.accept ?? []).includes(kind)}
      disabled={(input.accept ?? []).length === 1 && (input.accept ?? []).includes(kind)}
      onChange={event => edit(current => ({ ...current, input: { ...input, accept: event.target.checked ? [...(input.accept ?? []), kind] : (input.accept ?? []).filter(entry => entry !== kind) } }))} />{{ image: 'Pictures', gif: 'GIFs', video: 'Short videos' }[kind]}</label>)}</fieldset>}
    {stage.kind === 'collect' && input?.kind === 'drawing' && <DrawingFields stage={stage} onChange={(next, field) => edit(() => next, field)} />}
    {stage.kind === 'challenge' && <label>Most points the host can give<input type="number" min={0} value={points(stage['maxAwardMilli'])} onChange={event => edit(current => ({ ...current, maxAwardMilli: milli(event.target.value) }), 'points')} /></label>}
    {stage.kind === 'vote' && <>
      <label>Answers to vote on<select value={`${(stage['source'] as { nodeKey: string }).nodeKey}/${(stage['source'] as { stageKey: string }).stageKey}`}
        onChange={event => { const [nodeKey, stageKey] = event.target.value.split('/'); edit(current => ({ ...current, source: { nodeKey, stageKey } })); }}>
        <option value="choose/main" disabled>Choose a writing or upload round</option>
        {definition.nodes.flatMap(other => other.stages.filter(isVotable).map(source => <option key={`${other.key}/${source.key}`} value={`${other.key}/${source.key}`}>{sceneName(definition, other.key)}{other.stages.length > 1 ? ` (part ${other.stages.indexOf(source) + 1})` : ''}</option>))}</select></label>
      <label>Points per vote received<input type="number" min={0} value={points(stage['awardPerVoteMilli'])} onChange={event => edit(current => ({ ...current, awardPerVoteMilli: milli(event.target.value) }), 'points')} /></label>
    </>}
    {stage.kind === 'scoreboard' && <label>Show<select value={String(stage['show'])} onChange={event => edit(current => ({ ...current, show: event.target.value }))}><option value="players">Player scores</option><option value="teams">Team scores</option><option value="both">Both</option></select></label>}
    {stage.kind === 'minigame' && <MinigameFields definition={definition} node={node} index={index} onChange={onChange} />}
    {stage.kind === 'route' && <RouteFields definition={definition} node={node} stage={stage} onChange={onChange} />}
    {['collect', 'challenge', 'vote', 'minigame'].includes(stage.kind) && <PlayFields definition={definition} node={node} index={index} onChange={onChange} />}
  </div>;
}

/** Solo or teams for one part; empty means it follows the game's setting. */
function PlayFields({ definition, node, index, onChange }: { definition: Definition; node: Node; index: number; onChange: Change }) {
  const stage = node.stages[index]!; const play = stage['play'] as { kind: string; lineup?: { kind: string; form?: Form; carryover?: string }; answers?: string; points?: string } | undefined;
  const mode = !play ? 'game-default' : play.kind === 'solo' ? 'solo' : play.lineup?.kind ?? 'game';
  const set = (next: unknown) => onChange(updateStage(definition, node.key, index, current => { const copy: Stage = { ...current }; if (next === undefined) delete copy['play']; else copy['play'] = next; return copy; }));
  const teamsWith = (lineup: unknown) => ({ kind: 'teams', lineup, answers: play?.answers ?? 'everyone', points: play?.points ?? 'both' });
  const defaultForm: Form = { split: { kind: 'count', teams: 2 }, formation: 'random' };
  return <fieldset><legend>Who plays this</legend>
    <label>Players<select value={mode} onChange={event => {
      const value = event.target.value;
      set(value === 'game-default' ? undefined : value === 'solo' ? { kind: 'solo' } : value === 'game' ? teamsWith({ kind: 'game' })
        : value === 'round' ? teamsWith({ kind: 'round', form: play?.lineup?.form ?? defaultForm }) : teamsWith({ kind: 'reform', form: play?.lineup?.form ?? defaultForm, carryover: 'fresh' }));
    }}>
      <option value="game-default">As the game’s default</option><option value="solo">Everyone for themselves</option><option value="game">The game’s teams</option>
      <option value="round">Teams for this round only</option><option value="reform">New teams from here on</option></select></label>
    {play?.kind === 'teams' && <>
      {(play.lineup?.kind === 'round' || play.lineup?.kind === 'reform') && <FormFields form={play.lineup.form ?? defaultForm} onChange={form => set({ ...play, lineup: { ...play.lineup, form } })} />}
      {play.lineup?.kind === 'reform' && <label>Team scores<select value={play.lineup.carryover} onChange={event => set({ ...play, lineup: { ...play.lineup, carryover: event.target.value } })}>
        <option value="fresh">Start from zero</option><option value="keep">Keep each team’s score</option><option value="members">Add up the members’ scores</option></select></label>}
      <label>Who answers<select value={play.answers} onChange={event => set({ ...play, answers: event.target.value })}><option value="everyone">Everyone</option><option value="captain">One captain per team</option></select></label>
      <label>Points go to<select value={play.points} onChange={event => set({ ...play, points: event.target.value })}><option value="both">The team and each member</option><option value="team">The team</option><option value="members">Each member</option></select></label>
    </>}
  </fieldset>;
}
type Form = { split: { kind: 'count'; teams: number } | { kind: 'sizes'; sizes: (number | 'rest')[] }; formation: string; names?: string[] };
/** How teams are made: a number of teams or exact sizes like "1, rest" or "2, 2"; random, by the host, or by the players. */
export function FormFields({ form, onChange }: { form: Form; onChange: (form: Form) => void }) {
  const sizes = form.split.kind === 'sizes' ? form.split.sizes.join(', ') : '';
  const [text, setText] = useState(sizes); useEffect(() => setText(sizes), [sizes]);
  return <>
    <label>Split<select value={form.split.kind} onChange={event => onChange({ ...form, split: event.target.value === 'count' ? { kind: 'count', teams: 2 } : { kind: 'sizes', sizes: [1, 'rest'] } })}>
      <option value="count">A number of equal teams</option><option value="sizes">Exact team sizes (1 v 3, 2 v 2, 1 v everyone…)</option></select></label>
    {form.split.kind === 'count' ? <label>Number of teams<input type="number" min={2} max={12} value={form.split.teams} onChange={event => onChange({ ...form, split: { kind: 'count', teams: Math.max(2, Math.min(12, Math.round(Number(event.target.value) || 2))) } })} /></label>
      : <label>Team sizes, separated by commas (“rest” takes everyone left)<input value={text} onChange={event => {
        setText(event.target.value);
        const parts = event.target.value.split(',').map(part => part.trim().toLowerCase()).filter(Boolean).map(part => part === 'rest' ? 'rest' as const : Math.round(Number(part)));
        if (parts.length >= 2 && parts.every(part => part === 'rest' || (Number.isInteger(part) && part >= 1 && part <= 50))) onChange({ ...form, split: { kind: 'sizes', sizes: parts } });
      }} /></label>}
    <label>Teams are made<select value={form.formation} onChange={event => onChange({ ...form, formation: event.target.value })}><option value="random">At random</option><option value="host">By the host</option><option value="players">By the players choosing</option></select></label>
    <p className="hint">Whichever you choose, the host sees the teams first and can change them before starting.</p>
  </>;
}

/** Where each output of a scene leads: a keyboard-friendly alternative to dragging arrows. */
export function NextFields({ definition, node, onChange }: { definition: Definition; node: Node; onChange: Change }) {
  const others = definition.nodes.filter(other => other.key !== node.key);
  const nextFor = (option?: string) => definition.edges.find(edge => edge.from === node.key && (option ? edge.option === option : true))?.to ?? '';
  const setNext = (option: string | undefined, to: string) => {
    if (!to) { const edge = definition.edges.find(candidate => candidate.from === node.key && (option ? candidate.option === option : true)); if (edge) onChange(disconnect(definition, edge.key)); return; }
    onChange(connect(definition, node.key, option, to));
  };
  const select = (option: Option | undefined) => <label key={option?.key ?? 'next'}>{option ? `“${option.label}” leads to` : 'Next scene'}
    <select value={nextFor(option?.key)} onChange={event => setNext(option?.key, event.target.value)}>
      <option value="">{option ? 'Not connected yet' : 'Nothing: the game ends here'}</option>
      {others.map(other => { const problem = connectProblem(definition, node.key, option?.key, other.key); return <option key={other.key} value={other.key} disabled={Boolean(problem) && nextFor(option?.key) !== other.key}>{sceneName(definition, other.key)}{problem === 'circle' ? ' (would go round in a circle)' : problem === 'same-scene' ? ' (another option leads there)' : ''}</option>; })}
    </select></label>;
  return <fieldset><legend>Where the game goes next</legend>{isRoute(node) ? optionsOf(node).map(option => select(option)) : select(undefined)}
    <p className="hint">You can also drag from a ● on the card to another scene, or drag an arrow’s end to move it.</p></fieldset>;
}

/** The Flow editor's side panel for one selected scene. */
export function Inspector({ definition, node, problems, onChange, onDelete, onClose, onDuplicate }: { definition: Definition; node: Node; problems: DefinitionIssue[]; onChange: Change; onDelete: (next: Definition) => void; onClose: () => void; onDuplicate?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setConfirming(false), [node.key]);
  const text = cardText(definition, node);
  return <aside className="inspector" aria-labelledby="inspector-heading">
    <div className="inspector-head"><h2 id="inspector-heading">{text.label}</h2><button className="small-button" onClick={onClose}>Close</button></div>
    {node.stages.length > 1 && <p className="hint">This scene has {node.stages.length} parts. This panel edits the first; the Scene editor edits them all.</p>}
    {problems.length > 0 && <div role="alert" className="inspector-problems"><h3>Problems in this scene</h3><ul>{problems.map((issue, position) => <li key={position}>{issue.stageIndex !== null && node.stages.length > 1 ? `Part ${issue.stageIndex + 1}: ` : ''}{issue.message}</li>)}</ul></div>}
    {definition.startNodeKey === node.key ? <p className="start-note">The game starts here.</p> : <button onClick={() => onChange({ ...definition, startNodeKey: node.key })}>Start the game here</button>}
    <StageFields definition={definition} node={node} index={0} onChange={onChange} />
    <NextFields definition={definition} node={node} onChange={onChange} />
    {onDuplicate && <button onClick={onDuplicate}>Duplicate scene</button>}
    {confirming ? <div className="actions"><button className="danger" onClick={() => onDelete(deleteScene(definition, node.key))}>Yes, delete this scene</button><button onClick={() => setConfirming(false)}>Keep it</button></div>
      : <button className="danger-outline" onClick={() => setConfirming(true)}>Delete scene</button>}
  </aside>;
}

function RouteFields({ definition, node, stage, onChange }: { definition: Definition; node: Node; stage: Stage; onChange: Change }) {
  const options = optionsOf(node); const decide = stage['decide'] as { method: string; tie?: string; noVotes?: string; counts?: string };
  const setDecide = (change: Partial<typeof decide>) => onChange(updateStage(definition, node.key, 0, current => {
    const merged = { ...decide, ...change };
    const next: Stage = { ...current, decide: merged.method === 'host' ? { method: 'host' } : { method: merged.method, tie: merged.tie ?? 'random', noVotes: merged.noVotes ?? 'random', counts: merged.counts ?? 'reveal' } };
    if (merged.method === 'host') { next.durationMs = null; delete next['defaultOptionKey']; }
    return next;
  }));
  return <fieldset><legend>Party choice</legend>
    <label>Who decides<select value={decide.method} onChange={event => setDecide({ method: event.target.value })}><option value="players">Everyone votes</option><option value="captains">Team captains vote</option><option value="host">The host decides</option></select></label>
    {decide.method !== 'host' && <>
      <label>On a tie<select value={decide.tie} onChange={event => setDecide({ tie: event.target.value })}><option value="random">A random pick among the tied routes</option><option value="host">The host decides</option></select></label>
      <label>When nobody votes<select value={decide.noVotes} onChange={event => setDecide({ noVotes: event.target.value })}><option value="random">A random route</option><option value="host">The host decides</option></select></label>
      <label>Players see the vote counts<select value={decide.counts} onChange={event => setDecide({ counts: event.target.value })}><option value="reveal">When the route is announced</option><option value="live">Live while voting</option><option value="never">Never</option></select></label>
    </>}
    {options.map((option, position) => <div key={option.key} className="option-row">
      <input aria-label={`Route ${position + 1} name`} value={option.label} maxLength={240} onChange={event => onChange(setRouteOptions(definition, node.key, options.map(entry => entry.key === option.key ? { ...entry, label: event.target.value } : entry)), `${node.key}:route-${option.key}`)} />
      <button className="small-button" disabled={options.length <= 2} aria-label={`Remove route ${position + 1}`} onClick={() => onChange(setRouteOptions(definition, node.key, options.filter(entry => entry.key !== option.key)))}>Remove</button></div>)}
    <button className="small-button" disabled={options.length >= 6} onClick={() => onChange(setRouteOptions(definition, node.key, [...options, { key: uniqueKey('route', options.map(entry => entry.key)), label: `Route ${options.length + 1}` }]))}>Add route</button>
  </fieldset>;
}
