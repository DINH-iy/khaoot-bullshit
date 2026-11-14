import { isMinigameKey, MINIGAME_KEYS, MINIGAMES, parseMinigameSettings, TEAM_MINIGAMES, type MinigameKey, type MinigameSettings, type Places } from '@party/contracts';
import { PlacesFields } from './places-fields.js';
import { ROUND_TEAMS_PLAY, updateStage, type Definition, type Node, type Stage } from './model.js';

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
  const stage = node.stages[index]!; const game = String(stage['game'] ?? '');
  const edit = (change: (current: Stage) => Stage, field: string) => onChange(updateStage(definition, node.key, index, change), `${node.key}:${index}:${field}`);
  const known = isMinigameKey(game);
  const settings = known ? parseMinigameSettings(game, stage['settings']) : null;
  const setSettings = (next: MinigameSettings, field: string) => edit(current => ({ ...current, settings: next }), field);
  // Points by place: `places` (a list or a split total); older scenes keep `placementMilli` until changed here.
  const placement = (stage['placementMilli'] as string[] | undefined) ?? ['10000', '6000', '3000'];
  const places = (stage['places'] as Places | undefined) ?? { kind: 'list' as const, pointsMilli: placement };
  const setPlaces = (next: Places | undefined) => edit(current => { const copy: Stage = { ...current }; delete copy['placementMilli']; if (next) copy['places'] = next; else delete copy['places']; return copy; }, 'placement');
  if (part === 'points') return known && game !== 'lucky-doors' ? <>
    <PlacesFields legend="Points by place" hint="The best results get these, given when the results are shown." required value={places} onChange={setPlaces} fallback={placement} />
    {game !== 'relay-drawing' && <label>In a team round, a team’s result is<select value={String(stage['teamResult'] ?? 'average')} onChange={event => edit(current => ({ ...current, teamResult: event.target.value }), 'team-result')}>
      <option value="average">The average of its players</option><option value="best">Its best player</option>{MINIGAMES[game].better === 'higher' && <option value="total">Everyone added up</option>}</select></label>}
  </> : null;
  return <div className="minigame-fields">
    {known ? <div className="ed-chosen"><strong>{MINIGAMES[game].name}</strong><span>{MINIGAMES[game].howToPlay}</span></div>
    : <label>Choose the minigame<select value="" onChange={event => {
      const next = event.target.value as MinigameKey;
      // A new minigame starts from its own defaults and a fitting timer.
      // Pass the pencil needs teams: switching to it sets this round to round-only teams of two, which the host can change.
      edit(current => { const copy: Stage = { ...current, game: next, durationMs: MINIGAMES[next].defaultSeconds * 1000 }; delete copy['settings'];
        if (TEAM_MINIGAMES.includes(next) && (copy['play'] as { kind?: string } | undefined)?.kind !== 'teams' && (definition['play'] as { kind?: string } | undefined)?.kind !== 'teams')
          copy['play'] = structuredClone(ROUND_TEAMS_PLAY);
        return copy; }, 'game');
    }}>
      <option value="" disabled>Choose a minigame</option>
      {MINIGAME_KEYS.map(key => <option key={key} value={key}>{MINIGAMES[key].name}: {MINIGAMES[key].description}</option>)}</select></label>}
    {known && !settings && <p className="hint warn" role="alert">These settings do not fit together. <button className="link-button" onClick={() => edit(current => { const copy = { ...current }; delete copy['settings']; return copy; }, 'reset')}>Use the standard settings</button></p>}

    {game === 'reaction' && settings && (() => { const value = settings as MinigameSettings<'reaction'>; return <div className="field-pair">
      <label>Earliest GO (sec)<input type="number" min={1} max={10} step={0.5} value={seconds(value.minWaitMs)} onChange={event => setSettings({ ...value, minWaitMs: ms(event.target.value, 1, 10) }, 'min')} /></label>
      <label>Latest GO (sec)<input type="number" min={1} max={15} step={0.5} value={seconds(value.maxWaitMs)} onChange={event => setSettings({ ...value, maxWaitMs: ms(event.target.value, 1, 15) }, 'max')} /></label>
    </div>; })()}
    {game === 'tap-race' && settings && <label>Race length (seconds)<input type="number" min={3} max={60} value={(settings as MinigameSettings<'tap-race'>).seconds}
      onChange={event => setSettings({ seconds: Math.round(Math.min(60, Math.max(3, Number(event.target.value) || 3))) }, 'seconds')} /></label>}
    {game === 'stop-clock' && settings && (() => { const value = settings as MinigameSettings<'stop-clock'>; return <div className="field-pair">
      <label>Target (seconds)<input type="number" min={2} max={60} step={0.5} value={seconds(value.targetMs)} onChange={event => setSettings({ ...value, targetMs: ms(event.target.value, 2, 60) }, 'target')} /></label>
      <label>Clock disappears after (seconds)<input type="number" min={0} max={60} step={0.5} value={seconds(value.visibleMs)} onChange={event => setSettings({ ...value, visibleMs: ms(event.target.value, 0, 60) }, 'visible')} /></label>
    </div>; })()}
    {game === 'lucky-doors' && settings && (() => { const doors = (settings as MinigameSettings<'lucky-doors'>).doorsMilli; return <div className="door-list">
      <p className="field-title">Points behind the doors (shuffled every game)</p>
      {doors.map((door, position) => <div key={position} className="option-row"><label>Door {position + 1}<input type="number" min={0} value={toPoints(door)} onChange={event => setSettings({ doorsMilli: doors.map((entry, at) => at === position ? toMilli(event.target.value) : entry) }, `door-${position}`)} /></label>
        <button className="small-button" disabled={doors.length <= 2} aria-label={`Remove door ${position + 1}`} onClick={() => setSettings({ doorsMilli: doors.filter((_, at) => at !== position) }, 'doors')}>Remove</button></div>)}
      <button className="small-button" disabled={doors.length >= 8} onClick={() => setSettings({ doorsMilli: [...doors, '0'] }, 'doors')}>Add a door</button>
    </div>; })()}

    {game === 'perfect-circle' && settings && <label>Time to draw the circle (seconds)<input type="number" min={3} max={30} value={(settings as MinigameSettings<'perfect-circle'>).seconds}
      onChange={event => setSettings({ seconds: Math.round(Math.min(30, Math.max(3, Number(event.target.value) || 3))) }, 'seconds')} /></label>}
    {game === 'relay-drawing' && settings && (() => { const value = settings as MinigameSettings<'relay-drawing'>; return <>
      <div className="field-pair">
        <label>Seconds per turn<input type="number" min={5} max={60} value={value.secondsPerTurn} onChange={event => setSettings({ ...value, secondsPerTurn: Math.round(Math.min(60, Math.max(5, Number(event.target.value) || 5))) }, 'turn')} /></label>
        <label>Seconds to vote<input type="number" min={10} max={120} value={value.voteSeconds} onChange={event => setSettings({ ...value, voteSeconds: Math.round(Math.min(120, Math.max(10, Number(event.target.value) || 10))) }, 'vote')} /></label>
      </div>
      <p className="hint">Played in teams: set “Who plays this” below to teams. Every team gets as many turns as the biggest team has players. The question above is what they draw.</p></>; })()}
  </div>;
}
