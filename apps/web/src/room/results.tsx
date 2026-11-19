import { useText } from '../presentation/look.js';
import { useState } from 'react';
import type { RoomSnapshot } from '@party/contracts';
import { MediaView } from './media-upload.js';
import { BallotContent } from './vote.js';
import { TeamStandings, teamName } from './teams.js';
import { MinigameResults } from '../minigames/minigame-stage.js';
import { StoredDrawing } from '../drawing/drawing-view.js';
import { Avatar } from '../players/avatar.js';
import { translate } from '../i18n/texts.js';
import { PLAY_TEXTS } from './play.text.js';
import { ordinal } from '../i18n/ordinal.js';
const p = (key: keyof typeof PLAY_TEXTS.en, values?: Record<string, string | number>) => translate(PLAY_TEXTS, key, values);
import { defaultLook } from '@party/contracts';

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
const nameOf = (state: RoomSnapshot, playerId: string) => state.players.find(player => player.id === playerId)?.displayName ?? p('formerPlayer');

function PointsFold({ folded, label, children }: { folded: boolean; label: string; children: React.ReactNode }) {
  return folded ? <details className="results-more"><summary>{label}</summary>{children}</details> : <>{children}</>;
}

export function StageResults({ state, stage }: { state: RoomSnapshot; stage: Stage }) {
  const t = useText();
  const reveal = stage.reveal; if (!reveal) return null;
  const answer = reveal.answer; const input = stage.input;
  const label = (key: string) => input?.kind === 'choice' ? input.options.find(option => option.key === key)?.label ?? key : input?.kind === 'order' ? input.items.find(item => item.key === key)?.label ?? key : key;
  const own = state.selfPlayerId ? reveal.awards.find(award => award.playerId === state.selfPlayerId) : undefined;
  return <div className="results" role="region" aria-label={p('roundResults')}>
    <h3>{t('results.title')}</h3>
    {/* On a phone your own result comes first, big: that is what you look for. */}
    {state.role === 'player' && stage.input?.kind !== 'media' && <p role="status" className={`results-own${own ? ' earned' : ''}`}>{own ? t('results.earned', { points: formatPoints(own.amountMilli) }) : t('results.nothing')}</p>}
    {answer?.kind === 'choice' && <>
      {answer.correctChoiceKey && <p>{t('results.correct', { answer: label(answer.correctChoiceKey) })}</p>}
      <ul className="plain-list answer-bars">{answer.counts.map(row => { const total = answer.counts.reduce((sum, entry) => sum + entry.count, 0);
        return <li key={row.choiceKey} className={row.choiceKey === answer.correctChoiceKey ? 'correct' : answer.correctChoiceKey ? 'wrong' : undefined} style={{ '--share': `${total ? Math.round(row.count / total * 100) : 0}%` } as React.CSSProperties}>
          <span className="bar" aria-hidden="true" />{label(row.choiceKey)}{row.choiceKey === answer.correctChoiceKey ? ' ✓' : ''} · {p(row.count === 1 ? 'answerOne' : 'answerMany', { count: row.count })}</li>; })}</ul>
    </>}
    {answer?.kind === 'minigame' && <MinigameResults state={state} answer={answer} />}
    {answer?.kind === 'drawing' && (answer.entries.length ? <ul className="drawing-gallery">{answer.entries.map(entry => { const author = entry.teamId ? teamName(state, entry.teamId) : nameOf(state, entry.playerId ?? '');
      return <li key={entry.assetId}><StoredDrawing sessionId={state.view.sessionId} assetIds={[entry.assetId]} label={p('drawingBy', { name: author })} /><span>{author}</span></li>; })}</ul> : <p>{p('nobodyDrew')}</p>)}
    {answer?.kind === 'order' && answer.correctOrder && <><p>{p('correctOrder')}</p><ol>{answer.correctOrder.map(key => <li key={key}>{label(key)}</li>)}</ol></>}
    {answer?.kind === 'vote' && (answer.entries.length ? <ol className="ballot">{answer.entries.map(row => {
      const entry = stage.ballot?.find(candidate => candidate.submissionId === row.submissionId); const author = row.teamId ? teamName(state, row.teamId) : row.playerId ? nameOf(state, row.playerId) : p('formerPlayer');
      return <li key={row.submissionId} className="ballot-entry"><strong>{author} · {p(row.votes === 1 ? 'voteOne' : 'voteMany', { count: row.votes })}</strong>{entry && <BallotContent sessionId={state.view.sessionId} entry={entry} label={p('entryFrom', { name: author })} />}</li>;
    })}</ol> : <p>{p('nothingToVote')}</p>)}
    {answer?.kind === 'media' && (answer.entries.length ? <ul className="gallery">{answer.entries.map(entry => <li key={entry.assetId}><MediaView sessionId={state.view.sessionId} media={entry} label={p('uploadFrom', { name: nameOf(state, entry.playerId) })} /><span>{nameOf(state, entry.playerId)}</span></li>)}</ul> : <p>{p('nobodyUploaded')}</p>)}
    {/* Everyone's points: folded on phones so the round fits on one screen; open on the host and shared screens. */}
    <PointsFold folded={state.role === 'player'} label={t('results.points')}>
      {reveal.teamAwards.length > 0 && <><h4>{t('results.teamPoints')}</h4><ul className="plain-list">{reveal.teamAwards.map(award => <li key={award.teamId}>{teamName(state, award.teamId)} · {formatPoints(award.amountMilli)}</li>)}</ul></>}
      {stage.input?.kind !== 'media' && <h4>{t('results.points')}</h4>}
      {stage.input?.kind === 'media' ? null : reveal.awards.length ? <ul className="plain-list">{[...reveal.awards].sort((a, b) => { const difference = BigInt(b.amountMilli) - BigInt(a.amountMilli); return difference > 0n ? 1 : difference < 0n ? -1 : 0; }).map(award => <li key={award.playerId}>{nameOf(state, award.playerId)} · {formatPoints(award.amountMilli)}</li>)}</ul> : <p>{t('results.nobody')}</p>}
    </PointsFold>
  </div>;
}

