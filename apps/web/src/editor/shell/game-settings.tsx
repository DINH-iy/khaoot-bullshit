import { useEffect, useRef } from 'react';
import { MAX_OPEN_INVITES, OPEN_INVITES_DEFAULT } from '@party/contracts';
import { sceneName } from '../scene/inspector.js';
import { Section } from '../controls/section.js';
import { FinaleSettings, WheelSettings } from './show-settings.js';
import { estimateMinutes, type Definition } from '../model.js';
import { Dropdown } from '../controls/dropdown.js';

type Change = (next: Definition, group?: string) => void;

/** Teams are not a game setting: a game is solo unless it has Pick teams scenes. This only says which it is. */
function TeamsNote({ definition }: { definition: Definition }) {
  const picks = definition.nodes.filter(node => node.stages.some(stage => stage.kind === 'teams'));
  return picks.length
    ? <p className="hint">Teams are made in {picks.length === 1 ? 'the Pick teams scene' : `${picks.length} Pick teams scenes`} ({picks.map(node => sceneName(definition, node.key)).join(', ')}). Each round says under “Who plays” whether it is played in those teams or by everyone for themselves.</p>
    : <p className="hint">Everyone plays for themselves. For a team game, add a Pick teams scene where the teams should be made; the rounds after it can then be played in teams.</p>;
}

/**
 * Everything about the whole game in one place, from the editor's top bar: its
 * name and start, teams and default play, wheels of fortune, the end-of-game
 * awards, and the way to its look. A scene's own settings stay in the scene panel.
 */
export function GameSettingsPanel({ definition, onChange, onLook, onClose, readOnly = false, problems = [] }: { definition: Definition; onChange: Change; onLook: () => void; onClose: () => void; readOnly?: boolean; problems?: { message: string; path: string }[] }) {
  // Each problem shows in the group where it is fixed (by the setting it is about); anything else under General.
  const GROUP: Record<string, string> = { finale: 'awards', wheels: 'wheels', quickTimeSeconds: 'host', sideGames: 'side', chips: 'side' };
  const problemsIn = (group: string) => problems.filter(problem => (GROUP[problem.path.split('.')[0] ?? ''] ?? 'general') === group).map(problem => problem.message);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const teamGame = definition.nodes.some(node => node.stages.some(stage => stage.kind === 'teams'));
  return <section className="game-settings-panel" aria-labelledby="game-settings-heading" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <div className="inspector-head"><h2 id="game-settings-heading" ref={heading} tabIndex={-1}>Game settings</h2><button className="small-button" onClick={onClose}>Close</button></div>
    <p className="hint">These apply to the whole game. A scene’s own settings are in the panel that opens when you select it.</p>
    <fieldset className="view-lock" disabled={readOnly}>
    <Section title="General" summary={`About ${estimateMinutes(definition)} min`} open problems={problemsIn('general')}>
      <label>Name of the game<input value={definition.title} maxLength={160} onChange={event => onChange({ ...definition, title: event.target.value }, 'title')} /></label>
      <label>The game starts with<Dropdown value={definition.startNodeKey} onChange={startNodeKey => onChange({ ...definition, startNodeKey })}
        options={definition.nodes.map(node => ({ value: node.key, label: sceneName(definition, node.key) }))} /></label>
    </Section>
    <Section title="Teams" summary={teamGame ? 'Made in Pick teams scenes' : 'Everyone for themselves'}>
      <TeamsNote definition={definition} />
    </Section>
    {/* Only what differs from the defaults is stored: side games on, chips off. */}
    <Section title="Side games & chips" problems={problemsIn('side')} summary={definition['sideGames'] === false ? 'No side games' : definition['chips'] === true ? 'Side games with chips' : 'Side games for fun'}>
      <label className="choice"><input type="checkbox" checked={definition['sideGames'] !== false}
        onChange={event => { const next = { ...definition }; if (event.target.checked) delete next['sideGames']; else { next['sideGames'] = false; delete next['chips']; } onChange(next); }} />
        Side games on the phones while players wait</label>
      <label className="choice"><input type="checkbox" checked={definition['sideGames'] !== false && definition['chips'] === true} disabled={definition['sideGames'] === false}
        onChange={event => { const next = { ...definition }; if (event.target.checked) next['chips'] = true; else delete next['chips']; onChange(next); }} />
        Play them with chips</label>
      {/* Stored only when it differs from the standard 3. */}
      {definition['sideGames'] !== false && <label className="ed-inline">Challenges a player can have waiting at once<span className="ed-unit"><input type="number" inputMode="numeric" min={1} max={MAX_OPEN_INVITES} value={Number(definition['openInvites'] ?? OPEN_INVITES_DEFAULT)}
        onChange={event => { const value = Math.round(Number(event.target.value)); if (!(value >= 1 && value <= MAX_OPEN_INVITES)) return; const next = { ...definition }; if (value === OPEN_INVITES_DEFAULT) delete next['openInvites']; else next['openInvites'] = value; onChange(next); }} /></span></label>}
      <p className="hint">Side games: slot machine, blackjack, packs and challenges between players, on by default. Chips (play money only) add bets, stakes and a leaderboard; off by default, so the games are just for fun. A player can invite up to {Number(definition['openInvites'] ?? OPEN_INVITES_DEFAULT)} others to a challenge before one answers. The host can still change all of this in the room, also before the game starts.</p>
    </Section>
    {/* Stored only when it differs from 30 seconds. */}
    <Section title="Host tools" problems={problemsIn('host')} summary={`Quick time button: +${Number(definition['quickTimeSeconds'] ?? 30)} s`}>
      <label>Seconds the host's quick time button adds<input type="number" inputMode="numeric" min={5} max={600} step={5} value={Number(definition['quickTimeSeconds'] ?? 30)}
        onChange={event => { const value = Math.round(Number(event.target.value)); if (!(value >= 5 && value <= 600)) return; const next = { ...definition }; if (value === 30) delete next['quickTimeSeconds']; else next['quickTimeSeconds'] = value; onChange(next); }} /></label>
      <p className="hint">One tap in the host panel adds this time to a running round. The host can change it in the room's settings too.</p>
    </Section>
    <WheelSettings definition={definition} onChange={onChange} problems={problemsIn('wheels')} />
    <FinaleSettings definition={definition} onChange={onChange} problems={problemsIn('awards')} />
    </fieldset>
    <Section title="Look & feel" summary="Style, texts, animations">
      <p className="hint">Colours, fonts, every text players see and the animations, for the whole game or one scene.</p>
      <button className="small-button" onClick={() => { onClose(); onLook(); }}>Open Look & feel</button>
    </Section>
  </section>;
}
