import { useEffect, useState } from 'react';
import { placePoints, PlacesSchema, type DefinitionIssue, type Places, type PrefabContent } from '@party/contracts';
import { Section } from '../controls/section.js';
import { ActionMenu, type MenuAction } from '../controls/action-menu.js';
import { ConfirmDialog } from '../controls/confirm-dialog.js';
import { SavePrefab } from '../flow/save-prefab.js';
import { Segmented } from '../controls/segmented.js';
import { Dropdown } from '../controls/dropdown.js';
import { Icon, sceneIcon } from '../controls/icons.js';
import { WheelOfScene } from '../shell/show-settings.js';
import { PlacesFields } from './fields/places-fields.js';
import { MinigameFields } from './fields/minigame-fields.js';
import { DrawingFields } from './fields/drawing-fields.js';
import { DuelFields } from './fields/duel-fields.js';
import { isWheelScene, cardText, connect, connectProblem, deleteScene, disconnect, isRoute, isVotable, optionsOf, QUIZ_KINDS, quizKind, setRouteOptions, uniqueKey, updateStage, withQuizKind, type Definition, type Node, type Option, type Stage } from '../model.js';

type Change = (next: Definition, group?: string) => void;
const toSeconds = (ms: unknown) => typeof ms === 'number' ? String(Math.round(ms / 1000)) : '';
const toMs = (text: string) => { const value = Number(text); return text.trim() === '' ? null : Number.isFinite(value) ? Math.round(Math.min(3600, Math.max(1, value))) * 1000 : null; };
const points = (milli: unknown) => typeof milli === 'string' ? String(Number(milli) / 1000) : '';
const milli = (text: string) => { const value = Math.round(Number(text)); return Number.isFinite(value) && value >= 0 ? String(value * 1000) : '0'; };
export const sceneName = (definition: Definition, key: string) => { const node = definition.nodes.find(candidate => candidate.key === key); return node ? cardText(definition, node).title : key; };

/** What the Points group says when closed: the main points and, when set, the points by place. */
function pointsSummary(stage: Stage): string {
  const placesOf = (value: unknown) => { const parsed = PlacesSchema.safeParse(value); return parsed.success ? placePoints(parsed.data).map(entry => Number(entry) / 1000).join('/') : null; };
  const scoring = stage['scoring'] as { kind?: string; awardMilli?: string; places?: unknown } | undefined;
  const withPlaces = (main: string, value: unknown, label: string) => { const list = placesOf(value); return list ? `${main} · ${label} ${list}` : main; };
  if (stage.kind === 'collect') return scoring?.kind === 'none' || !scoring ? 'No points' : withPlaces(`${points(scoring.awardMilli)} points`, scoring.places, 'fastest');
  if (stage.kind === 'challenge') return withPlaces(`Up to ${points(stage['maxAwardMilli'])}`, stage['places'], 'places');
  if (stage.kind === 'vote') return withPlaces(`${points(stage['awardPerVoteMilli'])} per vote`, stage['places'], 'most votes');
  if (stage.kind === 'minigame') return `Places ${placesOf(stage['places']) ?? ((stage['placementMilli'] as string[] | undefined) ?? ['10000', '6000', '3000']).map(entry => Number(entry) / 1000).join('/')}`;
  if (stage.kind === 'duel') return `Winner ${placesOf(stage['places'])?.split('/')[0] ?? '10'} · right bet ${points(stage['betMilli'])}`;
  return '';
}
/** What the Who plays group says when closed. */
function playSummary(stage: Stage): string {
  const play = stage['play'] as { kind: string; lineup?: { kind: string } } | undefined;
  if (!play || play.kind === 'solo') return 'Everyone for themselves';
  return { game: 'In the teams', round: 'Special teams for this round', reform: 'New teams from here on' }[play.lineup?.kind ?? 'game'] ?? 'Teams';
}

const SCOREBOARD_SHOWS = [{ value: 'players', label: 'Player scores' }, { value: 'teams', label: 'Team scores' }, { value: 'both', label: 'Both' }] as const;