/** Host judging of a closed challenge: one award per player, then reveal. */
export function JudgePanel({ state, stage, disabled, send }: { state: RoomSnapshot; stage: Stage; disabled: boolean; send: Send }) {
  const [points, setPoints] = useState<Record<string, string>>({});
  const challenge = stage.challenge; if (!challenge) return null;
  // With points by place the host gives each a place in one tap (any place, ties allowed); typing points stays possible.
  const placesMilli = challenge.placesMilli;
  const limit = placesMilli?.[0] && BigInt(placesMilli[0]) > BigInt(challenge.maxAwardMilli) ? placesMilli[0] : challenge.maxAwardMilli;
  const max = formatPoints(limit);
  const placeButtons = (name: string, give: (amountMilli: string) => void) => placesMilli && <div className="place-buttons" role="group" aria-label={p('placeFor', { name })}>
    {placesMilli.map((amount, index) => <button key={index} type="button" className="small-button" disabled={disabled} onClick={() => give(amount)}>{ordinal(index + 1)} · {formatPoints(amount)}</button>)}</div>;
  const teams = stage.teams && !stage.teams.forming ? stage.teams.teams.filter(team => team.teamId) : null;
  if (teams) return <div role="group" aria-label={p('judgeTeams')}><h3>{p('judgeEachTeam', { max })}</h3>
    <ul className="plain-list">{teams.map(team => {
      const judged = challenge.judgedTeamIds.includes(team.teamId!); const text = points[team.teamId!] ?? '0';
      const milli = pointsToMilli(text, false); const valid = milli !== null && BigInt(milli) <= BigInt(limit);
      return <li key={team.teamId}>{judged ? p('judged', { name: team.name }) : <>{placeButtons(team.name, amountMilli => send('stage.judgeTeam', { stageRunId: stage.id, teamId: team.teamId, amountMilli }))}<form className="inline-form" onSubmit={event => { event.preventDefault(); if (valid) send('stage.judgeTeam', { stageRunId: stage.id, teamId: team.teamId, amountMilli: milli }); }}>
        <label>{p('pointsFor', { name: team.name })}<input type="number" inputMode="numeric" min={0} max={Number(max)} step={1} value={text} onChange={event => setPoints({ ...points, [team.teamId!]: event.target.value })} /></label>
        <button disabled={disabled || !valid}>{p('award')}</button></form></>}</li>;
    })}</ul>
    <p>{p('judgmentFinal')}</p>
  </div>;
  return <div role="group" aria-label={p('judgePlayers')}><h3>{p('judgeEachPlayer', { max })}</h3>
    <ul className="plain-list">{state.players.map(player => {
      const judged = challenge.judgedPlayerIds.includes(player.id); const text = points[player.id] ?? '0';
      const milli = pointsToMilli(text, false); const valid = milli !== null && BigInt(milli) <= BigInt(limit);
      return <li key={player.id}>{judged ? p('judged', { name: player.displayName }) : <>{placeButtons(player.displayName, amountMilli => send('stage.judge', { stageRunId: stage.id, playerId: player.id, amountMilli }))}<form className="inline-form" onSubmit={event => { event.preventDefault(); if (valid) send('stage.judge', { stageRunId: stage.id, playerId: player.id, amountMilli: milli }); }}>
        <label>{p('pointsFor', { name: player.displayName })}<input type="number" inputMode="numeric" min={0} max={Number(max)} step={1} value={text} onChange={event => setPoints({ ...points, [player.id]: event.target.value })} /></label>
        <button disabled={disabled || !valid}>{p('award')}</button></form></>}</li>;
    })}</ul>
    <p>{p('judgmentFinal')}</p>
  </div>;
}

