import type { RoomSnapshot } from '@party/contracts';
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

/** Forming: the proposal for everyone, with controls for the host (and for players when they choose). */
export function TeamForming({ state, stage, disabled, send }: { state: RoomSnapshot; stage: Stage; disabled: boolean; send: Send }) {
  const teams = stage.teams; if (!teams?.forming) return null;
  const host = state.role === 'host'; const chooser = state.role === 'player' && teams.formation === 'players' && stage.status === 'ACTIVE';
  const everyone = [...teams.teams.flatMap(team => team.memberIds), ...teams.unassignedIds];
  return <div role="region" aria-label="Team forming" className="team-forming">
    <h3>{teams.scope === 'game' ? 'Teams for the game' : 'Teams for this round'}</h3>
    <p>{host ? 'Check the teams, change anything, then start the round.' : how[teams.formation]} {teams.answers === 'captain' ? 'Each team’s captain answers for the team.' : 'Everyone answers.'} {pointsText[teams.points]}</p>
    <ul className="team-list">{teams.teams.map(team => {
      const full = team.targetSize !== null && team.memberIds.length >= team.targetSize; const mine = teams.ownTeamIndex === team.index;
      return <li key={team.index} className="team-card"><strong>{team.name}</strong>{team.targetSize !== null && <span> · {team.memberIds.length} of {team.targetSize}</span>}{mine && <span> · your team</span>}
        <p>{list(state, team.memberIds)}{team.captainId && teams.answers === 'captain' ? ` · captain: ${nameOf(state, team.captainId)}` : ''}</p>
        {chooser && <button disabled={disabled || mine || full} onClick={() => send('teams.choose', { stageRunId: stage.id, teamIndex: team.index })}>{mine ? `You are in ${team.name}` : full ? `${team.name} is full` : `Join ${team.name}`}</button>}
        {host && teams.answers === 'captain' && team.memberIds.length > 0 && <div className="actions">{team.memberIds.filter(id => id !== team.captainId).map(id =>
          <button key={id} className="small-button" disabled={disabled} onClick={() => send('teams.captain', { stageRunId: stage.id, playerId: id })}>Make {nameOf(state, id)} captain</button>)}</div>}
      </li>;
    })}</ul>
    {teams.unassignedIds.length > 0 && <p>Not in a team (sits this round out unless placed): {list(state, teams.unassignedIds)}</p>}
    {host && <>
      <ul className="plain-list">{everyone.map(id => {
        const current = teams.teams.find(team => team.memberIds.includes(id))?.index;
        return <li key={id}><label>Team for {nameOf(state, id)}<select value={current ?? ''} disabled={disabled}
          onChange={event => send('teams.assign', { stageRunId: stage.id, playerId: id, teamIndex: event.target.value === '' ? null : Number(event.target.value) })}>
          {teams.teams.map(team => <option key={team.index} value={team.index}>{team.name}</option>)}<option value="">Sits out</option></select></label></li>;
      })}</ul>
      <div className="actions"><button disabled={disabled} onClick={() => send('teams.shuffle', { stageRunId: stage.id })}>Shuffle randomly</button>
        <button disabled={disabled || teams.teams.every(team => team.memberIds.length === 0)} onClick={() => send('teams.confirm', { stageRunId: stage.id })}>Start round with these teams</button></div>
    </>}
  </div>;
}

/** During a team round: who is in which team. */
export function TeamSummary({ state, stage }: { state: RoomSnapshot; stage: Stage }) {
  const teams = stage.teams; if (!teams || teams.forming) return null;
  const mine = ownTeam(teams);
  if (state.role === 'player') return <p className="team-summary">{mine ? <>You are in <strong>{mine.name}</strong> with {list(state, mine.memberIds.filter(id => id !== state.selfPlayerId))}.{teams.answers === 'captain' && mine.captainId ? ` Captain: ${mine.captainId === state.selfPlayerId ? 'you' : nameOf(state, mine.captainId)}.` : ''}</> : 'You sit this team round out.'}</p>;
  return <ul className="team-list">{teams.teams.map(team => <li key={team.index} className="team-card"><strong>{team.name}</strong><p>{list(state, team.memberIds)}{team.captainId && teams.answers === 'captain' ? ` · captain: ${nameOf(state, team.captainId)}` : ''}</p></li>)}</ul>;
}

export const teamName = (state: RoomSnapshot, teamId: string) => state.view.stage?.teams?.teams.find(team => team.teamId === teamId)?.name ?? state.view.teamStandings.find(team => team.teamId === teamId)?.name ?? 'A team';

export function TeamStandings({ state }: { state: RoomSnapshot }) {
  const rows = state.view.teamStandings; if (!rows.length) return null;
  return <><h3>Teams</h3><ol className="scoreboard">{rows.map(row => <li key={row.teamId}><span className="score-name">{row.name} · {list(state, row.memberIds)}</span><span className="score-points">{formatPoints(row.amountMilli)}</span></li>)}</ol></>;
}
