import { useState } from 'react';
import type { RoomSnapshot } from '@party/contracts';
import { MediaView } from './media-upload.js';
import { BallotContent } from './vote.js';
import { TeamStandings, teamName } from './teams.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Send = (type: string, extra: Record<string, unknown>) => void;

/** Exact fixed-point display: 1,000 milli-points are one point. No floating point. */
export function formatPoints(milli: string): string {
  const negative = milli.startsWith('-'); const digits = (negative ? milli.slice(1) : milli).padStart(4, '0');
  const fraction = digits.slice(-3).replace(/0+$/, '');
  return `${negative ? '−' : ''}${digits.slice(0, -3)}${fraction ? `.${fraction}` : ''}`;
}
/** Whole points typed by the host, as an exact milli-point string, or null when unusable. */
export function pointsToMilli(text: string, allowNegative: boolean): string | null {
  const match = /^(-?)(\d{1,8})$/.exec(text.trim());
  if (!match || (match[1] && !allowNegative)) return null;
  const whole = match[2]!.replace(/^0+(?=\d)/, '');
  return whole === '0' ? '0' : `${match[1]}${whole}000`;
}
const nameOf = (state: RoomSnapshot, playerId: string) => state.players.find(player => player.id === playerId)?.displayName ?? 'Former player';

export function StageResults({ state, stage }: { state: RoomSnapshot; stage: Stage }) {
  const reveal = stage.reveal; if (!reveal) return null;
  const answer = reveal.answer; const input = stage.input;
  const label = (key: string) => input?.kind === 'choice' ? input.options.find(option => option.key === key)?.label ?? key : input?.kind === 'order' ? input.items.find(item => item.key === key)?.label ?? key : key;
  const own = state.selfPlayerId ? reveal.awards.find(award => award.playerId === state.selfPlayerId) : undefined;
  return <div className="results" role="region" aria-label="Round results">
    <h3>Results</h3>
    {answer?.kind === 'choice' && <>
      {answer.correctChoiceKey && <p>Correct answer: <strong>{label(answer.correctChoiceKey)}</strong></p>}
      <ul className="plain-list">{answer.counts.map(row => <li key={row.choiceKey}>{label(row.choiceKey)}{row.choiceKey === answer.correctChoiceKey ? ' ✓' : ''} · {row.count} {row.count === 1 ? 'answer' : 'answers'}</li>)}</ul>
    </>}
    {answer?.kind === 'order' && answer.correctOrder && <><p>Correct order:</p><ol>{answer.correctOrder.map(key => <li key={key}>{label(key)}</li>)}</ol></>}
    {answer?.kind === 'vote' && (answer.entries.length ? <ol className="ballot">{answer.entries.map(row => {
      const entry = stage.ballot?.find(candidate => candidate.submissionId === row.submissionId); const author = row.teamId ? teamName(state, row.teamId) : row.playerId ? nameOf(state, row.playerId) : 'Former player';
      return <li key={row.submissionId} className="ballot-entry"><strong>{author} · {row.votes} {row.votes === 1 ? 'vote' : 'votes'}</strong>{entry && <BallotContent sessionId={state.view.sessionId} entry={entry} label={`Entry from ${author}`} />}</li>;
    })}</ol> : <p>There was nothing to vote on.</p>)}
    {answer?.kind === 'media' && (answer.entries.length ? <ul className="gallery">{answer.entries.map(entry => <li key={entry.assetId}><MediaView sessionId={state.view.sessionId} media={entry} label={`Upload from ${nameOf(state, entry.playerId)}`} /><span>{nameOf(state, entry.playerId)}</span></li>)}</ul> : <p>Nobody uploaded anything.</p>)}
    {reveal.teamAwards.length > 0 && <><h4>Team points this round</h4><ul className="plain-list">{reveal.teamAwards.map(award => <li key={award.teamId}>{teamName(state, award.teamId)} · {formatPoints(award.amountMilli)}</li>)}</ul></>}
    {state.role === 'player' && stage.input?.kind !== 'media' && <p role="status">{own ? `You earned ${formatPoints(own.amountMilli)} points this round.` : 'No points for you this round.'}</p>}
    {stage.input?.kind !== 'media' && <h4>Points this round</h4>}
    {stage.input?.kind === 'media' ? null : reveal.awards.length ? <ul className="plain-list">{reveal.awards.map(award => <li key={award.playerId}>{nameOf(state, award.playerId)} · {formatPoints(award.amountMilli)}</li>)}</ul> : <p>Nobody scored this round.</p>}
  </div>;
}