/** The leader in a few words (for the folded score card): “Ada · 1,200”. */
export function leaderLine(state: RoomSnapshot): string {
  const top = [...state.view.standings].sort((a, b) => { const d = BigInt(b.amountMilli) - BigInt(a.amountMilli); return d > 0n ? 1 : d < 0n ? -1 : 0; })[0];
  return top ? `${nameOf(state, top.playerId)} · ${formatPoints(top.amountMilli)}` : p('scores');
}

/** The standings. `compact`: the small floating card (no heading or note, small faces). */
export function Scoreboard({ state, disabled, send, compact = false }: { state: RoomSnapshot; disabled: boolean; send: Send; compact?: boolean }) {
  const t = useText();
  const [edit, setEdit] = useState<Record<string, string>>({}); const [correcting, setCorrecting] = useState(false);
  const totals = new Map(state.view.standings.map(row => [row.playerId, row.amountMilli]));
  const rows = [...new Set([...state.players.map(player => player.id), ...totals.keys()])].map(id => ({ id, name: nameOf(state, id), milli: totals.get(id) ?? '0' }))
    .sort((a, b) => { const difference = BigInt(b.milli) - BigInt(a.milli); return difference > 0n ? 1 : difference < 0n ? -1 : a.name.localeCompare(b.name); });
  const finished = state.view.status === 'FINISHED';
  // A scoreboard scene puts the standings centre stage, with its own heading and selection.
  const scene = state.view.stage?.status === 'ACTIVE' ? state.view.stage.scoreboard : null;
  const players = !scene || scene.show !== 'teams'; const teams = !scene || scene.show !== 'players';
  if (state.view.status === 'LOBBY' || (!rows.length && !state.view.teamStandings.length)) return null;
  return <section aria-labelledby="scores-heading" className={scene ? 'scoreboard-scene' : compact ? 'scoreboard-compact' : undefined}><h2 id="scores-heading" className={compact ? 'visually-hidden' : undefined}>{scene ? state.view.stage!.prompt : finished ? t('scores.final') : t('scores.title')}</h2>
    {scene && teams && !state.view.teamStandings.length && scene.show === 'teams' && <p>{p('noTeams')}</p>}
    {players && <ol className="scoreboard">{rows.map(row => {
      const milli = pointsToMilli(edit[row.id] ?? '', true); const valid = milli !== null && milli !== '0';
      return <li key={row.id}><Avatar look={state.players.find(player => player.id === row.id)?.look ?? defaultLook(row.id)} size={compact ? 22 : 32} /><span className="score-name">{row.name}{row.id === state.selfPlayerId ? p('you') : ''}</span><span className="score-points">{formatPoints(row.milli)}</span>
        {state.role === 'host' && correcting && <form className="inline-form" onSubmit={event => { event.preventDefault(); if (valid) { send('score.adjust', { playerId: row.id, amountMilli: milli, reason: 'Host correction' }); setEdit({ ...edit, [row.id]: '' }); } }}>
          <label>{p('correctFor', { name: row.name })}<input type="number" inputMode="numeric" step={1} value={edit[row.id] ?? ''} onChange={event => setEdit({ ...edit, [row.id]: event.target.value })} /></label>
          <button disabled={disabled || !valid}>{p('correctScore')}</button></form>}</li>;
    })}</ol>}
    {teams && <TeamStandings state={state} />}
    {state.role === 'host' && players && <button className="small-button ghost" aria-expanded={correcting} onClick={() => setCorrecting(!correcting)}>{p(correcting ? 'doneCorrecting' : 'correctScores')}</button>}
    {!finished && !compact && <p>{t('scores.note')}</p>}
  </section>;
}
