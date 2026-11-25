import { DEFAULT_REVEAL_EASING, RevealEasingSchema, DOT_COUNT_MAX, DOT_RANDOM_MIN, DOT_VIEW_MAX_SECONDS, DOT_VIEW_MIN_SECONDS, isMinigameKey, isSharedPrediction, isStepMinigame, MINIGAME_KEYS, MINIGAMES, minigameScoring, minigameTiebreak, parseMinigameSettings, placePoints, PlacesSchema, ROULETTE_BET_FLOOR, type MinigameKey, type MinigameSettings, type Places } from '@party/contracts';
import { NumberChoiceFields, NUMBER_CHOICE_TEXTS } from './number-choice-fields.js';
import { GraphFields } from './graph-fields.js';
import { SpeedRunCourseFields } from './speed-run-course.js';
import { PlacesFields } from './places-fields.js';
import { useState, type ReactNode } from 'react';
import { MINIGAME_GROUPS } from '../../controls/minigame-groups.js';
import { ChoiceDialog } from '../../controls/choice-dialog.js';
import { updateStage, withMinigame, type Definition, type Node, type Stage } from '../../model.js';
import { Segmented } from '../../controls/segmented.js';
import { ANIMATION_TEXTS } from '../../../minigames/relay-drawing/animation-relay.js';
import { translate, useTexts } from '../../../i18n/texts.js';
import { FIELDS_TEXTS } from '../fields.text.js';
import { gameDescription, gameName } from '../../../presentation/catalog.text.js';
const t = (key: keyof typeof FIELDS_TEXTS.en, values?: Record<string, string | number>) => translate(FIELDS_TEXTS, key, values);
import { InfoTip } from '../../controls/info-tip.js';
import { MinigameDrawFields } from './minigame-draw-fields.js';

