import { ROUND_CONTROL_TEXTS } from '../../room/round-control.text.js';
import { useEffect, useState } from 'react';
import { isSharedPrediction, placePoints, pointsAtStake, PlacesSchema, type DefinitionIssue, type Places, type PrefabContent } from '@party/contracts';
import { SceneTranslationFields } from './fields/translation-fields.js';
import { Section } from '../controls/section.js';
import { ExplainFields, stakeSummary } from './fields/explain-fields.js';
import { ActionMenu, type MenuAction } from '../controls/action-menu.js';
import { ReplaceSceneDialog, REPLACE_TEXTS } from './replace-scene.js';
import { ConfirmDialog } from '../controls/confirm-dialog.js';
import { SavePrefab } from '../flow/save-prefab.js';
import { Segmented } from '../controls/segmented.js';
import { Dropdown } from '../../ui/dropdown.js';
import { Icon, sceneIcon } from '../controls/icons.js';
import { WheelOfScene } from '../shell/show-settings.js';
import { PlacesFields } from './fields/places-fields.js';
import { MinigameFields } from './fields/minigame-fields.js';
import { MinigameConfiguration } from './minigame-configuration.js';
import { PoolConfiguration } from './pool-configuration.js';
import { DrawingFields } from './fields/drawing-fields.js';
import { DuelFields } from './fields/duel-fields.js';
import { translate, useTexts } from '../../i18n/texts.js';
import { INSPECTOR_TEXTS } from './inspector.text.js';
import { MediaField } from './fields/media-field.js';
import { musicSummary, SceneMusicFields } from './fields/music-fields.js';
import { DEFAULT_TEAM_NAMES, MINIGAME_KEYS, TEAM_MINIGAMES, type MinigameKey } from '@party/contracts';
import { gameName } from '../../presentation/catalog.text.js';
import { drawGameOf, isDrawScene, withDrawGame, isWheelScene, cardText, connect, connectProblem, deleteScene, disconnect, isRoute, isVotable, optionsOf, QUIZ_KINDS, quizKind, setRouteOptions, uniqueKey, updateStage, withQuizKind, WRITING_STARTERS, type Definition, type Node, type Option, type Stage } from '../model.js';

type Change = (next: Definition, group?: string) => void;
// In the current language; the editor redraws its panels when the language changes.
const t = (key: keyof typeof INSPECTOR_TEXTS.en, values?: Record<string, string | number>) => translate(INSPECTOR_TEXTS, key, values);
/** The intro's summary: off, the points it shows, or on. */
const introSummary = (stage: Stage) => { const intro = stage['explain'] as { points?: boolean } | undefined; const stake = intro?.points ? pointsAtStake(stage) : null;
  return !intro ? t('off') : stake ? stakeSummary(stake) : t('explanationOn'); };
const toSeconds = (ms: unknown) => typeof ms === 'number' ? String(Math.round(ms / 1000)) : '';
const toMs = (text: string) => { const value = Number(text); return text.trim() === '' ? null : Number.isFinite(value) ? Math.round(Math.min(3600, Math.max(1, value))) * 1000 : null; };
const points = (milli: unknown) => typeof milli === 'string' ? String(Number(milli) / 1000) : '';
const milli = (text: string) => { const value = Math.round(Number(text)); return Number.isFinite(value) && value >= 0 ? String(value * 1000) : '0'; };
export const sceneName = (definition: Definition, key: string) => { const node = definition.nodes.find(candidate => candidate.key === key); return node ? cardText(definition, node).title : key; };

/** What the Points group says when closed: the main points and, when set, the points by place. */
function pointsSummary(stage: Stage): string {
  const placesOf = (value: unknown) => { const parsed = PlacesSchema.safeParse(value); return parsed.success ? placePoints(parsed.data).map(entry => Number(entry) / 1000).join('/') : null; };
  const scoring = stage['scoring'] as { kind?: string; awardMilli?: string; places?: unknown } | undefined;
  const withPlaces = (main: string, value: unknown, label: string) => { const list = placesOf(value); return list ? t('withPlaces', { main, label, list }) : main; };
  if (stage.kind === 'collect' && scoring?.kind === 'judged') return withPlaces(t('upTo', { count: points((scoring as { maxAwardMilli?: string }).maxAwardMilli) }), scoring.places, t('placesL'));
  if (stage.kind === 'collect') return scoring?.kind === 'none' || !scoring ? t('noPoints') : withPlaces(t('pointsN', { count: points(scoring.awardMilli) }), scoring.places, t('fastestL'));
  if (stage.kind === 'challenge') return withPlaces(t('upTo', { count: points(stage['maxAwardMilli']) }), stage['places'], t('placesL'));
  if (stage.kind === 'vote') return withPlaces(t('perVote', { count: points(stage['awardPerVoteMilli']) }), stage['places'], t('mostVotesL'));
  if (stage.kind === 'minigame') return t('placesList', { list: placesOf(stage['places']) ?? ((stage['placementMilli'] as string[] | undefined) ?? ['10000', '6000', '3000']).map(entry => Number(entry) / 1000).join('/') });
  if (stage.kind === 'duel') return t('duelSummary', { winner: placesOf(stage['places'])?.split('/')[0] ?? '10', bet: points(stage['betMilli']) });
  return '';
}
/** What the Who plays group says when closed. */
function playSummary(stage: Stage): string {
  const play = stage['play'] as { kind: string; lineup?: { kind: string } } | undefined;
  if (!play || play.kind === 'solo') return t('solo');
  const key = ({ game: 'inTeams', round: 'roundTeams', reform: 'reform' } as const)[(play.lineup?.kind ?? 'game') as 'game' | 'round' | 'reform'];
  return t(key ?? 'teams');
}

