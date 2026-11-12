import { useEffect, useState } from 'react';
import { GameCommandSchema } from '@party/contracts';
import { newId, roomApi } from './api.js';
import { useRoom } from './use-room.js';
import { JoinQr } from './join-qr.js';

const initial = new URL(location.href);
const access = new URLSearchParams(initial.hash.slice(1)).get('access');
if (access) history.replaceState(null, '', `${initial.pathname}${initial.search}`);

export function NetworkCheck() {
  const [sessionId, setSessionId] = useState(initial.searchParams.get('room') ?? undefined);
  const [roomCode, setRoomCode] = useState(initial.searchParams.get('code') ?? ''); const [name, setName] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(Boolean(access)); const [ready, setReady] = useState(!access);
  const [answer, setAnswer] = useState(''); const [displayUrl, setDisplayUrl] = useState('');
  const room = useRoom(ready ? sessionId : undefined, initial.searchParams.get('display') === '1'); const state = room.snapshot;
  useEffect(() => {
    if (!access || !sessionId) return; let mounted = true;
    void roomApi(`/api/rooms/${sessionId}/claim`, { token: access }).then(() => { if (mounted) setReady(true); }).catch(() => { if (mounted) setError('Host/display access could not be verified. Open a fresh access link.'); }).finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [sessionId]);
  useEffect(() => { setAnswer(''); }, [state?.view.stage?.id]);
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
    room.send(GameCommandSchema.parse({ ...base, ...(type === 'submission.submit' ? {} : { expectedRevision: state.view.revision }), ...extra }));
  };
  const sorted = [...room.samples].sort((a, b) => a - b); const p95 = sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)];
  const stage = state?.view.stage; const disabled = room.saving || Boolean(room.pending) || room.connection !== 'Connected';
  return <main>
    <p className="eyebrow">PARTY GAME · NETWORK CHECKPOINT</p><h1>Stay connected. Keep the game.</h1>
    <p>One public link for Wi-Fi and mobile data. This is the connection test, before the editors.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!sessionId ? <section aria-labelledby="join-heading"><h2 id="join-heading">Join the test room</h2><form onSubmit={event => { event.preventDefault(); void join(); }}>
      <label>Room code<input autoComplete="off" autoCapitalize="characters" value={roomCode} onChange={event => setRoomCode(event.target.value)} maxLength={6} required /></label>
      <label>Your name<input autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} maxLength={40} required /></label>
      <button disabled={busy} type="submit">{busy ? 'Joining…' : 'Join room'}</button></form></section> : <>
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
            {state.view.status === 'RUNNING' && stage?.status === 'ACTIVE' && <button disabled={disabled} onClick={() => command('stage.close', { stageRunId: stage.id })}>Close stage</button>}
            {state.view.status === 'RUNNING' && stage?.status === 'CLOSED' && <button disabled={disabled} onClick={() => command('stage.advance', { stageRunId: stage.id })}>Next stage</button>}
            <button onClick={() => { void roomApi<{ token: string }>(`/api/rooms/${sessionId}/display`, {}).then(result => setDisplayUrl(`${location.origin}/?room=${sessionId}&display=1#access=${result.token}`)).catch(() => setError('Display access could not be created.')); }}>Create display link</button>
          </div>{displayUrl && <p><a href={displayUrl} target="_blank" rel="noreferrer">Open shared display</a></p>}</>}
          <h3>Players</h3><ul>{state.players.map(player => <li key={player.id}>{player.displayName}{player.id === state.selfPlayerId ? ' (you)' : ''} · {player.connected ? 'connected' : 'disconnected'}
            {state.role === 'host' && <button className="small-button" aria-label={`Revoke ${player.displayName}'s access`} onClick={() => { void roomApi(`/api/rooms/${sessionId}/revoke`, { playerId: player.id }).catch(() => setError('Could not revoke access.')); }}>Revoke access</button>}</li>)}</ul>
        </section>
        {stage && <section aria-labelledby="stage-heading"><h2 id="stage-heading">{stage.prompt}</h2><p>{stage.status.toLowerCase()} · {state.view.status.toLowerCase()}</p>
          {state.role === 'player' && state.view.ownSubmission ? <p role="status">Your answer is saved on the server.</p> : state.role === 'player' && stage.input && stage.status === 'ACTIVE' && state.view.status === 'RUNNING' ? <form onSubmit={event => {
            event.preventDefault(); command('submission.submit', { stageRunId: stage.id, value: stage.input?.kind === 'choice' ? { kind: 'choice', choiceKey: answer } : { kind: 'text', text: answer } });
          }}>
            {stage.input.kind === 'choice' ? <fieldset><legend>Your private answer</legend>{stage.input.options.map(option => <label className="choice" key={option.key}><input type="radio" name="answer" value={option.key} checked={answer === option.key} onChange={() => setAnswer(option.key)} />{option.label}</label>)}</fieldset> : stage.input.kind === 'text' ? <label>Your private answer<textarea value={answer} onChange={event => setAnswer(event.target.value)} maxLength={stage.input.maxLength} /></label> : <p>Drawing is not enabled in this checkpoint.</p>}
            <button disabled={disabled || !answer.trim()}>Save answer</button></form> : <p>{stage.kind === 'challenge' ? 'Follow the host’s instructions.' : 'Watch the shared screen.'}</p>}
        </section>}
        <section aria-labelledby="save-heading"><h2 id="save-heading">Saved state</h2><p role="status">{room.saving ? 'Sending — waiting for saved confirmation…' : room.pending ? 'An action is awaiting confirmation.' : 'No action pending.'}</p>
          {room.pending && <div className="actions"><button onClick={room.retry} disabled={room.saving}>Check / retry original action</button><button onClick={room.discard}>Discard pending action</button></div>}
        </section>
      </>}
    </>}
    <footer>Networking is a release gate. Wi-Fi, 5G, refresh, sleep, and restart checks must pass before more features.</footer>
  </main>;
}