const rainbow = () => t('rainbow');
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
export function MinigameFields({ part, definition, node, index, onChange, inDraw = false }: { part: 'settings' | 'points'; definition: Definition; node: Node; index: number; onChange: Change; inDraw?: boolean }) {
  const a = useTexts(ANIMATION_TEXTS);
  const numberText = useTexts(NUMBER_CHOICE_TEXTS);
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
  if (part === 'points' && game === 'red-or-black-roulette') {
    // Roulette pays what the bets win, not points by place; the round only sets the minimum stake.
    const floor = (settings as MinigameSettings<'red-or-black-roulette'> | null)?.betFloor ?? ROULETTE_BET_FLOOR;
    return <>
      <label className="ed-inline">{t('betFloor')}<span className="ed-unit">
        <input type="number" min={0} max={10_000} value={floor} aria-describedby="roulette-floor-hint"
          onChange={event => { const value = Math.round(Number(event.currentTarget.value)); if (Number.isFinite(value)) setSettings({ betFloor: Math.min(10_000, Math.max(0, value)) }, 'bet-floor'); }} />{t('pts')}
      </span></label>
      <p className="hint" id="roulette-floor-hint">{t('betFloorHint')}</p>
    </>;
  }
  if (part === 'points' && isSharedPrediction(game)) {
    const parsed = PlacesSchema.safeParse(places);
    const amount = (parsed.success ? placePoints(parsed.data)[0] : placement[0]) ?? '0';
    return <label className="ed-inline">{t('coinPoints')}<span className="ed-unit">
      <input type="number" min={0} value={toPoints(amount)}
        onChange={event => setPlaces({ kind: 'list', pointsMilli: [toMilli(event.currentTarget.value)] })} />{t('pts')}
    </span></label>;
  }
  if (part === 'points') return known && game !== 'lucky-doors' ? <>
    {MINIGAMES[game].closeness ? <ClosenessFields game={game} stage={stage} placement={placement} edit={edit} places={<PlacesFields legend={t('byPlace')} hint={t('byPlaceHint')} required value={places} onChange={setPlaces} fallback={placement} />} />
      : <PlacesFields legend={t('byPlace')} hint={t('byPlaceHint')} required value={places} onChange={setPlaces} fallback={placement} />}
    {game !== 'relay-drawing' && game !== 'draw-the-graph' && <Segmented label={t('teamResult')} value={String(stage['teamResult'] ?? 'average')} onChange={teamResult => edit(current => ({ ...current, teamResult }), 'team-result')}
      choices={[{ value: 'average', label: t('average') }, { value: 'best', label: t('best') }, ...(MINIGAMES[game].better === 'higher' ? [{ value: 'total', label: t('added') }] : [])]} />}
    {/* Only for minigames where speed can settle a tie; leaving the standard removes the field. */}
    {MINIGAMES[game].tiebreak && !minigameScoring(game, stage['scoring']) && <Segmented label={t('tiebreak')} value={minigameTiebreak(game, stage['tiebreak'] === 'shared' ? 'shared' : undefined)}
      onChange={tiebreak => edit(current => { const copy: Stage = { ...current }; if (tiebreak === 'shared') copy['tiebreak'] = 'shared'; else delete copy['tiebreak']; return copy; }, 'tiebreak')}
      choices={[{ value: 'faster', label: t('tieFaster') }, { value: 'shared', label: t('tieShared') }]} />}
  </> : null;
  // One game or a draw in this one scene. A draw's games are each set with their pencil: the usual settings below,
  // on a stand-in scene of that game (inside the draw, without the choice again).
  const drawChoice = !inDraw && known && <MinigameDrawFields definition={definition} node={node} index={index} onChange={onChange}
    settingsFor={(standIn, onStage) => {
      const virtual = { ...definition, nodes: definition.nodes.map(entry => entry.key === node.key ? { ...entry, stages: entry.stages.map((current, at) => at === index ? standIn : current) } : entry) } as Definition;
      return <MinigameFields part="settings" inDraw definition={virtual} node={virtual.nodes.find(entry => entry.key === node.key)!} index={index}
        onChange={next => { const changed = next.nodes.find(entry => entry.key === node.key)?.stages[index]; if (changed) onStage(changed); }} />;
    }} />;
  if (!inDraw && Array.isArray(stage['draw'])) return <div className="minigame-fields">{drawChoice}</div>;
  return <div className="minigame-fields">
    {drawChoice}
    {inDraw ? null : known ? <div className="configuration-game"><strong>{gameName(game)}</strong>
      <button type="button" className="small-button" onClick={() => setPicking(true)}>{t('changeMinigame')}</button></div>
    : <button type="button" className="small-button" onClick={() => setPicking(true)}>{t('chooseMinigame')}</button>}
    {/* A new minigame starts from its own defaults and a fitting timer; a team minigame gets round-only teams of two, which the host can change. */}
    {picking && <ChoiceDialog title={t('chooseTitle')} intro={t('chooseIntro')} value={known ? game : undefined}
      choices={MINIGAME_KEYS.map(key => ({ value: key, label: gameName(key), description: gameDescription(key), icon: 'minigame' }))}
      groups={MINIGAME_GROUPS.map(group => ({ key: group.key, name: group.name, values: group.games }))}
      onPick={next => { setPicking(false); if (next !== game) edit(current => withMinigame(current, next as MinigameKey, definition), 'game'); }} onClose={() => setPicking(false)} />}
    {known && !settings && <p className="hint warn" role="alert">{t('misfit')} <button type="button" className="small-button" onClick={() => edit(current => { const copy = { ...current }; delete copy['settings']; return copy; }, 'reset')}>{t('standardSettings')}</button></p>}
    {game === 'draw-the-graph' && settings && <GraphFields key={`${node.key}:${index}`} graph={(stage['settings'] as MinigameSettings<'draw-the-graph'> | undefined)?.graph}
      onChange={graph => edit(current => ({ ...current, settings: { ...(current['settings'] as MinigameSettings<'draw-the-graph'> | undefined), graph } }), 'graph-data')} />}
    {(game === 'count-the-dots' || game === 'draw-the-graph') && settings && <label>{t('revealEasing')}
      <select value={(settings as MinigameSettings<'count-the-dots' | 'draw-the-graph'>).revealEasing ?? DEFAULT_REVEAL_EASING}
        onChange={event => setSettings({ ...settings, revealEasing: RevealEasingSchema.parse(event.currentTarget.value) }, 'reveal-easing')}>
        {RevealEasingSchema.options.map(value => <option key={value} value={value}>{t(value)}</option>)}
      </select>
    </label>}
    {game === 'cut-the-line' && settings && <NumberChoiceFields label={numberText('target')}
      value={(settings as MinigameSettings<'cut-the-line'>).target} min={0} max={100} initial={37} range={[25, 75]}
      onChange={target => setSettings(target ? { target } : {}, 'cut-target')} />}
    {game === 'count-the-dots' && settings && (() => {
      const dots = settings as MinigameSettings<'count-the-dots'>;
      return <>
        <NumberChoiceFields label={numberText('count')} value={dots.count} min={1} max={DOT_COUNT_MAX} initial={20} range={[DOT_RANDOM_MIN, DOT_COUNT_MAX]}
          onChange={count => setSettings({ ...dots, count }, 'dot-count')} />
        <label className="choice"><input type="checkbox" checked={dots.allowOverlap ?? false}
          onChange={event => setSettings({ ...dots, allowOverlap: event.currentTarget.checked }, 'dot-overlap')} />{numberText('overlap')}</label>
        <label className="ed-inline">{t('dotViewTime')}
          <span className="ed-unit"><input type="number" min={DOT_VIEW_MIN_SECONDS} max={DOT_VIEW_MAX_SECONDS} step={1}
            value={dots.viewSeconds} onChange={event => {
              const viewSeconds = event.currentTarget.valueAsNumber;
              if (Number.isInteger(viewSeconds) && viewSeconds >= DOT_VIEW_MIN_SECONDS && viewSeconds <= DOT_VIEW_MAX_SECONDS) setSettings({ ...dots, viewSeconds }, 'dot-view-time');
            }} />{t('sec')}</span>
        </label>
      </>;
    })()}

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
    {game === 'heads-or-tails' && settings && <Segmented label={t('coinFlip')} value={(settings as MinigameSettings<'heads-or-tails'>).flip ?? 'auto'}
      choices={[{ value: 'auto', label: t('flipAuto') }, { value: 'host', label: t('flipHost') }]}
      onChange={flip => setSettings(flip === 'host' ? { flip: 'host' } : {}, 'flip')} />}
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

/**
 * How a target minigame gives points: by place (the places fields), close enough (everyone within a
 * distance gets the same points) or a sliding scale (fewer points the further off). Distances are in
 * the game's unit; Stop the clock is edited in seconds and stored in milliseconds.
 */
function ClosenessFields({ game, stage, placement, edit, places }: { game: MinigameKey; stage: Stage; placement: string[]; places: ReactNode;
  edit: (change: (current: Stage) => Stage, field: string) => void }) {
  const closeness = MINIGAMES[game].closeness!; const scoring = minigameScoring(game, stage['scoring']);
  const seconds = closeness.unit === 'ms';
  const unit = closeness.unit === 'degrees' ? '°' : closeness.unit === 'dots' ? t('unitDots') : seconds ? t('unitSeconds') : '%';
  const choose = (kind: string) => edit(current => {
    const copy: Stage = { ...current };
    if (kind === 'within' || kind === 'scale') copy['scoring'] = { kind, distance: closeness[kind], pointsMilli: scoring?.pointsMilli ?? placement[0] ?? '10000' };
    else delete copy['scoring'];
    return copy;
  }, 'scoring');
  const change = (next: Partial<NonNullable<typeof scoring>>) => edit(current => ({ ...current, scoring: { ...scoring!, ...next } }), 'scoring');
  const lowest = scoring?.kind === 'scale' ? 1 : 0;
  return <>
    <Segmented label={t('scoring')} value={scoring?.kind ?? 'places'} onChange={choose}
      choices={[{ value: 'places', label: t('byPlaceChoice') }, { value: 'within', label: t('closeEnough') }, { value: 'scale', label: t('slidingScale') }]} />
    {scoring ? <>
      <label className="ed-inline">{t(scoring.kind === 'within' ? 'withinPoints' : 'scalePoints')}<span className="ed-unit">
        <input type="number" min={0} value={toPoints(scoring.pointsMilli)} onChange={event => change({ pointsMilli: toMilli(event.currentTarget.value) })} />{t('pts')}
      </span></label>
      <label className="ed-inline">{t(scoring.kind === 'within' ? 'withinDistance' : 'scaleDistance')}<span className="ed-unit">
        <input type="number" min={seconds ? lowest / 1000 : lowest} max={seconds ? closeness.max / 1000 : closeness.max} step={seconds ? 0.05 : 1} value={seconds ? scoring.distance / 1000 : scoring.distance}
          aria-describedby="closeness-hint"
          onChange={event => { const typed = Number(event.currentTarget.value); if (Number.isFinite(typed)) change({ distance: Math.min(closeness.max, Math.max(lowest, Math.round(seconds ? typed * 1000 : typed))) }); }} />{unit}
      </span></label>
      <p className="hint" id="closeness-hint">{t(scoring.kind === 'within' ? 'withinHint' : 'scaleHint')}</p>
    </> : places}
  </>;
}
