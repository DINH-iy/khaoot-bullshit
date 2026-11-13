import { isMinigameKey, MINIGAME_KEYS, MINIGAMES, parseMinigameSettings, TEAM_MINIGAMES, type MinigameKey, type MinigameSettings } from '@party/contracts';
import { updateStage, type Definition, type Node, type Stage } from './model.js';

type Change = (next: Definition, group?: string) => void;
const toPoints = (milli: string) => String(Number(milli) / 1000);
const toMilli = (text: string) => { const value = Math.round(Number(text)); return Number.isFinite(value) && value >= 0 ? String(Math.min(value, 999_999_999) * 1000) : '0'; };
const seconds = (ms: number) => String(ms / 1000);
const ms = (text: string, min: number, max: number) => Math.round(Math.min(max, Math.max(min, Number(text) || 0)) * 1000);
const ordinal = (place: number) => ['1st', '2nd', '3rd'][place - 1] ?? `${place}th`;

/** Which minigame, its settings, and the points for each place. Everything has a default. */
export function MinigameFields({ definition, node, index, onChange }: { definition: Definition; node: Node; index: number; onChange: Change }) {
  const stage = node.stages[index]!; const game = String(stage['game'] ?? '');
  const edit = (change: (current: Stage) => Stage, field: string) => onChange(updateStage(definition, node.key, index, change), `${node.key}:${index}:${field}`);
  const known = isMinigameKey(game);
  const settings = known ? parseMinigameSettings(game, stage['settings']) : null;
  const setSettings = (next: MinigameSettings, field: string) => edit(current => ({ ...current, settings: next }), field);
  const placement = (stage['placementMilli'] as string[] | undefined) ?? ['10000', '6000', '3000'];
  const setPlacement = (next: string[]) => edit(current => ({ ...current, placementMilli: next }), 'placement');
  return <fieldset className="minigame-fields"><legend>Minigame</legend>
    <label>Which minigame<select value={known ? game : ''} onChange={event => {
      const next = event.target.value as MinigameKey;
      // A new minigame starts from its own defaults and a fitting timer.
      // Pass the pencil needs teams: switching to it sets this round to round-only teams of two, which the host can change.
      edit(current => { const copy: Stage = { ...current, game: next, durationMs: MINIGAMES[next].defaultSeconds * 1000 }; delete copy['settings'];
        if (TEAM_MINIGAMES.includes(next) && (copy['play'] as { kind?: string } | undefined)?.kind !== 'teams' && (definition['play'] as { kind?: string } | undefined)?.kind !== 'teams')
          copy['play'] = { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'count', teams: 2 }, formation: 'random' } }, answers: 'everyone', points: 'members' };
        return copy; }, 'game');
    }}>
      {!known && <option value="" disabled>Choose a minigame</option>}
      {MINIGAME_KEYS.map(key => <option key={key} value={key}>{MINIGAMES[key].name}: {MINIGAMES[key].description}</option>)}</select></label>
    {known && <p className="hint">{MINIGAMES[game].howToPlay}</p>}
    {known && !settings && <p className="hint warn" role="alert">These settings do not fit together. <button className="link-button" onClick={() => edit(current => { const copy = { ...current }; delete copy['settings']; return copy; }, 'reset')}>Use the standard settings</button></p>}

    {game === 'reaction' && settings && (() => { const value = settings as MinigameSettings<'reaction'>; return <div className="field-pair">
      <label>Shortest wait for GO (seconds)<input type="number" min={1} max={10} step={0.5} value={seconds(value.minWaitMs)} onChange={event => setSettings({ ...value, minWaitMs: ms(event.target.value, 1, 10) }, 'min')} /></label>
      <label>Longest wait for GO (seconds)<input type="number" min={1} max={15} step={0.5} value={seconds(value.maxWaitMs)} onChange={event => setSettings({ ...value, maxWaitMs: ms(event.target.value, 1, 15) }, 'max')} /></label>
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
    {known && game !== 'lucky-doors' && <div className="placement-list"><p className="field-title">Points by place (a tie shares the place)</p>
      {placement.map((amount, position) => <div key={position} className="option-row"><label>{ordinal(position + 1)} place<input type="number" min={0} value={toPoints(amount)} onChange={event => setPlacement(placement.map((entry, at) => at === position ? toMilli(event.target.value) : entry))} /></label>
        <button className="small-button" disabled={placement.length <= 1} aria-label={`Remove ${ordinal(position + 1)} place`} onClick={() => setPlacement(placement.slice(0, position).concat(placement.slice(position + 1)))}>Remove</button></div>)}
      <button className="small-button" disabled={placement.length >= 12} onClick={() => setPlacement([...placement, '0'])}>Add a place</button>
    </div>}
    {known && game !== 'lucky-doors' && game !== 'relay-drawing' && <label>In a team round, a team’s result is<select value={String(stage['teamResult'] ?? 'average')} onChange={event => edit(current => ({ ...current, teamResult: event.target.value }), 'team-result')}>
      <option value="average">The average of its players (fair for 1 against 3)</option><option value="best">Its best player</option>{MINIGAMES[game].better === 'higher' && <option value="total">Everyone added up</option>}</select></label>}
  </fieldset>;
}
