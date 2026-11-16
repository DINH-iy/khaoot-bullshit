import { useEffect, useRef } from 'react';
import { sceneName } from './inspector.js';
import { Section } from './section.js';
import { FinaleSettings, WheelSettings } from './show-settings.js';
import { estimateMinutes, type Definition } from './model.js';

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
export function GameSettingsPanel({ definition, onChange, onLook, onClose }: { definition: Definition; onChange: Change; onLook: () => void; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const teamGame = definition.nodes.some(node => node.stages.some(stage => stage.kind === 'teams'));
  return <section className="game-settings-panel" aria-labelledby="game-settings-heading" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <div className="inspector-head"><h2 id="game-settings-heading" ref={heading} tabIndex={-1}>Game settings</h2><button className="small-button" onClick={onClose}>Close</button></div>
    <p className="hint">These apply to the whole game. A scene’s own settings are in the panel that opens when you select it.</p>
    <Section title="General" summary={`About ${estimateMinutes(definition)} min`} open>
      <label>Name of the game<input value={definition.title} maxLength={160} onChange={event => onChange({ ...definition, title: event.target.value }, 'title')} /></label>
      <label>The game starts with<select value={definition.startNodeKey} onChange={event => onChange({ ...definition, startNodeKey: event.target.value })}>
        {definition.nodes.map(node => <option key={node.key} value={node.key}>{sceneName(definition, node.key)}</option>)}</select></label>
    </Section>
    <Section title="Teams" summary={teamGame ? 'Made in Pick teams scenes' : 'Everyone for themselves'}>
      <TeamsNote definition={definition} />
    </Section>
    {/* Only what differs from the defaults is stored: side games on, chips off. */}
    <Section title="Side games & chips" summary={definition['sideGames'] === false ? 'No side games' : definition['chips'] === true ? 'Side games with chips' : 'Side games for fun'}>
      <label className="choice"><input type="checkbox" checked={definition['sideGames'] !== false}
        onChange={event => { const next = { ...definition }; if (event.target.checked) delete next['sideGames']; else { next['sideGames'] = false; delete next['chips']; } onChange(next); }} />
        Side games on the phones while players wait</label>
      <label className="choice"><input type="checkbox" checked={definition['sideGames'] !== false && definition['chips'] === true} disabled={definition['sideGames'] === false}
        onChange={event => { const next = { ...definition }; if (event.target.checked) next['chips'] = true; else delete next['chips']; onChange(next); }} />
        Play them with chips</label>
      <p className="hint">Side games: slot machine, blackjack, packs and challenges between players, on by default. Chips (play money only) add bets, stakes and a leaderboard; off by default, so the games are just for fun. The host can still switch both in the room.</p>
    </Section>
    <WheelSettings definition={definition} onChange={onChange} />
    <FinaleSettings definition={definition} onChange={onChange} />
    <Section title="Look & feel" summary="Style, texts, animations">
      <p className="hint">Colours, fonts, every text players see and the animations, for the whole game or one scene.</p>
      <button className="small-button" onClick={() => { onClose(); onLook(); }}>Open Look & feel</button>
    </Section>
  </section>;
}
