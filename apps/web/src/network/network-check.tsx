import { useEffect, useState } from 'react';
import { GameCommandSchema, PLAYER_COMMANDS } from '@party/contracts';
import { newId, roomApi } from './api.js';
import { useRoom } from './use-room.js';
import { JoinQr } from './join-qr.js';
import { StageTimer, useRemaining } from './stage-timer.js';
import { AnswerInput, draftValue, emptyDraft } from './answer-input.js';
import { JudgePanel, Scoreboard, StageResults } from './results.js';
import { VoteBallot } from './vote.js';
import { SeatReclaim, SeatRequests } from './seat-reclaim.js';
import { TeamForming, TeamSummary, captainAnswers, ownTeam } from './teams.js';
import { RouteChoice } from './route-choice.js';

const initial = new URL(location.href);
const access = new URLSearchParams(initial.hash.slice(1)).get('access');
if (access) history.replaceState(null, '', `${initial.pathname}${initial.search}`);

export function NetworkCheck() {
  const [sessionId, setSessionId] = useState(initial.searchParams.get('room') ?? undefined);
  const [roomCode, setRoomCode] = useState(initial.searchParams.get('code') ?? ''); const [name, setName] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(Boolean(access)); const [ready, setReady] = useState(!access);
  const [draft, setDraft] = useState(emptyDraft(null)); const [displayUrl, setDisplayUrl] = useState(''); const [timerSeconds, setTimerSeconds] = useState('30'); const [reclaiming, setReclaiming] = useState(false);
  const room = useRoom(ready ? sessionId : undefined, initial.searchParams.get('display') === '1'); const state = room.snapshot;
  useEffect(() => {
    if (!access || !sessionId) return; let mounted = true;
    void roomApi(`/api/rooms/${sessionId}/claim`, { token: access }).then(() => { if (mounted) setReady(true); }).catch(() => { if (mounted) setError('Host/display access could not be verified. Open a fresh access link.'); }).finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [sessionId]);
  // Each stage starts from its own blank answer (and its own item order).
  useEffect(() => { setDraft(emptyDraft(state?.view.stage?.input)); }, [state?.view.stage?.id]);
  const join = async () => {
    setBusy(true); setError('');
    try {
      const key = `party_join_${roomCode.trim().toUpperCase()}`; let joinId: string | null = null;
      try { joinId = localStorage.getItem(key); } catch { /* Online join can still work. */ }
      if (!joinId) { joinId = newId(); try { localStorage.setItem(key, joinId); } catch { /* optional recovery */ } }
      const result = await roomApi<{ sessionId: string }>('/api/rooms/join', { roomCode, displayName: name, joinId });
      history.replaceState(null, '', `/?room=${result.sessionId}`); setReady(true); setSessionId(result.sessionId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Joining failed. Please retry.'); } finally { setBusy(false); }
  };
  const command = (type: string, extra: Record<string, unknown> = {}) => {
    if (!state) return; const base = { formatVersion: 1, commandId: newId(), sessionId: state.view.sessionId, type };
    room.send(GameCommandSchema.parse({ ...base, ...((PLAYER_COMMANDS as readonly string[]).includes(type) ? {} : { expectedRevision: state.view.revision }), ...extra }));
  };
  const sorted = [...room.samples].sort((a, b) => a - b); const p95 = sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)];
  const stage = state?.view.stage; const disabled = room.saving || Boolean(room.pending) || room.connection !== 'Connected';
  const remaining = useRemaining(stage, room.clockOffset); const timeUp = remaining === 0 && stage?.pausedRemainingMs === null;
  const seconds = Number(timerSeconds); const validSeconds = Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600;
  // In a team round: nobody answers while teams are being made, players outside a team sit out, and a captain may answer for the team.
  const myTeam = stage ? ownTeam(stage.teams) : undefined;
  // Only while the vote is actually open: a paused room makes nobody a late joiner.
  const routeBlock = stage?.route && !stage.route.canVote && !state?.view.ownSubmission && stage.status === 'ACTIVE' && state?.view.status === 'RUNNING'
    ? stage.route.method === 'host' ? 'The host chooses the route.' : stage.teams && !stage.teams.forming && myTeam && captainAnswers(stage.teams) ? null : 'You joined after voting opened, so you do not vote on this route.' : null;
  const answerBlock = routeBlock ?? (!stage?.teams ? null : stage.teams.forming ? 'Answers open once the host starts the round with these teams.'
    : !myTeam ? 'You sit this team round out.' : captainAnswers(stage.teams) && myTeam.captainId !== state?.selfPlayerId ? `Your captain ${state?.players.find(player => player.id === myTeam.captainId)?.displayName ?? ''} answers for ${myTeam.name}.` : null);
  const timer = (change: Record<string, unknown>) => { if (stage) command('stage.timer', { stageRunId: stage.id, change }); };
  return <main>
    <p className="eyebrow">PARTY GAME · NETWORK CHECKPOINT</p><h1>Stay connected. Keep the game.</h1>
    <p>One public link for Wi-Fi and mobile data. This is the connection test, before the editors.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!sessionId && reclaiming ? <SeatReclaim roomCode={roomCode.trim().toUpperCase()} onCancel={() => setReclaiming(false)} onJoined={id => { history.replaceState(null, '', `/?room=${id}`); setReady(true); setSessionId(id); }} />
    : !sessionId ? <section aria-labelledby="join-heading"><h2 id="join-heading">Join the test room</h2><form onSubmit={event => { event.preventDefault(); void join(); }}>
      <label>Room code<input autoComplete="off" autoCapitalize="characters" value={roomCode} onChange={event => setRoomCode(event.target.value)} maxLength={6} required /></label>
      <label>Your name<input autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} maxLength={40} required /></label>
      <button disabled={busy} type="submit">{busy ? 'Joining…' : 'Join room'}</button></form><p>Already playing on another phone that died? <button type="button" className="link-button" onClick={() => { setError(''); setReclaiming(true); }}>Take over my seat</button></p>
      <p><a href="/?host=1">Host a game instead</a></p></section> : <>
      <section aria-labelledby="connection-heading"><h2 id="connection-heading">Connection</h2><p role="status" aria-label="Connection status">{busy ? 'Verifying access…' : room.connection}</p>
        <dl className="metrics"><div><dt>Latest round trip</dt><dd>{room.samples.length ? `${Math.round(room.samples.at(-1)!)} ms` : 'Measuring…'}</dd></div>
          <div><dt>p95 · last {room.samples.length} samples</dt><dd>{p95 === undefined ? 'Measuring…' : `${Math.round(p95)} ms`}</dd></div><div><dt>Reconnects</dt><dd>{room.reconnects}</dd></div></dl>
        <button onClick={room.reconnect} disabled={busy}>Reconnect and sync</button><p>Round trip includes the connection and server credential check. Saved-answer confirmation is measured separately.</p>
        {room.message && <p role="status" aria-label="Action status">{room.message}</p>}
      </section>
      {state && <>
        <section aria-labelledby="room-heading"><h2 id="room-heading">Room {state.roomCode}</h2><p>{state.view.title} · {state.role} · {state.view.status.toLowerCase()}</p>
          {state.role === 'host' && <><JoinQr origin={location.origin} roomCode={state.roomCode} /><div className="actions">
            {state.view.status === 'LOBBY' && <button disabled={disabled} onClick={() => command('session.start')}>Start test round</button>}
            {state.view.status === 'RUNNING' && <button disabled={disabled} onClick={() => command('session.pause')}>Pause</button>}
            {state.view.status === 'PAUSED' && <button disabled={disabled} onClick={() => command('session.resume')}>Resume</button>}
            {state.view.status === 'RUNNING' && stage?.status === 'ACTIVE' && !stage.teams?.forming && <button disabled={disabled} onClick={() => command('stage.close', { stageRunId: stage.id })}>Close stage</button>}
            {state.view.status === 'RUNNING' && stage?.status === 'CLOSED' && (stage.kind !== 'route' || stage.route?.decision) && <button disabled={disabled} onClick={() => command('stage.advance', { stageRunId: stage.id })}>Next stage</button>}
            <button onClick={() => { void roomApi<{ token: string }>(`/api/rooms/${sessionId}/display`, {}).then(result => setDisplayUrl(`${location.origin}/?room=${sessionId}&display=1#access=${result.token}`)).catch(() => setError('Display access could not be created.')); }}>Create display link</button>
          </div>{displayUrl && <p><a href={displayUrl} target="_blank" rel="noreferrer">Open shared display</a></p>}
            <SeatRequests state={state} sessionId={state.view.sessionId} onError={setError} /><p><a href="/?host=1">Back to the host menu</a></p></>}
          <h3>Players</h3><ul>{state.players.map(player => <li key={player.id}>{player.displayName}{player.id === state.selfPlayerId ? ' (you)' : ''} · {player.connected ? 'connected' : 'disconnected'}
            {state.role === 'host' && <button className="small-button" aria-label={`Revoke access for ${player.displayName}`} onClick={() => { void roomApi(`/api/rooms/${sessionId}/revoke`, { playerId: player.id }).catch(() => setError('Could not revoke access.')); }}>Revoke access</button>}</li>)}</ul>
        </section>
        {stage && <section aria-labelledby="stage-heading"><h2 id="stage-heading">{stage.prompt}</h2><p>{stage.status.toLowerCase()} · {state.view.status.toLowerCase()}</p>
          <TeamForming state={state} stage={stage} disabled={disabled} send={command} />
          <TeamSummary state={state} stage={stage} />
          {!stage.teams?.forming && <StageTimer stage={stage} remaining={remaining} />}
          {state.role === 'host' && stage.status === 'ACTIVE' && !stage.teams?.forming && state.view.status !== 'LOBBY' && <div className="timer-controls" role="group" aria-label="Time controls">
            {remaining !== null && <><button disabled={disabled} onClick={() => timer({ kind: 'add', ms: 30_000 })}>Add 30 seconds</button>
              <button disabled={disabled} onClick={() => timer({ kind: 'add', ms: 60_000 })}>Add 1 minute</button>
              <button disabled={disabled} onClick={() => timer({ kind: 'clear' })}>Remove time limit</button></>}
            <form className="inline-form" onSubmit={event => { event.preventDefault(); if (validSeconds) timer({ kind: 'set', ms: seconds * 1000 }); }}>
              <label>Time left (seconds)<input type="number" inputMode="numeric" min={1} max={3600} step={1} value={timerSeconds} onChange={event => setTimerSeconds(event.target.value)} /></label>
              <button disabled={disabled || !validSeconds}>Set time</button></form>
          </div>}
          {stage.kind === 'vote' && !stage.revealed && <VoteBallot state={state} stage={stage} disabled={disabled || timeUp} canVote={state.role === 'player' && !answerBlock && !state.view.ownSubmission && stage.status === 'ACTIVE' && state.view.status === 'RUNNING'}
            onVote={submissionId => command('submission.submit', { stageRunId: stage.id, value: { kind: 'vote', submissionId } })} />}
          {stage.kind !== 'challenge' && stage.kind !== 'route' && !stage.revealed && <p>{stage.submittedCount} of {stage.eligibleCount} {stage.kind === 'vote' ? 'voted' : 'answered'}{stage.status === 'CLOSED' ? ' · answers are locked' : ''}</p>}
          {state.role === 'host' && stage.kind === 'challenge' && stage.status === 'CLOSED' && !stage.revealed && state.view.status === 'RUNNING' && <JudgePanel state={state} stage={stage} disabled={disabled} send={command} />}
          <RouteChoice state={state} stage={stage} disabled={disabled} send={command} />
          {stage.kind !== 'route' && <StageResults state={state} stage={stage} />}
          {stage.status === 'CLOSED' && !stage.revealed && stage.revealAfterVote && <p>These answers are shown without names in the vote that comes next.</p>}
          {state.role === 'host' && stage.status === 'CLOSED' && !stage.revealed && state.view.status === 'RUNNING' && <div className="actions">
            {!stage.revealAfterVote && (stage.kind !== 'route' || stage.route?.decision) && <button disabled={disabled} onClick={() => command('stage.reveal', { stageRunId: stage.id })}>{stage.kind === 'route' ? 'Announce the route' : 'Reveal results'}</button>}
            {!stage.route?.decision && stage.route?.method !== 'host' && <><button disabled={disabled} onClick={() => command('stage.reopen', { stageRunId: stage.id, durationMs: 30_000 })}>Reopen for 30 seconds</button>
            <button disabled={disabled} onClick={() => command('stage.reopen', { stageRunId: stage.id, durationMs: null })}>Reopen without time limit</button></>}</div>}
          {state.role === 'player' && state.view.ownSubmission ? <p role="status">{stage.kind === 'vote' || stage.kind === 'route' ? (captainAnswers(stage.teams) ? 'Your team’s vote is saved on the server.' : 'Your vote is saved on the server.') : captainAnswers(stage.teams) ? `Your team’s answer is saved on the server.` : 'Your answer is saved on the server.'}</p> : state.role === 'player' && answerBlock && stage.status === 'ACTIVE' ? <p>{answerBlock}</p> : state.role === 'player' && stage.input && stage.status === 'ACTIVE' && state.view.status === 'RUNNING' ? <form onSubmit={event => {
            event.preventDefault(); const value = stage.input && draftValue(stage.input, draft); if (value) command('submission.submit', { stageRunId: stage.id, value });
          }}>
            <AnswerInput sessionId={state.view.sessionId} input={stage.input} draft={draft} onChange={setDraft} />
            <button disabled={disabled || !draftValue(stage.input, draft) || timeUp}>{timeUp ? 'Time is up' : 'Save answer'}</button></form> : <p>{stage.kind === 'challenge' ? 'Follow the host’s instructions.' : stage.kind === 'vote' ? '' : 'Watch the shared screen.'}</p>}
        </section>}
        <Scoreboard state={state} disabled={disabled} send={command} />
        <section aria-labelledby="save-heading"><h2 id="save-heading">Saved state</h2><p role="status">{room.saving ? 'Sending — waiting for saved confirmation…' : room.pending ? 'An action is awaiting confirmation.' : 'No action pending.'}</p>
          {room.pending && <div className="actions"><button onClick={room.retry} disabled={room.saving}>Check / retry original action</button><button onClick={room.discard}>Discard pending action</button></div>}
        </section>
      </>}
    </>}
    <footer>Networking is a release gate. Wi-Fi, 5G, refresh, sleep, and restart checks must pass before more features.</footer>
  </main>;
}
