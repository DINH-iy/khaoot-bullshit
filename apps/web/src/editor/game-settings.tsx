import { useEffect, useRef } from 'react';
import { FormFields, sceneName } from './inspector.js';
import { Section } from './section.js';
import { FinaleSettings, WheelSettings } from './show-settings.js';
import { estimateMinutes, type Definition } from './model.js';

type Change = (next: Definition, group?: string) => void;

/** Whether the game has teams, and how rounds play unless a round says otherwise. */
export function TeamSettings({ definition, onChange }: { definition: Definition; onChange: Change }) {
  const teams = definition['teams'] as Parameters<typeof FormFields>[0]['form'] | undefined;
  const play = definition['play'] as { kind: string; answers?: string; points?: string } | undefined;
  const set = (key: 'teams' | 'play', value: unknown) => { const next = { ...definition }; if (value === undefined) delete next[key]; else next[key] = value; onChange(next); };
  return <>
    <label className="choice"><input type="checkbox" checked={Boolean(teams)} onChange={event => set('teams', event.target.checked ? { split: { kind: 'count', teams: 2 }, formation: 'random' } : undefined)} />This game has teams</label>
    {teams && <FormFields form={teams} onChange={form => set('teams', form)} />}
    <label>Rounds play, unless a round says otherwise<select value={play?.kind === 'teams' ? 'teams' : 'solo'} disabled={!teams && play?.kind !== 'teams'}
      onChange={event => set('play', event.target.value === 'solo' ? undefined : { kind: 'teams', lineup: { kind: 'game' }, answers: 'everyone', points: 'both' })}>
      <option value="solo">Everyone for themselves</option><option value="teams">In the game’s teams</option></select></label>
    {play?.kind === 'teams' && <>
      <label>Who answers<select value={play.answers} onChange={event => set('play', { ...play, answers: event.target.value })}><option value="everyone">Everyone</option><option value="captain">One captain per team</option></select></label>
      <label>Points go to<select value={play.points} onChange={event => set('play', { ...play, points: event.target.value })}><option value="both">The team and each member</option><option value="team">The team</option><option value="members">Each member</option></select></label>
    </>}
  </>;
}

/**
 * Everything about the whole game in one place, from the editor's top bar: its
 * name and start, teams and default play, wheels of fortune, the end-of-game
 * awards, and the way to its look. A scene's own settings stay in the scene panel.
 */
export function GameSettingsPanel({ definition, onChange, onLook, onClose }: { definition: Definition; onChange: Change; onLook: () => void; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const teams = definition['teams'] as { split?: { kind: string; teams?: number; sizes?: unknown[] } } | undefined;
  const play = definition['play'] as { kind?: string } | undefined;
  const teamCount = teams?.split?.kind === 'count' ? teams.split.teams : teams?.split?.sizes?.length;
  return <section className="game-settings-panel" aria-labelledby="game-settings-heading" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <div className="inspector-head"><h2 id="game-settings-heading" ref={heading} tabIndex={-1}>Game settings</h2><button className="small-button" onClick={onClose}>Close</button></div>
    <p className="hint">These apply to the whole game. A scene’s own settings are in the panel that opens when you select it.</p>
    <Section title="General" summary={`About ${estimateMinutes(definition)} min`} open>
      <label>Name of the game<input value={definition.title} maxLength={160} onChange={event => onChange({ ...definition, title: event.target.value }, 'title')} /></label>
      <label>The game starts with<select value={definition.startNodeKey} onChange={event => onChange({ ...definition, startNodeKey: event.target.value })}>
        {definition.nodes.map(node => <option key={node.key} value={node.key}>{sceneName(definition, node.key)}</option>)}</select></label>
    </Section>
    <Section title="Teams and default play" summary={teams ? `${teamCount ?? 2} teams · ${play?.kind === 'teams' ? 'team rounds' : 'solo rounds'}` : 'No teams'}>
      <TeamSettings definition={definition} onChange={onChange} />
    </Section>
    <WheelSettings definition={definition} onChange={onChange} />
    <FinaleSettings definition={definition} onChange={onChange} />
    <Section title="Look & feel" summary="Style, texts, animations">
      <p className="hint">Colours, fonts, every text players see and the animations, for the whole game or one scene.</p>
      <button className="small-button" onClick={() => { onClose(); onLook(); }}>Open Look & feel</button>
    </Section>
  </section>;
}
