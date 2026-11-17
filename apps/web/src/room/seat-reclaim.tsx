import { useEffect, useRef, useState } from 'react';
import { RoomCodeSchema, SeatListSchema, type RoomSnapshot } from '@party/contracts';
import { newId, roomApi } from './api.js';

const problems: Record<string, string> = {
  ROOM_NOT_AVAILABLE: 'No open room has that code.', INVALID_COMMAND: 'Check the room code.',
  SEAT_UNAVAILABLE: 'That seat is no longer free: its phone may be connected again.', SEAT_DENIED: 'The host turned down this request.',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
};
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'The server could not be reached. Try again.';
type Waiting = { requestId: string; playerId: string; name: string };
const storageKey = (code: string) => `party_reclaim_${code}`;

/** On a new phone: pick your old seat (only seats without a connected phone are offered). */
export function SeatReclaim({ roomCode, onJoined, onCancel }: { roomCode: string; onJoined: (sessionId: string) => void; onCancel: () => void }) {
  const code = RoomCodeSchema.safeParse(roomCode);
  const [seats, setSeats] = useState<{ id: string; displayName: string }[]>(); const [approval, setApproval] = useState(false);
  const [error, setError] = useState(''); const [waiting, setWaiting] = useState<Waiting>(); const [busy, setBusy] = useState(false);
  const joined = useRef(onJoined); joined.current = onJoined;
  const load = () => {
    if (!code.success) { setError('Enter the six-character room code first.'); return; }
    setError(''); void roomApi(`/api/rooms/seats/${code.data}`).then(data => { const parsed = SeatListSchema.parse(data); setSeats(parsed.seats); setApproval(parsed.approval); }).catch(cause => setError(explain(cause)));
  };
  useEffect(() => {
    // A refresh while waiting for the host keeps the same request.
    if (code.success) { try { const saved = JSON.parse(localStorage.getItem(storageKey(code.data)) ?? 'null') as Waiting | null; if (saved?.requestId) setWaiting(saved); } catch { /* optional */ } }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ask = async (request: Waiting) => {
    const result = await roomApi<{ status: 'approved' | 'pending'; sessionId: string | null }>('/api/rooms/reclaim', { roomCode: code.data, playerId: request.playerId, requestId: request.requestId });
    if (result.status === 'approved' && result.sessionId) { try { localStorage.removeItem(storageKey(code.data!)); } catch { /* optional */ } joined.current(result.sessionId); return true; }
    return false;
  };
  useEffect(() => {
    if (!waiting) return; let stopped = false;
    const check = () => { void ask(waiting).then(done => { if (!done && !stopped) timer = setTimeout(check, 2500); }).catch(cause => {
      if (stopped) return; try { localStorage.removeItem(storageKey(code.data!)); } catch { /* optional */ } setWaiting(undefined); setError(explain(cause)); load();
    }); };
    let timer = setTimeout(check, 0);
    return () => { stopped = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);
  const take = (seat: { id: string; displayName: string }) => {
    const request = { requestId: newId(), playerId: seat.id, name: seat.displayName }; setBusy(true); setError('');
    try { localStorage.setItem(storageKey(code.data!), JSON.stringify(request)); } catch { /* the request still works while this page stays open */ }
    void ask(request).then(done => { if (!done) setWaiting(request); }).catch(cause => { try { localStorage.removeItem(storageKey(code.data!)); } catch { /* optional */ } setError(explain(cause)); load(); }).finally(() => setBusy(false));
  };
  return <section aria-labelledby="reclaim-heading"><h2 id="reclaim-heading">Take over your seat</h2>
    <p>Use this if your phone died or you switched phones. Your score and answers stay with your seat; the old phone loses access.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {waiting ? <><p role="status">Waiting for the host to approve taking over {waiting.name}’s seat…</p>
      <button onClick={() => { try { localStorage.removeItem(storageKey(code.data!)); } catch { /* optional */ } setWaiting(undefined); }}>Stop waiting</button></>
    : seats && (seats.length ? <><p>{approval ? 'The host will be asked to approve.' : 'You get the seat straight away.'} Only seats without a connected phone are shown.</p>
      <ul className="plain-list">{seats.map(seat => <li key={seat.id}><button disabled={busy} onClick={() => take(seat)}>I am {seat.displayName}</button></li>)}</ul></>
      : <p>No seat is free right now. A seat appears here once its phone has disconnected.</p>)}
    <div className="actions"><button onClick={load} disabled={busy}>Refresh seats</button><button onClick={onCancel}>Back to joining</button></div>
  </section>;
}

/** Host: the approval setting and any phones waiting to take over a seat. */
export function SeatRequests({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const act = (path: string, body: object) => { setBusy(true); void roomApi(path, body).catch(() => onError('That did not go through. The request may have expired; the list is up to date again.')).finally(() => setBusy(false)); };
  const name = (playerId: string) => state.players.find(player => player.id === playerId);
  return <div className="seat-requests">
    <label className="choice"><input type="checkbox" checked={state.settings.reclaimApproval} disabled={busy} onChange={event => act(`/api/rooms/${sessionId}/settings`, { reclaimApproval: event.target.checked })} />
      Ask me before a new phone takes over a seat</label>
    {state.seatRequests.length > 0 && <div role="region" aria-label="Seat requests"><h3>Seat requests</h3><ul className="plain-list">{state.seatRequests.map(request => {
      const seat = name(request.playerId); const label = seat?.displayName ?? 'a player';
      return <li key={request.requestId}>A new phone wants {label}’s seat{seat?.connected ? ' (their current phone is connected; approving disconnects it)' : ''}.
        <div className="actions"><button disabled={busy} onClick={() => act(`/api/rooms/${sessionId}/seat-requests`, { requestId: request.requestId, approve: true })}>Approve for {label}</button>
          <button disabled={busy} onClick={() => act(`/api/rooms/${sessionId}/seat-requests`, { requestId: request.requestId, approve: false })}>Deny for {label}</button></div></li>;
    })}</ul></div>}
  </div>;
}