/**
 * Every field of one part (stage) of a scene, in groups: what players see and do
 * (open), the points, and who plays. The kind of scene (which minigame, how a
 * duel is won) is chosen when adding it, so it is shown here, not asked again.
 */
export function StageFields({ definition, node, index, onChange }: { definition: Definition; node: Node; index: number; onChange: Change }) {
  const stage = node.stages[index]!; const group = `${node.key}:${index}`;
  const edit = (change: (current: Stage) => Stage, field = '') => onChange(updateStage(definition, node.key, index, change), `${group}:${field}`);
  const input = stage['input'] as { kind?: string; options?: Option[]; items?: Option[]; layout?: string; maxLength?: number; accept?: string[] } | undefined;
  const scoring = stage['scoring'] as { kind?: string; correctChoiceKey?: string; correctOrder?: string[]; awardMilli?: string; places?: Places } | undefined;
  // Optional points by place on a stage (or its scoring): left out entirely when switched off.
  const withPlaces = <T extends Record<string, unknown>>(base: T, places: Places | undefined): T => { const copy: Record<string, unknown> = { ...base }; if (places) copy['places'] = places; else delete copy['places']; return copy as T; };
  const fastest = (legendFor: string) => <PlacesFields legend={`Extra for the fastest ${legendFor}`} hint="On top of the points above, given when the answer is shown." value={scoring?.places} onChange={places => edit(current => ({ ...current, scoring: withPlaces(scoring ?? {}, places) }), 'places')} />;
  const id = (field: string) => `${node.key}-${index}-${field}`;
  const timed = !(stage.kind === 'route' && (stage['decide'] as { method?: string }).method === 'host') && stage.kind !== 'scoreboard' && stage.kind !== 'teams' && !isWheelScene(stage);
  const hasPoints = (stage.kind === 'collect' && (input?.kind === 'choice' || input?.kind === 'order')) || stage.kind === 'challenge' || stage.kind === 'vote' || stage.kind === 'duel' || (stage.kind === 'minigame' && stage['game'] !== 'lucky-doors');
  const hasPlay = ['collect', 'challenge', 'vote', 'minigame'].includes(stage.kind);
  return <div className="stage-fields">
    <Section title="Content" open>
      {stage.kind === 'info' && <label>Title<input value={String(stage.title ?? '')} maxLength={120} onChange={event => edit(current => ({ ...current, title: event.target.value }), 'title')} /></label>}
      <label>{stage.kind === 'info' ? 'Text on every screen' : stage.kind === 'scoreboard' ? 'Heading' : stage.kind === 'route' ? 'Question to the party' : stage.kind === 'minigame' ? 'Title on the screens' : 'Question or instruction'}
        <textarea rows={3} value={String(stage.prompt ?? '')} maxLength={2000} onChange={event => edit(current => ({ ...current, prompt: event.target.value }), 'prompt')} /></label>
      {timed && <label className="ed-inline">{stage.kind === 'duel' ? 'Betting time' : 'Timer'}
        <span className="ed-unit"><input type="number" inputMode="numeric" min={1} max={3600} placeholder="none" value={toSeconds(stage.durationMs)} onChange={event => edit(current => ({ ...current, durationMs: toMs(event.target.value) }), 'timer')} />sec</span></label>}

      {stage.kind === 'collect' && input?.kind === 'choice' && <Segmented label="Kind of question" value={quizKind(input)} choices={QUIZ_KINDS}
        onChange={kind => edit(current => withQuizKind(current, kind), 'quiz-kind')} />}
      {stage.kind === 'collect' && input?.kind === 'choice' && <fieldset><legend>Answers{scoring?.kind === 'correct-choice' ? ' (tick the correct one)' : ''}</legend>
        {(input.options ?? []).map((option, position) => <div key={option.key} className="option-row">
          {scoring?.kind === 'correct-choice' && <input type="radio" name={id('correct')} aria-label={`${option.label} is the correct answer`} checked={scoring.correctChoiceKey === option.key} onChange={() => edit(current => ({ ...current, scoring: { ...scoring, correctChoiceKey: option.key } }))} />}
          <input aria-label={`Answer option ${position + 1}`} value={option.label} maxLength={240} onChange={event => edit(current => ({ ...current, input: { ...input, options: input.options!.map(entry => entry.key === option.key ? { ...entry, label: event.target.value } : entry) } }), `option-${option.key}`)} />
          <button className="icon-button" disabled={(input.options ?? []).length <= 2} aria-label={`Remove answer option ${position + 1}`} onClick={() => edit(current => {
            const options = input.options!.filter(entry => entry.key !== option.key);
            return { ...current, input: { ...input, options }, ...(scoring?.kind === 'correct-choice' && scoring.correctChoiceKey === option.key ? { scoring: { ...scoring, correctChoiceKey: options[0]!.key } } : {}) };
          })}>×</button></div>)}
        {quizKind(input) !== 'true-false' && <button className="small-button" disabled={(input.options ?? []).length >= 12} onClick={() => edit(current => ({ ...current, input: { ...input, options: [...input.options!, { key: uniqueKey('answer', input.options!.map(entry => entry.key)), label: 'New answer' }] } }))}>+ Answer</button>}
      </fieldset>}
      {stage.kind === 'collect' && input?.kind === 'order' && <fieldset><legend>Items, in the correct order</legend>
        {(input.items ?? []).map((item, position) => <div key={item.key} className="option-row">
          <span className="order-number">{position + 1}.</span>
          <input aria-label={`Item ${position + 1}`} value={item.label} maxLength={240} onChange={event => edit(current => ({ ...current, input: { ...input, items: input.items!.map(entry => entry.key === item.key ? { ...entry, label: event.target.value } : entry) } }), `item-${item.key}`)} />
          <button className="icon-button" aria-label={`Move item ${position + 1} up`} disabled={position === 0} onClick={() => edit(current => { const items = [...input.items!]; [items[position - 1], items[position]] = [items[position]!, items[position - 1]!]; return { ...current, input: { ...input, items }, scoring: { ...scoring, kind: 'correct-order', correctOrder: items.map(entry => entry.key) } }; })}>↑</button>
          <button className="icon-button" aria-label={`Remove item ${position + 1}`} disabled={(input.items ?? []).length <= 2} onClick={() => edit(current => { const items = input.items!.filter(entry => entry.key !== item.key); return { ...current, input: { ...input, items }, scoring: { ...scoring, kind: 'correct-order', correctOrder: items.map(entry => entry.key) } }; })}>×</button></div>)}
        <button className="small-button" disabled={(input.items ?? []).length >= 8} onClick={() => edit(current => { const items = [...input.items!, { key: uniqueKey('item', input.items!.map(entry => entry.key)), label: 'New item' }]; return { ...current, input: { ...input, items }, scoring: { ...scoring, kind: 'correct-order', correctOrder: items.map(entry => entry.key) } }; })}>+ Item</button>
        <p className="hint">Players see them shuffled.</p>
      </fieldset>}
      {stage.kind === 'collect' && input?.kind === 'text' && <label className="ed-inline">Longest answer<span className="ed-unit"><input type="number" min={1} max={2000} value={input.maxLength ?? 240} onChange={event => edit(current => ({ ...current, input: { ...input, maxLength: Math.max(1, Math.min(2000, Math.round(Number(event.target.value) || 1))) } }), 'length')} />chars</span></label>}
      {stage.kind === 'collect' && input?.kind === 'media' && <fieldset><legend>Players may upload</legend><div className="ed-checks">{(['image', 'gif', 'video'] as const).map(kind => <label key={kind} className="choice"><input type="checkbox" checked={(input.accept ?? []).includes(kind)}
        disabled={(input.accept ?? []).length === 1 && (input.accept ?? []).includes(kind)}
        onChange={event => edit(current => ({ ...current, input: { ...input, accept: event.target.checked ? [...(input.accept ?? []), kind] : (input.accept ?? []).filter(entry => entry !== kind) } }))} />{{ image: 'Pictures', gif: 'GIFs', video: 'Videos' }[kind]}</label>)}</div></fieldset>}
      {stage.kind === 'collect' && input?.kind === 'drawing' && <DrawingFields stage={stage} onChange={(next, field) => edit(() => next, field)} />}
      {stage.kind === 'vote' && <label>Answers to vote on<Dropdown value={`${(stage['source'] as { nodeKey: string }).nodeKey}/${(stage['source'] as { stageKey: string }).stageKey}`} placeholder="Choose a writing or upload round"
        onChange={value => { const [nodeKey, stageKey] = value.split('/'); edit(current => ({ ...current, source: { nodeKey, stageKey } })); }}
        options={definition.nodes.flatMap(other => other.stages.filter(isVotable).map(source => ({ value: `${other.key}/${source.key}`, label: `${sceneName(definition, other.key)}${other.stages.length > 1 ? ` (part ${other.stages.indexOf(source) + 1})` : ''}` })))} /></label>}
      {stage.kind === 'scoreboard' && <Segmented label="Show" value={String(stage['show'] ?? 'players')} choices={SCOREBOARD_SHOWS} onChange={show => edit(current => ({ ...current, show }), 'show')} />}
      {stage.kind === 'minigame' && <MinigameFields part="settings" definition={definition} node={node} index={index} onChange={onChange} />}
      {stage.kind === 'duel' && <DuelFields part="settings" stage={stage} onChange={(next, field) => edit(() => next, field)} />}
      {stage.kind === 'route' && <RouteFields definition={definition} node={node} stage={stage} onChange={onChange} />}
      {stage.kind === 'teams' && <PickTeamsFields definition={definition} node={node} stage={stage} onChange={(next, field) => edit(() => next, field)} />}
      {isWheelScene(stage) && <WheelOfScene definition={definition} stage={stage} onChange={onChange} />}
    </Section>

    {hasPoints && <Section title="Points" summary={pointsSummary(stage)}>
      {stage.kind === 'collect' && input?.kind === 'choice' && <>
        <Segmented label="Scoring" stacked value={scoring?.kind === 'correct-choice' ? 'correct' : 'none'} choices={[{ value: 'correct', label: 'The correct answer gives points' }, { value: 'none', label: 'No points', hint: 'An opinion question' }]}
          onChange={value => edit(current => ({ ...current, scoring: value === 'correct' ? { kind: 'correct-choice', correctChoiceKey: input.options![0]!.key, awardMilli: '10000' } : { kind: 'none' } }))} />
        {scoring?.kind === 'correct-choice' && <><label className="ed-inline">Points for the correct answer<input type="number" min={0} value={points(scoring.awardMilli)} onChange={event => edit(current => ({ ...current, scoring: { ...scoring, awardMilli: milli(event.target.value) } }), 'points')} /></label>{fastest('correct answers')}</>}
      </>}
      {stage.kind === 'collect' && input?.kind === 'order' && scoring?.kind === 'correct-order' && <>
        <label className="ed-inline">Points for the exact order<input type="number" min={0} value={points(scoring.awardMilli)} onChange={event => edit(current => ({ ...current, scoring: { ...scoring, awardMilli: milli(event.target.value) } }), 'points')} /></label>
        {fastest('correct orders')}</>}
      {stage.kind === 'challenge' && <>
        <label className="ed-inline">Most the host can give<input type="number" min={0} value={points(stage['maxAwardMilli'])} onChange={event => edit(current => ({ ...current, maxAwardMilli: milli(event.target.value) }), 'points')} /></label>
        <PlacesFields legend="Points by place" hint="The host gives each player (or team) a place with one tap." value={stage['places'] as Places | undefined} onChange={places => edit(current => withPlaces(current, places), 'places')} /></>}
      {stage.kind === 'vote' && <>
        <label className="ed-inline">Points per vote received<input type="number" min={0} value={points(stage['awardPerVoteMilli'])} onChange={event => edit(current => ({ ...current, awardPerVoteMilli: milli(event.target.value) }), 'points')} /></label>
        <PlacesFields legend="Extra for the most-voted answers" hint="On top of the points per vote, given when the votes are shown." value={stage['places'] as Places | undefined} onChange={places => edit(current => withPlaces(current, places), 'places')} /></>}
      {stage.kind === 'minigame' && <MinigameFields part="points" definition={definition} node={node} index={index} onChange={onChange} />}
      {stage.kind === 'duel' && <DuelFields part="points" stage={stage} onChange={(next, field) => edit(() => next, field)} />}
    </Section>}

    {hasPlay && <Section title="Who plays" summary={playSummary(stage)}><PlayFields definition={definition} node={node} index={index} onChange={onChange} /></Section>}
  </div>;
}

