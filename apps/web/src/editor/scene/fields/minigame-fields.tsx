import { DOT_VIEW_MAX_SECONDS, DOT_VIEW_MIN_SECONDS, isMinigameKey, isSharedPrediction, isStepMinigame, MINIGAME_KEYS, MINIGAMES, parseMinigameSettings, placePoints, PlacesSchema, type MinigameKey, type MinigameSettings, type Places } from '@party/contracts';
import { GraphFields } from './graph-fields.js';
import { SpeedRunCourseFields } from './speed-run-course.js';
import { PlacesFields } from './places-fields.js';
import { useState } from 'react';
import { ChoiceDialog } from '../../controls/choice-dialog.js';
import { updateStage, withMinigame, type Definition, type Node, type Stage } from '../../model.js';
import { Segmented } from '../../controls/segmented.js';
import { ANIMATION_TEXTS } from '../../../minigames/relay-drawing/animation-relay.js';
import { translate, useTexts } from '../../../i18n/texts.js';
import { FIELDS_TEXTS } from '../fields.text.js';
import { gameDescription, gameHowToPlay, gameName } from '../../../presentation/catalog.text.js';
const t = (key: keyof typeof FIELDS_TEXTS.en, values?: Record<string, string | number>) => translate(FIELDS_TEXTS, key, values);
import { InfoTip } from '../../controls/info-tip.js';

const rainbow = () => t('rainbow');
/** The minigame picker's tabs: what kind of game it is. */
const MINIGAME_GROUPS: { key: string; name: string; games: MinigameKey[] }[] = [
  { key: 'speed', get name() { return t('gSpeed'); }, games: ['reaction', 'tap-race', 'clap-beat', 'speed-run', 'stop-clock'] },
  { key: 'precision', get name() { return t('gPrecision'); }, games: ['cut-the-line', 'match-the-angle', 'count-the-dots'] },
  { key: 'skill', get name() { return t('gDrawing'); }, games: ['perfect-circle', 'draw-the-graph', 'relay-drawing'] },
  { key: 'luck', get name() { return t('gLuck'); }, games: ['lucky-doors', 'majority', 'heads-or-tails', 'red-or-black-roulette'] },
  { key: 'drinking', get name() { return t('gDrinking'); }, games: ['bus'] },
];

type Change = (next: Definition, group?: string) => void;
const toPoints = (milli: string) => String(Number(milli) / 1000);
const toMilli = (text: string) => { const value = Math.round(Number(text)); return Number.isFinite(value) && value >= 0 ? String(Math.min(value, 999_999_999) * 1000) : '0'; };
const seconds = (ms: number) => String(ms / 1000);
const ms = (text: string, min: number, max: number) => Math.round(Math.min(max, Math.max(min, Number(text) || 0)) * 1000);

/**
 * A minigame's settings (`part="settings"`) or its points (`part="points"`). Which
 * minigame is chosen when the scene is added; it is only asked here for a scene
 * whose minigame is still to be chosen (for example one imported from text).
 */