const scoreboardShows = () => [{ value: 'players', label: t('showPlayers') }, { value: 'teams', label: t('showTeams') }, { value: 'both', label: t('showBoth') }] as const;

/**
 * Every field of one part (stage) of a scene, in groups: what players see and do
 * (open), the points, and who plays. The kind of scene (which minigame, how a
 * duel is won) is chosen when adding it, so it is shown here, not asked again.
 */
export function StageFields({ definition, node, index, onChange, addTeams, mediaOpen, openMedia, closeMedia }: { definition: Definition; node: Node; index: number; onChange: Change; addTeams: (stage: Stage) => void; mediaOpen: boolean; openMedia: () => void; closeMedia: () => void }) {
  const rounds = useTexts(ROUND_CONTROL_TEXTS);
  const stage = node.stages[index]!; const group = `${node.key}:${index}`;
  const edit = (change: (current: Stage) => Stage, field = '') => onChange(updateStage(definition, node.key, index, change), `${group}:${field}`);
  const input = stage['input'] as { kind?: string; options?: Option[]; items?: Option[]; layout?: string; maxLength?: number; accept?: string[] } | undefined;
  const scoring = stage['scoring'] as { kind?: string; correctChoiceKey?: string; correctOrder?: string[]; awardMilli?: string; places?: Places } | undefined;
  // Optional points by place on a stage (or its scoring): left out entirely when switched off.
  const withPlaces = <T extends Record<string, unknown>>(base: T, places: Places | undefined): T => { const copy: Record<string, unknown> = { ...base }; if (places) copy['places'] = places; else delete copy['places']; return copy as T; };
  const fastest = (legendFor: string) => <PlacesFields legend={t('extraFastest', { what: legendFor })} hint={t('extraFastestHint')} value={scoring?.places} onChange={places => edit(current => ({ ...current, scoring: withPlaces(scoring ?? {}, places) }), 'places')} />;
  const id = (field: string) => `${node.key}-${index}-${field}`;
  const poolStage = stage.kind === 'duel' && (stage['contest'] as { kind?: string; game?: string } | undefined)?.game === 'eight-ball';
  const timed = !poolStage && !(stage.kind === 'duel' && stage['pick'] === 'teams') && !(stage.kind === 'route' && (stage['decide'] as { method?: string }).method === 'host') && stage.kind !== 'scoreboard' && stage.kind !== 'teams' && !isWheelScene(stage);
  const graphRound = stage.kind === 'minigame' && stage['game'] === 'draw-the-graph';
  const openRound = stage.kind === 'collect' && (input?.kind === 'text' || input?.kind === 'media' || input?.kind === 'drawing');
  // A Vote scene that votes on this round: it then gives no points of its own.
  const votedOn = definition.nodes.some(other => other.stages.some(part => part.kind === 'vote' && (part['source'] as { nodeKey?: string; stageKey?: string } | undefined)?.nodeKey === node.key && (part['source'] as { stageKey?: string }).stageKey === stage.key));
  const hasPoints = openRound || (stage.kind === 'collect' && (input?.kind === 'choice' || input?.kind === 'order')) || stage.kind === 'challenge' || stage.kind === 'vote' || (stage.kind === 'duel' && !poolStage) || (stage.kind === 'minigame' && stage['game'] !== 'lucky-doors');
  const hasPlay = ['collect', 'challenge', 'vote', 'minigame'].includes(stage.kind);
  const voting = stage['voteMode'] === 'multi' || stage['voteMode'] === 'ranked' ? stage['voteMode'] : 'single';
  const cards = stage['resultCards'];
  const cardMode = typeof cards === 'number' ? 'timed' : cards === 'manual' ? 'manual' : 'together';
  const incoming = definition.edges.filter(edge => edge.to === node.key);
  const hasTeamSetup = node.stages.slice(0, index).some(part => part.kind === 'teams') ||
    (node.key !== definition.startNodeKey && incoming.length > 0 && incoming.every(edge =>
      definition.nodes.find(candidate => candidate.key === edge.from)?.stages.some(part => part.kind === 'teams')));
  return <div className="stage-fields">
    <Section title={t('content')} memory="Content" open>
      {stage.kind === 'info' && <label>{t('title')}<input value={String(stage.title ?? '')} maxLength={120} onChange={event => edit(current => ({ ...current, title: event.target.value }), 'title')} /></label>}
      {stage.kind !== 'minigame' && <label>{t(stage.kind === 'info' ? 'lInfo' : stage.kind === 'scoreboard' ? 'lScoreboard' : stage.kind === 'route' ? 'lRoute' : 'lQuestion')}
        <textarea rows={3} value={String(stage.prompt ?? '')} maxLength={2000} onChange={event => edit(current => ({ ...current, prompt: event.target.value }), 'prompt')} /></label>}
      {stage.kind === 'collect' && input?.kind === 'text' && <details className="writing-starters">
        <summary>{t('writingStarters')}</summary>
        <div>{WRITING_STARTERS.map(starter => <button key={starter.key} type="button" className="small-button" title={starter.prompt}
          onClick={() => edit(current => ({ ...current, prompt: starter.prompt }), 'writing-starter')}>{starter.name}</button>)}</div>
      </details>}
      {['collect', 'challenge', 'info'].includes(stage.kind) && <MediaField stage={stage} open={mediaOpen} onOpen={openMedia} onClose={closeMedia} onChange={next => edit(() => next, 'media')} />}
      {timed && stage.kind !== 'minigame' && <label className="ed-inline">{t(stage.kind === 'duel' ? 'bettingTime' : isDrawScene(stage) ? 'drawTimer' : 'timer')}
        <span className="ed-unit"><input type="number" inputMode="numeric" min={1} max={3600}
          placeholder={t('none')} value={toSeconds(stage.durationMs)}
          onChange={event => edit(current => ({ ...current, durationMs: toMs(event.target.value) }), 'timer')} />{t('sec')}</span></label>}

      {stage.kind === 'collect' && input?.kind === 'choice' && <Segmented label={t('kindOfQuestion')} value={quizKind(input)} choices={QUIZ_KINDS}
        onChange={kind => edit(current => withQuizKind(current, kind), 'quiz-kind')} />}
      {stage.kind === 'collect' && input?.kind === 'choice' && <fieldset><legend>{t('answers')}{scoring?.kind === 'correct-choice' ? t('tickCorrect') : ''}</legend>
        {(input.options ?? []).map((option, position) => <div key={option.key} className="option-row">
          {scoring?.kind === 'correct-choice' && <input type="radio" name={id('correct')} aria-label={t('isCorrect', { label: option.label })} checked={scoring.correctChoiceKey === option.key} onChange={() => edit(current => ({ ...current, scoring: { ...scoring, correctChoiceKey: option.key } }))} />}
          <input aria-label={t('answerOption', { number: position + 1 })} value={option.label} maxLength={240} onChange={event => edit(current => ({ ...current, input: { ...input, options: input.options!.map(entry => entry.key === option.key ? { ...entry, label: event.target.value } : entry) } }), `option-${option.key}`)} />
          <button className="icon-button danger-icon" disabled={(input.options ?? []).length <= 2} aria-label={t('removeAnswer', { number: position + 1 })} onClick={() => edit(current => {
            const options = input.options!.filter(entry => entry.key !== option.key);
            return { ...current, input: { ...input, options }, ...(scoring?.kind === 'correct-choice' && scoring.correctChoiceKey === option.key ? { scoring: { ...scoring, correctChoiceKey: options[0]!.key } } : {}) };
          })}>×</button></div>)}
        {quizKind(input) !== 'true-false' && <button className="small-button" disabled={(input.options ?? []).length >= 12} onClick={() => edit(current => ({ ...current, input: { ...input, options: [...input.options!, { key: uniqueKey('answer', input.options!.map(entry => entry.key)), label: t('newAnswer') }] } }))}>{t('addAnswer')}</button>}
      </fieldset>}
      {stage.kind === 'collect' && input?.kind === 'order' && <fieldset><legend>{t('itemsOrder')}</legend>
        {(input.items ?? []).map((item, position) => <div key={item.key} className="option-row">
          <span className="order-number">{position + 1}.</span>
          <input aria-label={t('item', { number: position + 1 })} value={item.label} maxLength={240} onChange={event => edit(current => ({ ...current, input: { ...input, items: input.items!.map(entry => entry.key === item.key ? { ...entry, label: event.target.value } : entry) } }), `item-${item.key}`)} />
          <button className="icon-button" aria-label={t('moveItemUp', { number: position + 1 })} disabled={position === 0} onClick={() => edit(current => { const items = [...input.items!]; [items[position - 1], items[position]] = [items[position]!, items[position - 1]!]; return { ...current, input: { ...input, items }, scoring: { ...scoring, kind: 'correct-order', correctOrder: items.map(entry => entry.key) } }; })}>↑</button>
          <button className="icon-button danger-icon" aria-label={t('removeItem', { number: position + 1 })} disabled={(input.items ?? []).length <= 2} onClick={() => edit(current => { const items = input.items!.filter(entry => entry.key !== item.key); return { ...current, input: { ...input, items }, scoring: { ...scoring, kind: 'correct-order', correctOrder: items.map(entry => entry.key) } }; })}>×</button></div>)}
        <button className="small-button" disabled={(input.items ?? []).length >= 8} onClick={() => edit(current => { const items = [...input.items!, { key: uniqueKey('item', input.items!.map(entry => entry.key)), label: t('newItem') }]; return { ...current, input: { ...input, items }, scoring: { ...scoring, kind: 'correct-order', correctOrder: items.map(entry => entry.key) } }; })}>{t('addItem')}</button>
        <p className="hint">{t('shuffled')}</p>
      </fieldset>}
      {stage.kind === 'collect' && input?.kind === 'text' && <label className="ed-inline">{t('longest')}<span className="ed-unit"><input type="number" min={1} max={2000} value={input.maxLength ?? 240} onChange={event => edit(current => ({ ...current, input: { ...input, maxLength: Math.max(1, Math.min(2000, Math.round(Number(event.target.value) || 1))) } }), 'length')} />{t('chars')}</span></label>}
      {stage.kind === 'collect' && input?.kind === 'media' && <fieldset><legend>{t('mayUpload')}</legend><div className="ed-checks">{(['image', 'gif', 'video'] as const).map(kind => <label key={kind} className="choice"><input type="checkbox" checked={(input.accept ?? []).includes(kind)}
        disabled={(input.accept ?? []).length === 1 && (input.accept ?? []).includes(kind)}
        onChange={event => edit(current => ({ ...current, input: { ...input, accept: event.target.checked ? [...(input.accept ?? []), kind] : (input.accept ?? []).filter(entry => entry !== kind) } }))} />{t(({ image: 'pictures', gif: 'gifs', video: 'videos' } as const)[kind])}</label>)}</div></fieldset>}
      {stage.kind === 'collect' && input?.kind === 'drawing' && <DrawingFields stage={stage} onChange={(next, field) => edit(() => next, field)} />}
      {stage.kind === 'vote' && <label>{t('voteOn')}<Dropdown value={`${(stage['source'] as { nodeKey: string }).nodeKey}/${(stage['source'] as { stageKey: string }).stageKey}`} placeholder={t('chooseSource')}
        onChange={value => { const [nodeKey, stageKey] = value.split('/'); edit(current => ({ ...current, source: { nodeKey, stageKey } })); }}
        options={definition.nodes.flatMap(other => other.stages.filter(isVotable).map(source => ({ value: `${other.key}/${source.key}`, label: `${sceneName(definition, other.key)}${other.stages.length > 1 ? t('partN', { number: other.stages.indexOf(source) + 1 }) : ''}` })))} /></label>}
      {stage.kind === 'vote' && <>
        <label>{rounds('voting')}<Dropdown value={voting} onChange={voteMode => edit(current => ({ ...current, voteMode }), 'vote-mode')}
          options={(['single', 'multi', 'ranked'] as const).map(value => ({ value, label: rounds(value) }))} /></label>
        {voting !== 'single' && <label>{rounds('limit')}<input type="number" min={2} max={8} value={Number(stage['voteLimit'] ?? 3)}
          onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 2 && value <= 8) edit(current => ({ ...current, voteLimit: value }), 'vote-limit'); }} /></label>}
      </>}
      {(stage.kind === 'vote' || (stage.kind === 'collect' && (input?.kind === 'media' || input?.kind === 'drawing'))) && <>
        <label>{rounds('cards')}<Dropdown value={cardMode} onChange={mode => {
          edit(current => { const { resultCards: _old, ...rest } = current; return mode === 'together' ? rest : { ...rest, resultCards: mode === 'manual' ? 'manual' : 5 }; }, 'result-cards');
        }} options={(['together', 'manual', 'timed'] as const).map(value => ({ value, label: rounds(value) }))} /></label>
        {typeof cards === 'number' && <label>{rounds('interval')}<input type="number" min={1} max={60} value={cards}
          onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 60) edit(current => ({ ...current, resultCards: value }), 'result-cards'); }} /></label>}
      </>}
      {(stage.kind === 'collect' && input?.kind === 'drawing') && <label>{rounds('countdown')}
        <input type="number" min={0} max={15} value={Number(stage['countdownSeconds'] ?? 0)}
          onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 15) edit(current => ({ ...current, countdownSeconds: value }), 'countdown'); }} /></label>}
      {stage.kind === 'scoreboard' && <Segmented label={t('show')} value={String(stage['show'] ?? 'players')} choices={scoreboardShows()} onChange={show => edit(current => ({ ...current, show }), 'show')} />}
      {stage.kind === 'minigame' && <MinigameConfiguration key={stage.key} definition={definition} node={node} index={index} onApply={next => edit(() => next, 'minigame-configuration')} />}
      {poolStage ? <PoolConfiguration key={`${node.key}:${stage.key}`} stage={stage} onChange={(next, field) => edit(() => next, field)}
        addTeams={hasTeamSetup ? undefined : addTeams} />
        : stage.kind === 'duel' && <DuelFields part="settings" stage={stage} onChange={(next, field) => edit(() => next, field)} />}
      {stage.kind === 'route' && <RouteFields definition={definition} node={node} stage={stage} onChange={onChange} />}
      {stage.kind === 'teams' && <PickTeamsFields definition={definition} node={node} stage={stage} onChange={(next, field) => edit(() => next, field)} />}
      {isWheelScene(stage) && <WheelOfScene definition={definition} stage={stage} onChange={onChange} />}
    </Section>

    <SceneTranslationFields stage={stage} onChange={next => edit(() => next, 'translations')} />

    {hasPoints && <Section title={t('points')} memory="Points" summary={pointsSummary(stage)}>
      {stage.kind === 'collect' && input?.kind === 'choice' && <>
        <Segmented label={t('scoring')} stacked value={scoring?.kind === 'correct-choice' ? 'correct' : 'none'} choices={[{ value: 'correct', label: t('correctGives') }, { value: 'none', label: t('noPoints'), hint: t('opinion') }]}
          onChange={value => edit(current => ({ ...current, scoring: value === 'correct' ? { kind: 'correct-choice', correctChoiceKey: input.options![0]!.key, awardMilli: '10000' } : { kind: 'none' } }))} />
        {scoring?.kind === 'correct-choice' && <><label className="ed-inline">{t('pointsCorrect')}<input type="number" min={0} value={points(scoring.awardMilli)} onChange={event => edit(current => ({ ...current, scoring: { ...scoring, awardMilli: milli(event.target.value) } }), 'points')} /></label>{fastest(t('correctAnswers'))}</>}
      </>}
      {stage.kind === 'collect' && input?.kind === 'order' && scoring?.kind === 'correct-order' && <>
        <label className="ed-inline">{t('pointsOrder')}<input type="number" min={0} value={points(scoring.awardMilli)} onChange={event => edit(current => ({ ...current, scoring: { ...scoring, awardMilli: milli(event.target.value) } }), 'points')} /></label>
        {fastest(t('correctOrders'))}</>}
      {openRound && <>
        <Segmented label={t('scoring')} stacked value={scoring?.kind === 'judged' ? 'host' : 'none'} choices={[{ value: 'none', label: t('openNone'), hint: t('openNoneHint') }, { value: 'host', label: t('openHost'), hint: t('openHostHint') }]}
          onChange={value => { if (value === 'host' && votedOn) return; edit(current => ({ ...current, scoring: value === 'host' ? { kind: 'judged', maxAwardMilli: '10000' } : { kind: 'none' } }), 'scoring'); }} />
        {votedOn && scoring?.kind !== 'judged' && <p className="hint">{t('votedOn')}</p>}
        {scoring?.kind === 'judged' && <>
          <label className="ed-inline">{t('mostHost')}<input type="number" min={0} value={points((scoring as { maxAwardMilli?: string }).maxAwardMilli)} onChange={event => edit(current => ({ ...current, scoring: { ...scoring, maxAwardMilli: milli(event.target.value) } }), 'points')} /></label>
          <PlacesFields legend={t('byPlace')} hint={t('byPlaceHint')} value={scoring.places} onChange={places => edit(current => ({ ...current, scoring: withPlaces(scoring, places) }), 'places')} /></>}
      </>}
      {stage.kind === 'challenge' && <>
        <label className="ed-inline">{t('mostHost')}<input type="number" min={0} value={points(stage['maxAwardMilli'])} onChange={event => edit(current => ({ ...current, maxAwardMilli: milli(event.target.value) }), 'points')} /></label>
        <PlacesFields legend={t('byPlace')} hint={t('byPlaceHint')} value={stage['places'] as Places | undefined} onChange={places => edit(current => withPlaces(current, places), 'places')} /></>}
      {stage.kind === 'vote' && <>
        <label className="ed-inline">{t('perVoteLabel')}<input type="number" min={0} value={points(stage['awardPerVoteMilli'])} onChange={event => edit(current => ({ ...current, awardPerVoteMilli: milli(event.target.value) }), 'points')} /></label>
        <PlacesFields legend={t('extraVoted')} hint={t('extraVotedHint')} value={stage['places'] as Places | undefined} onChange={places => edit(current => withPlaces(current, places), 'places')} /></>}
      {stage.kind === 'minigame' && <MinigameFields part="points" definition={definition} node={node} index={index} onChange={onChange} />}
      {stage.kind === 'duel' && <DuelFields part="points" stage={stage} onChange={(next, field) => edit(() => next, field)} />}
    </Section>}

    {hasPlay && <Section title={t('explanation')} memory="Explanation first" summary={introSummary(stage)}><ExplainFields definition={definition} stage={stage} onChange={(next, field) => edit(() => next, field)} /></Section>}

    {hasPlay && !graphRound && !(stage.kind === 'minigame' && isSharedPrediction(String(stage['game']))) && <Section title={t('whoPlays')} memory="Who plays" summary={playSummary(stage)}><PlayFields definition={definition} node={node} index={index} onChange={onChange} /></Section>}
    <Section title={t('music')} memory="scene-music" summary={musicSummary(stage)}><SceneMusicFields stage={stage} onChange={next => edit(() => next, 'music')} /></Section>
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
    <FormFields form={form} onChange={next => set('form', withNames(next))} />
    <TeamNameFields form={form} onChange={next => set('form', next)} />
    <label className="choice"><input type="checkbox" checked={stage['captains'] === true} onChange={event => set('captains', event.target.checked ? true : undefined)} />{t('captains')}</label>
    <Segmented label={t('colorsBy')} value={form.colors === 'teams' ? 'teams' : 'host'} choices={[{ value: 'host', label: t('colorsHost') }, { value: 'teams', label: t('colorsTeams') }]}
      onChange={value => { const next = { ...form }; if (value === 'teams') next.colors = 'teams'; else delete next.colors; set('form', next); }} />
    {form.colors === 'teams' && <p className="hint">{t('colorsHint')}</p>}
    {again && <Segmented label={t('scoresAgain')} stacked value={String(stage['carryover'] ?? 'fresh')} choices={carryover()} onChange={value => set('carryover', value === 'fresh' ? undefined : value)} />}
    <p className="hint">{t('teamsHint')}</p>
  </>;
}