/**
 * A Pick teams scene: how many teams, how they are made, captains, and (when teams are made again) what happens
 * to the team scores. The rounds after it play in these teams when their "Who plays" says so.
 */
function PickTeamsFields({ definition, node, stage, onChange }: { definition: Definition; node: Node; stage: Stage; onChange: (next: Stage, field: string) => void }) {
  const form = stage['form'] as Form; const set = (key: string, value: unknown) => { const copy: Stage = { ...stage }; if (value === undefined) delete copy[key]; else copy[key] = value; onChange(copy, key); };
  // Making teams again later in the game: the team scores can start over or carry on.
  const again = definition.nodes.some(other => other.key !== node.key && other.stages.some(part => part.kind === 'teams'));
  return <>
    <FormFields form={form} onChange={next => set('form', next)} />
    <label className="choice"><input type="checkbox" checked={stage['captains'] === true} onChange={event => set('captains', event.target.checked ? true : undefined)} />Each team gets a captain (who can answer for the team)</label>
    {again && <Segmented label="Team scores when teams are made again" stacked value={String(stage['carryover'] ?? 'fresh')} choices={CARRYOVER} onChange={value => set('carryover', value === 'fresh' ? undefined : value)} />}
    <p className="hint">In the room the host sees the teams first, can move players, add or remove teams, and starts when they are right. The rounds after this scene play in these teams until the next Pick teams scene.</p>
  </>;
}

