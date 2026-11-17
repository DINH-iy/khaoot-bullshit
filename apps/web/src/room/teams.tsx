import { useState } from 'react';
import { defaultLook, type RoomSnapshot } from '@party/contracts';
import { Avatar } from '../players/avatar.js';
import { formatPoints } from './results.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Teams = NonNullable<Stage['teams']>;
type Send = (type: string, extra: Record<string, unknown>) => void;
const nameOf = (state: RoomSnapshot, playerId: string) => state.players.find(player => player.id === playerId)?.displayName ?? 'Former player';
const list = (state: RoomSnapshot, ids: string[]) => ids.length ? ids.map(id => nameOf(state, id)).join(', ') : 'nobody yet';
const how: Record<Teams['formation'], string> = { random: 'Teams were drawn at random. The host can still change them.', host: 'The host is making the teams.', players: 'Pick your team.' };
const pointsText: Record<Teams['points'], string> = { team: 'Points go to the team.', members: 'Points go to each player.', both: 'Points go to the team and to each player.' };

export const captainAnswers = (teams: Teams | null) => Boolean(teams && !teams.forming && teams.answers === 'captain');
export const ownTeam = (teams: Teams | null) => teams?.teams.find(team => team.index === teams.ownTeamIndex);

/** A colour for each team: its own colour when it is named after one, else one from the answer palette. */
const TEAM_COLORS: Record<string, string> = { red: '#e8505b', blue: '#36a2eb', green: '#5fb84a', yellow: '#e6b422', purple: '#8e5be8', orange: '#f28c28', pink: '#f07aa8', teal: '#2bb3a3', white: '#b0adbd', black: '#4a4560', gold: '#c99a1f', silver: '#9aa0ad' };
const PALETTE = ['#e8505b', '#36a2eb', '#5fb84a', '#e6b422', '#8e5be8', '#f28c28', '#f07aa8', '#2bb3a3'];
export const teamColor = (name: string, index: number) => TEAM_COLORS[name.toLowerCase()] ?? PALETTE[index % PALETTE.length]!;
const lookOf = (state: RoomSnapshot, id: string) => state.players.find(player => player.id === id)?.look ?? defaultLook(id);

/**
 * Forming: every team as a coloured column with its players, for everyone. The host taps a player and then a
 * team (or drags with a mouse), makes captains, adds and removes teams and shuffles; starting the round is the
 * big button in the host controls. Players who choose tap their team's big button.
 */