/** Host judging of a closed challenge: one award per player, then reveal. */
export function JudgePanel({ state, stage, disabled, send }: { state: RoomSnapshot; stage: Stage; disabled: boolean; send: Send }) {
  const [points, setPoints] = useState<Record<string, string>>({});
  const challenge = stage.challenge; if (!challenge) return null;
  const max = formatPoints(challenge.maxAwardMilli);
  const teams = stage.teams && !stage.teams.forming ? stage.teams.teams.filter(team => team.teamId) : null;
  if (teams) return <div role="group" aria-label="Judge teams"><h3>Judge each team (0 to {max} points)</h3>
    <ul className="plain-list">{teams.map(team => {
      const judged = challenge.judgedTeamIds.includes(team.teamId!); const text = points[team.teamId!] ?? '0';
      const milli = pointsToMilli(text, false); const valid = milli !== null && BigInt(milli) <= BigInt(challenge.maxAwardMilli);
      return <li key={team.teamId}>{judged ? `${team.name} · judged` : <form className="inline-form" onSubmit={event => { event.preventDefault(); if (valid) send('stage.judgeTeam', { stageRunId: stage.id, teamId: team.teamId, amountMilli: milli }); }}>
        <label>Points for {team.name}<input type="number" inputMode="numeric" min={0} max={Number(max)} step={1} value={text} onChange={event => setPoints({ ...points, [team.teamId!]: event.target.value })} /></label>
        <button disabled={disabled || !valid}>Award</button></form>}</li>;
    })}</ul>
    <p>A judgment is final once given. Use “Correct score” on the scoreboard to fix a mistake.</p>
  </div>;
  return <div role="group" aria-label="Judge players"><h3>Judge each player (0 to {max} points)</h3>
    <ul className="plain-list">{state.players.map(player => {
      const judged = challenge.judgedPlayerIds.includes(player.id); const text = points[player.id] ?? '0';
      const milli = pointsToMilli(text, false); const valid = milli !== null && BigInt(milli) <= BigInt(challenge.maxAwardMilli);
      return <li key={player.id}>{judged ? `${player.displayName} · judged` : <form className="inline-form" onSubmit={event => { event.preventDefault(); if (valid) send('stage.judge', { stageRunId: stage.id, playerId: player.id, amountMilli: milli }); }}>
        <label>Points for {player.displayName}<input type="number" inputMode="numeric" min={0} max={Number(max)} step={1} value={text} onChange={event => setPoints({ ...points, [player.id]: event.target.value })} /></label>
        <button disabled={disabled || !valid}>Award</button></form>}</li>;
    })}</ul>
    <p>A judgment is final once given. Use “Correct score” on the scoreboard to fix a mistake.</p>
  </div>;
}

export function Scoreboard({ state, disabled, send }: { state: RoomSnapshot; disabled: boolean; send: Send }) {
  const [edit, setEdit] = useState<Record<string, string>>({});
  const totals = new Map(state.view.standings.map(row => [row.playerId, row.amountMilli]));
  const rows = [...new Set([...state.players.map(player => player.id), ...totals.keys()])].map(id => ({ id, name: nameOf(state, id), milli: totals.get(id) ?? '0' }))
    .sort((a, b) => { const difference = BigInt(b.milli) - BigInt(a.milli); return difference > 0n ? 1 : difference < 0n ? -1 : a.name.localeCompare(b.name); });
  const finished = state.view.status === 'FINISHED';
  if (state.view.status === 'LOBBY' || (!rows.length && !state.view.teamStandings.length)) return null;
  return <section aria-labelledby="scores-heading"><h2 id="scores-heading">{finished ? 'Final scores' : 'Scoreboard'}</h2>
    <ol className="scoreboard">{rows.map(row => {
      const milli = pointsToMilli(edit[row.id] ?? '', true); const valid = milli !== null && milli !== '0';
      return <li key={row.id}><span className="score-name">{row.name}{row.id === state.selfPlayerId ? ' (you)' : ''}</span><span className="score-points">{formatPoints(row.milli)}</span>
        {state.role === 'host' && <form className="inline-form" onSubmit={event => { event.preventDefault(); if (valid) { send('score.adjust', { playerId: row.id, amountMilli: milli, reason: 'Host correction' }); setEdit({ ...edit, [row.id]: '' }); } }}>
          <label>Correct score for {row.name} (+ or −)<input type="number" inputMode="numeric" step={1} value={edit[row.id] ?? ''} onChange={event => setEdit({ ...edit, [row.id]: event.target.value })} /></label>
          <button disabled={disabled || !valid}>Correct score</button></form>}</li>;
    })}</ol>
    <TeamStandings state={state} />
    {!finished && <p>Scores include revealed rounds only.</p>}
  </section>;
}