// What happens to the team scores when teams are made again.
const CARRYOVER = [{ value: 'fresh', label: 'Start from zero' }, { value: 'keep', label: 'Keep each team’s score' }, { value: 'members', label: 'Add up the members’ scores' }];
/** Solo or teams for one part; empty means it follows the game's setting. */
function PlayFields({ definition, node, index, onChange }: { definition: Definition; node: Node; index: number; onChange: Change }) {
  const stage = node.stages[index]!; const play = stage['play'] as { kind: string; lineup?: { kind: string; form?: Form; carryover?: string }; answers?: string; points?: string } | undefined;
  // Without a game-wide default (games made with Pick teams scenes), no setting means everyone for themselves.
  const gameDefault = Boolean(definition['play']);
  const mode = !play ? (gameDefault ? 'game-default' : 'solo') : play.kind === 'solo' ? 'solo' : play.lineup?.kind ?? 'game';
  // A solo game has no teams to play in: that choice appears once the game has a Pick teams scene.
  const teamScenes = definition.nodes.some(other => other.stages.some(part => part.kind === 'teams'));
  const set = (next: unknown) => onChange(updateStage(definition, node.key, index, current => { const copy: Stage = { ...current }; if (next === undefined) delete copy['play']; else copy['play'] = next; return copy; }));
  const teamsWith = (lineup: unknown) => ({ kind: 'teams', lineup, answers: play?.answers ?? 'everyone', points: play?.points ?? 'both' });
  const defaultForm: Form = { split: { kind: 'count', teams: 2 }, formation: 'random' };
  return <fieldset><legend className="visually-hidden">Who plays this</legend>
    <Segmented label="Players" stacked value={mode} choices={[
      ...(gameDefault ? [{ value: 'game-default', label: 'As the game’s default' }] : []), { value: 'solo', label: 'Everyone for themselves' },
      ...(teamScenes || mode === 'game' ? [{ value: 'game', label: 'In the teams', hint: 'Made in the last Pick teams scene' }] : []),
      { value: 'round', label: 'Special teams for this round', hint: 'Like 1 against the rest' }, ...(mode === 'reform' ? [{ value: 'reform', label: 'New teams from here on' }] : [])]}
      onChange={value => set(value === 'game-default' ? undefined : value === 'solo' ? (gameDefault ? { kind: 'solo' } : undefined) : value === 'game' ? teamsWith({ kind: 'game' })
        : value === 'round' ? teamsWith({ kind: 'round', form: play?.lineup?.form ?? defaultForm }) : teamsWith({ kind: 'reform', form: play?.lineup?.form ?? defaultForm, carryover: 'fresh' }))} />
    {mode === 'game' && !teamScenes && <p className="hint warn">This game has no Pick teams scene yet: add one before this round, or choose everyone for themselves.</p>}
    {play?.kind === 'teams' && <>
      {(play.lineup?.kind === 'round' || play.lineup?.kind === 'reform') && <FormFields form={play.lineup.form ?? defaultForm} onChange={form => set({ ...play, lineup: { ...play.lineup, form } })} />}
      {play.lineup?.kind === 'reform' && <Segmented label="Team scores" stacked value={play.lineup.carryover ?? 'fresh'} choices={CARRYOVER} onChange={carryover => set({ ...play, lineup: { ...play.lineup, carryover } })} />}
      <Segmented label="Who answers" value={play.answers ?? 'everyone'} choices={[{ value: 'everyone', label: 'Everyone' }, { value: 'captain', label: 'One captain per team' }]} onChange={answers => set({ ...play, answers })} />
      <Segmented label="Points go to" value={play.points ?? 'both'} choices={[{ value: 'both', label: 'Team and members' }, { value: 'team', label: 'The team' }, { value: 'members', label: 'Each member' }]} onChange={points => set({ ...play, points })} />
    </>}
  </fieldset>;
}
type Form = { split: { kind: 'count'; teams: number } | { kind: 'sizes'; sizes: (number | 'rest')[] }; formation: string; names?: string[] };
/** How teams are made: a number of teams or exact sizes like "1, rest" or "2, 2"; random, by the host, or by the players. */
export function FormFields({ form, onChange }: { form: Form; onChange: (form: Form) => void }) {
  const sizes = form.split.kind === 'sizes' ? form.split.sizes.join(', ') : '';
  const [text, setText] = useState(sizes); useEffect(() => setText(sizes), [sizes]);
  return <>
    <Segmented label="Split" stacked value={form.split.kind} choices={[{ value: 'count', label: 'A number of equal teams' }, { value: 'sizes', label: 'Exact team sizes', hint: '1 v 3, 2 v 2, 1 v everyone…' }]}
      onChange={value => onChange({ ...form, split: value === 'count' ? { kind: 'count', teams: 2 } : { kind: 'sizes', sizes: [1, 'rest'] } })} />
    {form.split.kind === 'count' ? <label>Number of teams<input type="number" min={2} max={12} value={form.split.teams} onChange={event => onChange({ ...form, split: { kind: 'count', teams: Math.max(2, Math.min(12, Math.round(Number(event.target.value) || 2))) } })} /></label>
      : <label>Team sizes, separated by commas (“rest” takes everyone left)<input value={text} onChange={event => {
        setText(event.target.value);
        const parts = event.target.value.split(',').map(part => part.trim().toLowerCase()).filter(Boolean).map(part => part === 'rest' ? 'rest' as const : Math.round(Number(part)));
        if (parts.length >= 2 && parts.every(part => part === 'rest' || (Number.isInteger(part) && part >= 1 && part <= 50))) onChange({ ...form, split: { kind: 'sizes', sizes: parts } });
      }} /></label>}
    <Segmented label="Teams are made" value={form.formation} choices={[{ value: 'random', label: 'At random' }, { value: 'host', label: 'By the host' }, { value: 'players', label: 'Players choose' }]} onChange={formation => onChange({ ...form, formation })} />
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
    <Dropdown value={nextFor(option?.key)} onChange={to => setNext(option?.key, to)} options={[{ value: '', label: option ? 'Not connected yet' : 'Nothing: the game ends here' },
      ...others.map(other => { const problem = connectProblem(definition, node.key, option?.key, other.key); return { value: other.key, disabled: Boolean(problem) && nextFor(option?.key) !== other.key,
        label: `${sceneName(definition, other.key)}${problem === 'circle' ? ' (would go round in a circle)' : problem === 'same-scene' ? ' (another option leads there)' : ''}` }; })]} /></label>;
  return <fieldset><legend className="visually-hidden">Where the game goes next</legend>{isRoute(node) ? optionsOf(node).map(option => select(option)) : select(undefined)}
    <p className="hint">Or drag from a ● on the card to another scene.</p></fieldset>;
}