export function MinigameFields({ part, definition, node, index, onChange }: { part: 'settings' | 'points'; definition: Definition; node: Node; index: number; onChange: Change }) {
  const a = useTexts(ANIMATION_TEXTS);
  const stage = node.stages[index]!; const game = String(stage['game'] ?? '');
  const edit = (change: (current: Stage) => Stage, field: string) => onChange(updateStage(definition, node.key, index, change), `${node.key}:${index}:${field}`);
  const known = isMinigameKey(game); const [picking, setPicking] = useState(false);
  // Played in teams: the round's own teams, or the game's (from a Pick teams scene).
  const inTeams = (stage['play'] as { kind?: string } | undefined)?.kind === 'teams' || ((definition['play'] as { kind?: string } | undefined)?.kind === 'teams' && (stage['play'] as { kind?: string } | undefined)?.kind !== 'solo');
  const settings = known ? parseMinigameSettings(game, stage['settings']) : null;
  const setSettings = (next: MinigameSettings, field: string) => edit(current => ({ ...current, settings: next }), field);
  // Points by place: `places` (a list or a split total); older scenes keep `placementMilli` until changed here.
  const placement = (stage['placementMilli'] as string[] | undefined) ?? ['10000', '6000', '3000'];
  const places = (stage['places'] as Places | undefined) ?? { kind: 'list' as const, pointsMilli: placement };
  const setPlaces = (next: Places | undefined) => edit(current => { const copy: Stage = { ...current }; delete copy['placementMilli']; if (next) copy['places'] = next; else delete copy['places']; return copy; }, 'placement');
  if (part === 'points' && isSharedPrediction(game)) {
    const parsed = PlacesSchema.safeParse(places);
    const amount = (parsed.success ? placePoints(parsed.data)[0] : placement[0]) ?? '0';
    return <label className="ed-inline">{t('coinPoints')}<span className="ed-unit">
      <input type="number" min={0} value={toPoints(amount)}
        onChange={event => setPlaces({ kind: 'list', pointsMilli: [toMilli(event.currentTarget.value)] })} />{t('pts')}
    </span></label>;
  }
  if (part === 'points') return known && game !== 'lucky-doors' ? <>
    <PlacesFields legend={t('byPlace')} hint={t('byPlaceHint')} required value={places} onChange={setPlaces} fallback={placement} />
    {game !== 'relay-drawing' && game !== 'draw-the-graph' && <Segmented label={t('teamResult')} value={String(stage['teamResult'] ?? 'average')} onChange={teamResult => edit(current => ({ ...current, teamResult }), 'team-result')}
      choices={[{ value: 'average', label: t('average') }, { value: 'best', label: t('best') }, ...(MINIGAMES[game].better === 'higher' ? [{ value: 'total', label: t('added') }] : [])]} />}
  </> : null;
  return <div className="minigame-fields">
    {known ? <div className="ed-chosen"><strong>{gameName(game)}</strong><span>{gameHowToPlay(game)}</span>
      <button type="button" className="small-button" onClick={() => setPicking(true)}>{t('changeMinigame')}</button></div>
    : <button type="button" className="small-button" onClick={() => setPicking(true)}>{t('chooseMinigame')}</button>}
    {/* A new minigame starts from its own defaults and a fitting timer; a team minigame gets round-only teams of two, which the host can change. */}
    {picking && <ChoiceDialog title={t('chooseTitle')} intro={t('chooseIntro')} value={known ? game : undefined}
      choices={MINIGAME_KEYS.map(key => ({ value: key, label: gameName(key), description: gameDescription(key), icon: 'minigame' }))}
      groups={MINIGAME_GROUPS.map(group => ({ key: group.key, name: group.name, values: group.games }))}
      onPick={next => { setPicking(false); if (next !== game) edit(current => withMinigame(current, next as MinigameKey, definition), 'game'); }} onClose={() => setPicking(false)} />}
    {known && !settings && <p className="hint warn" role="alert">{t('misfit')} <button type="button" className="small-button" onClick={() => edit(current => { const copy = { ...current }; delete copy['settings']; return copy; }, 'reset')}>{t('standardSettings')}</button></p>}
    {game === 'draw-the-graph' && settings && <GraphFields key={`${node.key}:${index}`} graph={(stage['settings'] as MinigameSettings<'draw-the-graph'> | undefined)?.graph}
      onChange={graph => setSettings(graph ? { graph } : {}, 'graph-data')} />}
    {game === 'count-the-dots' && settings && <label className="ed-inline">{t('dotViewTime')}
      <span className="ed-unit"><input type="number" min={DOT_VIEW_MIN_SECONDS} max={DOT_VIEW_MAX_SECONDS} step={1}
        value={(settings as MinigameSettings<'count-the-dots'>).viewSeconds} onChange={event => {
          const viewSeconds = event.currentTarget.valueAsNumber;
          if (Number.isInteger(viewSeconds) && viewSeconds >= DOT_VIEW_MIN_SECONDS && viewSeconds <= DOT_VIEW_MAX_SECONDS) setSettings({ viewSeconds }, 'dot-view-time');
        }} />{t('sec')}</span>
    </label>}

    {game === 'reaction' && settings && (() => { const value = settings as MinigameSettings<'reaction'>; return <div className="field-pair">
      <label>{t('earliest')}<input type="number" min={1} max={10} step={0.5} value={seconds(value.minWaitMs)} onChange={event => setSettings({ ...value, minWaitMs: ms(event.target.value, 1, 10) }, 'min')} /></label>
      <label>{t('latest')}<input type="number" min={1} max={15} step={0.5} value={seconds(value.maxWaitMs)} onChange={event => setSettings({ ...value, maxWaitMs: ms(event.target.value, 1, 15) }, 'max')} /></label>
    </div>; })()}
    {game === 'tap-race' && settings && <label>{t('raceLength')}<input type="number" min={3} max={60} value={(settings as MinigameSettings<'tap-race'>).seconds}
      onChange={event => setSettings({ seconds: Math.round(Math.min(60, Math.max(3, Number(event.target.value) || 3))) }, 'seconds')} /></label>}
    {game === 'speed-run' && settings && <SpeedRunCourseFields key={`${node.key}:${index}`} course={(settings as MinigameSettings<'speed-run'>).course}
      onChange={course => setSettings(course ? { course } : {}, 'course')} />}
    {game === 'stop-clock' && settings && (() => { const value = settings as MinigameSettings<'stop-clock'>; return <div className="field-pair">
      <label>{t('target')}<input type="number" min={2} max={60} step={0.5} value={seconds(value.targetMs)} onChange={event => setSettings({ ...value, targetMs: ms(event.target.value, 2, 60) }, 'target')} /></label>
      <label>{t('disappears')}<input type="number" min={0} max={60} step={0.5} value={seconds(value.visibleMs)} onChange={event => setSettings({ ...value, visibleMs: ms(event.target.value, 0, 60) }, 'visible')} /></label>
    </div>; })()}
    {game === 'lucky-doors' && settings && (() => { const doors = (settings as MinigameSettings<'lucky-doors'>).doorsMilli; return <div className="door-list">
      <Segmented label={t('behindDoor')} value={(settings as MinigameSettings<'lucky-doors'>).order ?? 'random'} choices={[{ value: 'random', label: t('shuffled') }, { value: 'fixed', label: t('asListed') }]}
        onChange={order => setSettings({ ...(settings as MinigameSettings<'lucky-doors'>), ...(order === 'fixed' ? { order: 'fixed' } : { order: undefined }) } as MinigameSettings<'lucky-doors'>, 'order')} />
      <p className="field-title">{t('doorPoints')}{t((settings as MinigameSettings<'lucky-doors'>).order === 'fixed' ? 'doorFixed' : 'doorShuffled')}</p>
      {doors.map((door, position) => <div key={position} className="option-row"><label>{t('door', { number: position + 1 })}<input type="number" min={0} value={toPoints(door)} onChange={event => setSettings({ ...(settings as MinigameSettings<'lucky-doors'>), doorsMilli: doors.map((entry, at) => at === position ? toMilli(event.target.value) : entry) }, `door-${position}`)} /></label>
        <button className="small-button" disabled={doors.length <= 2} aria-label={t('removeDoor', { number: position + 1 })} onClick={() => setSettings({ ...(settings as MinigameSettings<'lucky-doors'>), doorsMilli: doors.filter((_, at) => at !== position) }, 'doors')}>{t('remove')}</button></div>)}
      <button className="small-button" disabled={doors.length >= 8} onClick={() => setSettings({ ...(settings as MinigameSettings<'lucky-doors'>), doorsMilli: [...doors, '0'] }, 'doors')}>{t('addDoor')}</button>
    </div>; })()}

    {game === 'perfect-circle' && settings && <label>{t('circleTime')}<input type="number" min={3} max={30} value={(settings as MinigameSettings<'perfect-circle'>).seconds}
      onChange={event => setSettings({ seconds: Math.round(Math.min(30, Math.max(3, Number(event.target.value) || 3))) }, 'seconds')} /></label>}
    {game === 'relay-drawing' && settings && (() => { const value = settings as MinigameSettings<'relay-drawing'>; return <>
      <div className="field-pair">
        <label>{t('perTurn')}<input type="number" min={5} max={60} value={value.secondsPerTurn} onChange={event => setSettings({ ...value, secondsPerTurn: Math.round(Math.min(60, Math.max(5, Number(event.target.value) || 5))) }, 'turn')} /></label>
        <label>{t('toVote')}<input type="number" min={10} max={120} value={value.voteSeconds} onChange={event => setSettings({ ...value, voteSeconds: Math.round(Math.min(120, Math.max(10, Number(event.target.value) || 10))) }, 'vote')} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={value.animation === true} onChange={event => setSettings({ ...value, animation: event.target.checked }, 'animation')} />{a('settings')}</label>
      <p className="hint">{value.animation ? a('settingsHint') : t('relayHint')}</p></>; })()}
    {game === 'bus' && settings && (() => { const sips = (settings as MinigameSettings<'bus'>).sips; return <div className="door-list">
      <p className="field-title">{t('sips')}</p>
      <div className="field-pair">{[t('redBlack'), t('higherLower'), t('insideOutside'), t('whichSuit')].map((round, position) => <label key={position}>{round}<input type="number" min={0} max={20} value={sips[position]}
        onChange={event => setSettings({ sips: sips.map((entry, at) => at === position ? Math.round(Math.min(20, Math.max(0, Number(event.target.value) || 0))) : entry) }, `sips-${position}`)} /></label>)}</div>
      <div className="check-row"><label className="choice"><input type="checkbox" aria-describedby="bus-rainbow-hint" checked={(settings as MinigameSettings<'bus'>).rainbow !== false} onChange={event => setSettings({ ...(settings as MinigameSettings<'bus'>), rainbow: event.target.checked }, 'rainbow')} />
        {t('rainbowRule')}</label><span id="bus-rainbow-hint" hidden>{rainbow()}</span><InfoTip label={t('aboutRainbow')}>{rainbow()}</InfoTip></div>
      <p className="hint">{t('busHint')}</p>
    </div>; })()}
    {game === 'majority' && <p className="hint">{t('majorityHint')}</p>}
    {/* A step game in a team round: how the team decides each move, and the time for a team vote. */}
    {known && isStepMinigame(game) && inTeams && <div className="step-decide-fields">
      <Segmented label={t('teamDecides')} stacked value={String(stage['decide'] ?? 'anyone')} onChange={decide => edit(current => { const copy: Stage = { ...current }; if (decide === 'anyone') delete copy['decide']; else copy['decide'] = decide; return copy; }, 'decide')}
        choices={[{ value: 'anyone', label: t('anyoneTaps'), hint: t('anyoneHint') }, { value: 'vote', label: t('teamVotes'), hint: t('teamVotesHint') },
          { value: 'captain', label: t('captainDecides'), hint: t('captainHint') }]} />
      {stage['decide'] === 'vote' && <label className="ed-inline">{t('perVote')}<span className="ed-unit"><input type="number" min={5} max={120} value={Number(stage['voteSeconds'] ?? 20)}
        onChange={event => edit(current => ({ ...current, voteSeconds: Math.round(Math.min(120, Math.max(5, Number(event.target.value) || 20))) }), 'vote-seconds')} />{t('sec')}</span></label>}
    </div>}
  </div>;
}