export function TeamForming({ state, stage, disabled, send }: { state: RoomSnapshot; stage: Stage; disabled: boolean; send: Send }) {
  const [picked, setPicked] = useState<string | null>(null);
  const teams = stage.teams; if (!teams?.forming) return null;
  const host = state.role === 'host'; const chooser = state.role === 'player' && teams.formation === 'players' && stage.status === 'ACTIVE';
  const captains = teams.answers === 'captain';
  const pickedTeam = picked === null ? undefined : teams.teams.find(team => team.memberIds.includes(picked));
  const assign = (playerId: string, teamIndex: number | null) => { send('teams.assign', { stageRunId: stage.id, playerId, teamIndex }); setPicked(null); };
  // A player chip: for the host a button to pick that player (and drag with a mouse); for everyone else a picture and a name.
  const chip = (id: string, team?: Teams['teams'][number]) => {
    const label = <><Avatar look={lookOf(state, id)} size={host ? 40 : 48} /><span>{nameOf(state, id)}{id === state.selfPlayerId ? ' (you)' : ''}</span>
      {team?.captainId === id && captains && <span className="team-crown" role="img" aria-label="captain">👑</span>}</>;
    return <li key={id}>{host ? <button type="button" className="team-chip" aria-pressed={picked === id} disabled={disabled} draggable={!disabled}
      onDragStart={event => { event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => setPicked(picked === id ? null : id)}>{label}</button> : <span className="team-chip">{label}</span>}</li>;
  };
  const dropTo = (teamIndex: number | null) => host ? {
    onDragOver: (event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; },
    onDrop: (event: React.DragEvent) => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); if (id) assign(id, teamIndex); },
  } : {};
  return <div role="region" aria-label="Team forming" className="team-forming">
    <div className="team-forming-head">
      <h3>{teams.scope === 'game' ? 'Teams for the game' : 'Teams for this round'}</h3>
      <p>{host ? (picked ? `Now tap the team for ${nameOf(state, picked)}${captains && pickedTeam ? ', or make them captain' : ''}.` : 'Tap a player, then their team (or drag them). Then start the round.') : how[teams.formation]}
        {' '}{captains ? 'Each team’s captain answers for the team.' : 'Everyone answers.'} {pointsText[teams.points]}</p>
    </div>
    <ul className="team-columns">{teams.teams.map(team => {
      const color = teamColor(team.name, team.index); const mine = teams.ownTeamIndex === team.index;
      const full = team.targetSize !== null && team.memberIds.length >= team.targetSize;
      return <li key={team.index} className={`team-column${mine ? ' mine' : ''}${picked && !team.memberIds.includes(picked) ? ' target' : ''}`} style={{ '--team': color } as React.CSSProperties} {...dropTo(team.index)}>
        <div className="team-column-head"><strong>{team.name}</strong><span className="team-count">{team.targetSize !== null ? ` · ${team.memberIds.length} of ${team.targetSize}` : ` · ${team.memberIds.length}`}</span>
          {host && teams.teams.length > 1 && <button type="button" className="team-remove" disabled={disabled} aria-label={`Remove ${team.name}`} onClick={() => send('teams.remove', { stageRunId: stage.id, teamIndex: team.index })}>×</button>}</div>
        {captains && team.captainId && <p className="visually-hidden">captain: {nameOf(state, team.captainId)}</p>}
        {chooser && <button type="button" className="team-join" disabled={disabled || mine || full} onClick={() => send('teams.choose', { stageRunId: stage.id, teamIndex: team.index })}>
          {mine ? `You are in ${team.name}` : full ? `${team.name} is full` : `Join ${team.name}`}</button>}
        {team.memberIds.length ? <ul className="team-members">{team.memberIds.map(id => chip(id, team))}</ul> : <p className="team-empty">{host ? 'Nobody yet: tap a player, then here' : 'Nobody yet'}</p>}
        {host && picked && !team.memberIds.includes(picked) && <button type="button" className="team-put" disabled={disabled || full} onClick={() => assign(picked, team.index)}>Put {nameOf(state, picked)} in {team.name}</button>}
      </li>;
    })}
      {host && teams.teams.length < 12 && <li className="team-column add"><button type="button" className="team-add" disabled={disabled} onClick={() => send('teams.add', { stageRunId: stage.id })}>+ Add team</button></li>}
    </ul>
    {(teams.unassignedIds.length > 0 || (host && pickedTeam)) && <div className="team-bench" {...dropTo(null)}>
      <p>Not in a team (sits out unless placed)</p>
      {teams.unassignedIds.length > 0 && <ul className="team-members">{teams.unassignedIds.map(id => chip(id))}</ul>}
      {host && picked && pickedTeam && <button type="button" className="team-put" disabled={disabled} onClick={() => assign(picked, null)}>Take {nameOf(state, picked)} out of the teams</button>}
    </div>}
    {host && <div className="actions team-actions">
      {picked && pickedTeam && captains && pickedTeam.captainId !== picked && <button type="button" disabled={disabled} onClick={() => { send('teams.captain', { stageRunId: stage.id, playerId: picked }); setPicked(null); }}>Make {nameOf(state, picked)} captain</button>}
      <button type="button" className="ghost" disabled={disabled} onClick={() => { send('teams.shuffle', { stageRunId: stage.id }); setPicked(null); }}>Shuffle randomly</button>
    </div>}
    {host && teams.teams.every(team => team.memberIds.length === 0) && <p className="wait-note">Put at least one player in a team to start the round.</p>}
  </div>;
}

/** During a team round: who is in which team. */
export function TeamSummary({ state, stage }: { state: RoomSnapshot; stage: Stage }) {
  const teams = stage.teams; if (!teams || teams.forming) return null;
  const mine = ownTeam(teams);
  if (state.role === 'player') return <p className="team-summary">{mine ? <>You are in <strong>{mine.name}</strong> with {list(state, mine.memberIds.filter(id => id !== state.selfPlayerId))}.{teams.answers === 'captain' && mine.captainId ? ` Captain: ${mine.captainId === state.selfPlayerId ? 'you' : nameOf(state, mine.captainId)}.` : ''}</> : 'You sit this team round out.'}</p>;
  // Host and shared screen: the same coloured columns as while picking, smaller.
  return <ul className="team-columns compact" aria-label="Teams">{teams.teams.map(team => <li key={team.index} className="team-column" style={{ '--team': teamColor(team.name, team.index) } as React.CSSProperties}>
    <div className="team-column-head"><strong>{team.name}</strong><span className="team-count"> · {team.memberIds.length}</span></div>
    <p className="team-names">{list(state, team.memberIds)}{team.captainId && teams.answers === 'captain' ? ` · captain: ${nameOf(state, team.captainId)}` : ''}</p></li>)}</ul>;
}

export const teamName = (state: RoomSnapshot, teamId: string) => state.view.stage?.teams?.teams.find(team => team.teamId === teamId)?.name ?? state.view.teamStandings.find(team => team.teamId === teamId)?.name ?? 'A team';

export function TeamStandings({ state }: { state: RoomSnapshot }) {
  const rows = state.view.teamStandings; if (!rows.length) return null;
  return <><h3>Teams</h3><ol className="scoreboard">{rows.map(row => <li key={row.teamId}><span className="score-name">{row.name} · {list(state, row.memberIds)}</span><span className="score-points">{formatPoints(row.amountMilli)}</span></li>)}</ol></>;
}