/** Where the scene's output (or each route option) leads, for the closed Where next group. */
export function nextSummary(definition: Definition, node: Node): string {
  if (isRoute(node)) { const options = optionsOf(node); const linked = options.filter(option => definition.edges.some(edge => edge.from === node.key && edge.option === option.key)).length; return `${linked} of ${options.length} routes connected`; }
  const next = definition.edges.find(edge => edge.from === node.key);
  return next ? `→ ${sceneName(definition, next.to)}` : 'The game ends here';
}

/**
 * The Flow editor's side panel for one selected scene: only what belongs to the flow.
 * What the scene is (a summary), its problems, its routes (a party choice's outputs)
 * and where it leads; its content and settings are edited in the Scene editor
 * ("Edit this scene"). The scene's actions are in the ☰ menu next to Close.
 */
export function Inspector({ definition, node, problems, onChange, onDelete, onClose, onOpen, onDuplicate, prefab, readOnly = false }: { definition: Definition; node: Node; problems: DefinitionIssue[]; onChange: Change; onDelete: (next: Definition) => void; onClose: () => void; onOpen: () => void; onDuplicate?: () => void; readOnly?: boolean; prefab?: { content: () => PrefabContent; defaultName: string } }) {
  const [confirming, setConfirming] = useState(false); const [saving, setSaving] = useState(false);
  useEffect(() => { setConfirming(false); setSaving(false); }, [node.key]);
  const text = cardText(definition, node); const start = definition.startNodeKey === node.key;
  const actions: MenuAction[] = [
    ...(start ? [] : [{ label: 'Start the game here', onSelect: () => onChange({ ...definition, startNodeKey: node.key }) }]),
    ...(onDuplicate ? [{ label: 'Duplicate', onSelect: onDuplicate }] : []),
    ...(prefab ? [{ label: 'Save as prefab…', onSelect: () => setSaving(true) }] : []),
    { label: 'Delete scene…', danger: true, onSelect: () => setConfirming(true) }];
  return <aside className="inspector" aria-labelledby="inspector-heading">
    <div className="inspector-head">
      <span className={`ed-kind thumb-${text.kind}${text.input ? ` thumb-${text.input}` : ''}`} aria-hidden="true"><Icon name={sceneIcon(text.kind, text.input)} size={18} /></span>
      <div className="ed-kind-text"><h2 id="inspector-heading">{text.label}</h2>{start && <small>The game starts here</small>}</div>
      {!readOnly && <ActionMenu label="Scene actions" actions={actions} />}
      <button className="small-button" onClick={onClose}>Close</button></div>
    {saving && prefab && <SavePrefab key={node.key} content={prefab.content} defaultName={prefab.defaultName} onClose={() => setSaving(false)} />}
    <div className="flow-summary">
      {text.banner && <p className="flow-summary-banner">{text.banner}</p>}
      <p className="flow-summary-title">{text.title}</p>
      <p className="flow-summary-line">{text.line}{node.stages.length > 1 ? ` · ${node.stages.length} parts` : ''}</p>
      <button className="accent" onClick={onOpen}>{readOnly ? 'Open this scene →' : 'Edit this scene →'}</button>
    </div>
    {problems.length > 0 && <div role="alert" className="inspector-problems"><ul>{problems.map((issue, position) => <li key={position}>{issue.stageIndex !== null && node.stages.length > 1 ? `Part ${issue.stageIndex + 1}: ` : ''}{issue.message}</li>)}</ul></div>}
    <fieldset className="view-lock" disabled={readOnly}>
    {isRoute(node) && <RouteNames definition={definition} node={node} onChange={onChange} />}
    <Section key={`next-${node.key}`} title="Where next" open summary={nextSummary(definition, node)}><NextFields definition={definition} node={node} onChange={onChange} /></Section>
    </fieldset>
    {confirming && <ConfirmDialog title={`Delete “${text.title}”?`} text="The scene and its connections go. Undo (Ctrl/Cmd+Z) brings it back." confirm="Delete scene"
      onConfirm={() => { setConfirming(false); onDelete(deleteScene(definition, node.key)); }} onCancel={() => setConfirming(false)} />}
  </aside>;
}