const formCount = (form: Form) => form.split.kind === 'count' ? form.split.teams : form.split.sizes.length;
/** Own team names follow the number of teams: a new team gets a standard name nobody uses yet. */
function withNames(form: Form): Form {
  if (!form.names) return form;
  const names = form.names.slice(0, formCount(form));
  for (const name of DEFAULT_TEAM_NAMES) { if (names.length >= formCount(form)) break; if (!names.some(taken => taken.toLowerCase() === name.toLowerCase())) names.push(name); }
  return { ...form, names };
}
/**
 * The team names of a Pick teams scene, one field per team. An empty field is the standard name (shown greyed);
 * all standard names again means no own names at all.
 */
function TeamNameFields({ form, onChange }: { form: Form; onChange: (form: Form) => void }) {
  const count = formCount(form); const standard = DEFAULT_TEAM_NAMES.slice(0, count);
  const stored = Array.from({ length: count }, (_, index) => form.names?.[index] ?? standard[index]!);
  // What is typed, so a field can be empty for a moment; empty fields are saved as the standard name.
  const [typed, setTyped] = useState(() => stored.map((name, index) => name === standard[index] ? '' : name));
  const key = stored.join('|');
  useEffect(() => setTyped(stored.map((name, index) => name === standard[index] ? '' : name)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (index: number, value: string) => {
    const next = typed.map((name, at) => at === index ? value : name); setTyped(next);
    const names = next.map((name, at) => name.trim() || standard[at]!);
    const copy: Form = { ...form }; if (names.every((name, at) => name === standard[at])) delete copy.names; else copy.names = names;
    onChange(copy);
  };
  const shown = Array.from({ length: count }, (_, index) => (typed[index] ?? '').trim() || standard[index]!);
  const repeated = new Set(shown.map(name => name.toLowerCase())).size !== shown.length;
  return <fieldset className="team-name-fields"><legend>{t('teamNames')}</legend>
    {Array.from({ length: count }, (_, index) => <label key={index} className="ed-inline">{t('teamNameN', { number: index + 1 })}
      <input value={typed[index] ?? ''} placeholder={standard[index]} maxLength={30} onChange={event => change(index, event.target.value)} /></label>)}
    {repeated && <p role="alert" className="error">{t('sameNames')}</p>}
    <p className="hint">{t('teamNamesHint')}</p>
  </fieldset>;
}

// What happens to the team scores when teams are made again.
const carryover = () => [{ value: 'fresh', label: t('cFresh') }, { value: 'keep', label: t('cKeep') }, { value: 'members', label: t('cMembers') }];
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
  return <fieldset><legend className="visually-hidden">{t('whoPlaysThis')}</legend>
    <Segmented label={t('players')} stacked value={mode} choices={[
      ...(gameDefault ? [{ value: 'game-default', label: t('gameDefault') }] : []), { value: 'solo', label: t('solo') },
      ...(teamScenes || mode === 'game' ? [{ value: 'game', label: t('inTeams'), hint: t('madeInLast') }] : []),
      { value: 'round', label: t('roundTeams'), hint: t('likeOneVsRest') }, ...(mode === 'reform' ? [{ value: 'reform', label: t('reform') }] : [])]}
      onChange={value => set(value === 'game-default' ? undefined : value === 'solo' ? (gameDefault ? { kind: 'solo' } : undefined) : value === 'game' ? teamsWith({ kind: 'game' })
        : value === 'round' ? teamsWith({ kind: 'round', form: play?.lineup?.form ?? defaultForm }) : teamsWith({ kind: 'reform', form: play?.lineup?.form ?? defaultForm, carryover: 'fresh' }))} />
    {mode === 'game' && !teamScenes && <p className="hint warn">{t('noTeamScene')}</p>}
    {play?.kind === 'teams' && <>
      {(play.lineup?.kind === 'round' || play.lineup?.kind === 'reform') && <FormFields form={play.lineup.form ?? defaultForm} onChange={form => set({ ...play, lineup: { ...play.lineup, form } })} />}
      {play.lineup?.kind === 'reform' && <Segmented label={t('teamScores')} stacked value={play.lineup.carryover ?? 'fresh'} choices={carryover()} onChange={carryover => set({ ...play, lineup: { ...play.lineup, carryover } })} />}
      <Segmented label={t('whoAnswers')} value={play.answers ?? 'everyone'} choices={[{ value: 'everyone', label: t('everyone') }, { value: 'captain', label: t('oneCaptain') }]} onChange={answers => set({ ...play, answers })} />
      <Segmented label={t('pointsGo')} value={play.points ?? 'both'} choices={[{ value: 'both', label: t('teamAndMembers') }, { value: 'team', label: t('theTeam') }, { value: 'members', label: t('eachMember') }]} onChange={points => set({ ...play, points })} />
    </>}
  </fieldset>;
}
type Form = { split: { kind: 'count'; teams: number } | { kind: 'sizes'; sizes: (number | 'rest')[] }; formation: string; names?: string[]; colors?: 'host' | 'teams' };
/** How teams are made: a number of teams or exact sizes like "1, rest" or "2, 2"; random, by the host, or by the players. */
export function FormFields({ form, onChange }: { form: Form; onChange: (form: Form) => void }) {
  const sizes = form.split.kind === 'sizes' ? form.split.sizes.join(', ') : '';
  const [text, setText] = useState(sizes); useEffect(() => setText(sizes), [sizes]);
  return <>
    <Segmented label={t('split')} stacked value={form.split.kind} choices={[{ value: 'count', label: t('equalTeams') }, { value: 'sizes', label: t('exactSizes'), hint: t('sizesHint') }]}
      onChange={value => onChange({ ...form, split: value === 'count' ? { kind: 'count', teams: 2 } : { kind: 'sizes', sizes: [1, 'rest'] } })} />
    {form.split.kind === 'count' ? <label>{t('numberOfTeams')}<input type="number" min={2} max={12} value={form.split.teams} onChange={event => onChange({ ...form, split: { kind: 'count', teams: Math.max(2, Math.min(12, Math.round(Number(event.target.value) || 2))) } })} /></label>
      : <label>{t('sizesLabel')}<input value={text} onChange={event => {
        setText(event.target.value);
        const parts = event.target.value.split(',').map(part => part.trim().toLowerCase()).filter(Boolean).map(part => part === 'rest' ? 'rest' as const : Math.round(Number(part)));
        if (parts.length >= 2 && parts.every(part => part === 'rest' || (Number.isInteger(part) && part >= 1 && part <= 50))) onChange({ ...form, split: { kind: 'sizes', sizes: parts } });
      }} /></label>}
    <Segmented label={t('teamsMade')} value={form.formation} choices={[{ value: 'random', label: t('atRandom') }, { value: 'skill', label: t('bySkill') }, { value: 'host', label: t('byHost') }, { value: 'players', label: t('playersChoose') }]} onChange={formation => onChange({ ...form, formation })} />
    <p className="hint">{t('hostSeesFirst')}</p>
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
  const select = (option: Option | undefined) => <label key={option?.key ?? 'next'}>{option ? t('leadsTo', { option: option.label }) : t('nextScene')}
    <Dropdown value={nextFor(option?.key)} onChange={to => setNext(option?.key, to)} options={[{ value: '', label: option ? t('notConnected') : t('gameEnds') },
      ...others.map(other => { const problem = connectProblem(definition, node.key, option?.key, other.key); return { value: other.key, disabled: Boolean(problem) && nextFor(option?.key) !== other.key,
        label: `${sceneName(definition, other.key)}${problem === 'circle' ? t('circle') : problem === 'same-scene' ? t('sameScene') : ''}` }; })]} /></label>;
  return <fieldset><legend className="visually-hidden">{t('whereNextLegend')}</legend>{isRoute(node) ? optionsOf(node).map(option => select(option)) : select(undefined)}
    <p className="hint">{t('orDrag')}</p></fieldset>;
}

/** Where the scene's output (or each route option) leads, for the closed Where next group. */
export function nextSummary(definition: Definition, node: Node): string {
  if (isRoute(node)) { const options = optionsOf(node); const linked = options.filter(option => definition.edges.some(edge => edge.from === node.key && edge.option === option.key)).length; return t('routesConnected', { linked, total: options.length }); }
  const next = definition.edges.find(edge => edge.from === node.key);
  return next ? `→ ${sceneName(definition, next.to)}` : t('endsHere');
}

/**
 * The Flow editor's side panel for one selected scene: only what belongs to the flow.
 * What the scene is (a summary), its problems, its routes (a party choice's outputs)
 * and where it leads; its content and settings are edited in the Scene editor
 * ("Edit this scene"). The scene's actions are in the ☰ menu next to Close.
 */
export function Inspector({ definition, node, problems, onChange, onDelete, onClose, onOpen, onDuplicate, prefab, readOnly = false }: { definition: Definition; node: Node; problems: DefinitionIssue[]; onChange: Change; onDelete: (next: Definition) => void; onClose: () => void; onOpen: () => void; onDuplicate?: () => void; readOnly?: boolean; prefab?: { content: () => PrefabContent; defaultName: string } }) {
  const replacement = useTexts(REPLACE_TEXTS); const [replacing, setReplacing] = useState(false);
  const [confirming, setConfirming] = useState(false); const [saving, setSaving] = useState(false);
  useEffect(() => { setConfirming(false); setSaving(false); }, [node.key]);
  const text = cardText(definition, node); const start = definition.startNodeKey === node.key;
  const actions: MenuAction[] = [
    ...(start ? [] : [{ label: t('startHere'), onSelect: () => onChange({ ...definition, startNodeKey: node.key }) }]),
    ...(onDuplicate ? [{ label: t('duplicate'), onSelect: onDuplicate }] : []),
    ...(prefab ? [{ label: t('savePrefab'), onSelect: () => setSaving(true) }] : []),
    { label: replacement('action'), onSelect: () => setReplacing(true) },
    { label: t('deleteScene'), danger: true, onSelect: () => setConfirming(true) }];
  return <aside className="inspector" aria-labelledby="inspector-heading">
    <div className="inspector-head">
      <span className={`ed-kind thumb-${text.kind}${text.input ? ` thumb-${text.input}` : ''}`} aria-hidden="true"><Icon name={sceneIcon(text.kind, text.input)} size={18} /></span>
      <div className="ed-kind-text"><h2 id="inspector-heading">{text.label}</h2>{start && <small>{t('startsHere')}</small>}</div>
      {!readOnly && <ActionMenu label={t('sceneActions')} actions={actions} />}
      <button className="small-button" onClick={onClose}>{t('close')}</button></div>
    {replacing && !readOnly && <ReplaceSceneDialog key={node.key} definition={definition} node={node} onChange={onChange} onClose={() => setReplacing(false)} />}
    {saving && prefab && <SavePrefab key={node.key} content={prefab.content} defaultName={prefab.defaultName} onClose={() => setSaving(false)} />}
    <div className="flow-summary">
      {text.banner && <p className="flow-summary-banner">{text.banner}</p>}
      <p className="flow-summary-title">{text.title}</p>
      <p className="flow-summary-line">{text.line}{node.stages.length > 1 ? t('partsN', { count: node.stages.length }) : ''}</p>
      <button className="accent" onClick={onOpen}>{t(readOnly ? 'openScene' : 'editScene')}</button>
    </div>
    {problems.length > 0 && <div role="alert" className="inspector-problems"><ul>{problems.map((issue, position) => <li key={position}>{issue.stageIndex !== null && node.stages.length > 1 ? t('part', { number: issue.stageIndex + 1 }) : ''}{issue.message}</li>)}</ul></div>}
    <fieldset className="view-lock" disabled={readOnly}>
    {isRoute(node) && (isDrawScene(node.stages[0]) ? <DrawGames definition={definition} node={node} onChange={onChange} /> : <RouteNames definition={definition} node={node} onChange={onChange} />)}
    <Section key={`next-${node.key}`} title={t('whereNext')} memory="Where next" open summary={nextSummary(definition, node)}><NextFields definition={definition} node={node} onChange={onChange} /></Section>
    </fieldset>
    {confirming && <ConfirmDialog title={t('deleteAsk', { title: text.title })} text={t('deleteText')} confirm={t('deleteConfirm')}
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
  if (decide.method === 'draw') return <><DrawGames definition={definition} node={node} onChange={onChange} /><p className="hint">{t('drawHint')}</p></>;
  return <>
    <RouteNames definition={definition} node={node} onChange={onChange} />
    <Segmented label={t('whoDecides')} value={decide.method} choices={[{ value: 'players', label: t('everyoneVotes') }, { value: 'captains', label: t('captainsVote') }, { value: 'host', label: t('theHost') }]} onChange={method => setDecide({ method })} />
    {decide.method !== 'host' && <>
      <Segmented label={t('onTie')} value={decide.tie ?? 'random'} choices={[{ value: 'random', label: t('randomTied') }, { value: 'host', label: t('hostDecides') }]} onChange={tie => setDecide({ tie })} />
      <Segmented label={t('noVotes')} value={decide.noVotes ?? 'random'} choices={[{ value: 'random', label: t('randomRoute') }, { value: 'host', label: t('hostDecides') }]} onChange={noVotes => setDecide({ noVotes })} />
      <Segmented label={t('counts')} value={decide.counts ?? 'reveal'} choices={[{ value: 'reveal', label: t('announced') }, { value: 'live', label: t('live') }, { value: 'never', label: t('never') }]} onChange={counts => setDecide({ counts })} />
    </>}
  </>;
}

/**
 * A minigame draw's games (its outputs), in both editors: which minigame each one is, removing one,
 * and adding another (the first minigame not in the draw yet). A game is in the draw once.
 */
function DrawGames({ definition, node, onChange }: { definition: Definition; node: Node; onChange: Change }) {
  const options = optionsOf(node);
  const games = options.map(option => drawGameOf(definition, node.key, option));
  const unused = MINIGAME_KEYS.find(key => !games.includes(key));
  return <fieldset><legend>{t('drawGames')}</legend>
    {options.map((option, position) => <div key={option.key} className="option-row">
      <Dropdown label={t('drawGameN', { number: position + 1 })} value={games[position] ?? ''} placeholder={option.label}
        onChange={game => onChange(withDrawGame(definition, node.key, option.key, game as MinigameKey), `${node.key}:draw-${option.key}`)}
        options={MINIGAME_KEYS.map(key => ({ value: key, label: TEAM_MINIGAMES.includes(key) ? t('teamGameRound', { game: gameName(key) }) : gameName(key), disabled: key !== games[position] && games.includes(key) }))} />
      <button type="button" className="small-button icon-only danger-icon" disabled={options.length <= 2} aria-label={t('removeGame', { number: position + 1 })} title={t('removeGame', { number: position + 1 })}
        onClick={() => onChange(setRouteOptions(definition, node.key, options.filter(entry => entry.key !== option.key)))}><Icon name="trash" size={16} /></button></div>)}
    <button type="button" className="small-button" disabled={options.length >= 8 || !unused} onClick={() => unused && onChange(setRouteOptions(definition, node.key,
      [...options, { key: uniqueKey('game', options.map(entry => entry.key)), label: gameName(unused) }]))}><Icon name="plus" size={16} /> {t('addGame')}</button>
  </fieldset>;
}

/** A party choice's routes (its outputs): their names, and adding or removing one. In both editors. */
function RouteNames({ definition, node, onChange }: { definition: Definition; node: Node; onChange: Change }) {
  const options = optionsOf(node);
  return <fieldset><legend>{t('routes')}</legend>
    {options.map((option, position) => <div key={option.key} className="option-row">
      <input aria-label={t('routeName', { number: position + 1 })} value={option.label} maxLength={240} onChange={event => onChange(setRouteOptions(definition, node.key, options.map(entry => entry.key === option.key ? { ...entry, label: event.target.value } : entry)), `${node.key}:route-${option.key}`)} />
      <button className="icon-button danger-icon" disabled={options.length <= 2} aria-label={t('removeRoute', { number: position + 1 })} onClick={() => onChange(setRouteOptions(definition, node.key, options.filter(entry => entry.key !== option.key)))}>×</button></div>)}
    <button className="small-button" disabled={options.length >= 8} onClick={() => onChange(setRouteOptions(definition, node.key, [...options, { key: uniqueKey('route', options.map(entry => entry.key)), label: t('routeN', { number: options.length + 1 }) }]))}>{t('addRoute')}</button>
  </fieldset>;
}