function RouteFields({ definition, node, stage, onChange }: { definition: Definition; node: Node; stage: Stage; onChange: Change }) {
  const decide = stage['decide'] as { method: string; tie?: string; noVotes?: string; counts?: string };
  const setDecide = (change: Partial<typeof decide>) => onChange(updateStage(definition, node.key, 0, current => {
    const merged = { ...decide, ...change };
    const next: Stage = { ...current, decide: merged.method === 'host' ? { method: 'host' } : { method: merged.method, tie: merged.tie ?? 'random', noVotes: merged.noVotes ?? 'random', counts: merged.counts ?? 'reveal' } };
    if (merged.method === 'host') { next.durationMs = null; delete next['defaultOptionKey']; }
    return next;
  }));
  return <>
    <RouteNames definition={definition} node={node} onChange={onChange} />
    <Segmented label="Who decides" value={decide.method} choices={[{ value: 'players', label: 'Everyone votes' }, { value: 'captains', label: 'Captains vote' }, { value: 'host', label: 'The host' }]} onChange={method => setDecide({ method })} />
    {decide.method !== 'host' && <>
      <Segmented label="On a tie" value={decide.tie ?? 'random'} choices={[{ value: 'random', label: 'A random tied route' }, { value: 'host', label: 'The host decides' }]} onChange={tie => setDecide({ tie })} />
      <Segmented label="When nobody votes" value={decide.noVotes ?? 'random'} choices={[{ value: 'random', label: 'A random route' }, { value: 'host', label: 'The host decides' }]} onChange={noVotes => setDecide({ noVotes })} />
      <Segmented label="Players see the vote counts" value={decide.counts ?? 'reveal'} choices={[{ value: 'reveal', label: 'When announced' }, { value: 'live', label: 'Live' }, { value: 'never', label: 'Never' }]} onChange={counts => setDecide({ counts })} />
    </>}
  </>;
}

/** A party choice's routes (its outputs): their names, and adding or removing one. In both editors. */
function RouteNames({ definition, node, onChange }: { definition: Definition; node: Node; onChange: Change }) {
  const options = optionsOf(node);
  return <fieldset><legend>Routes</legend>
    {options.map((option, position) => <div key={option.key} className="option-row">
      <input aria-label={`Route ${position + 1} name`} value={option.label} maxLength={240} onChange={event => onChange(setRouteOptions(definition, node.key, options.map(entry => entry.key === option.key ? { ...entry, label: event.target.value } : entry)), `${node.key}:route-${option.key}`)} />
      <button className="icon-button" disabled={options.length <= 2} aria-label={`Remove route ${position + 1}`} onClick={() => onChange(setRouteOptions(definition, node.key, options.filter(entry => entry.key !== option.key)))}>×</button></div>)}
    <button className="small-button" disabled={options.length >= 8} onClick={() => onChange(setRouteOptions(definition, node.key, [...options, { key: uniqueKey('route', options.map(entry => entry.key)), label: `Route ${options.length + 1}` }]))}>+ Route</button>
  </fieldset>;
}
