import { SettingToggle } from '../room-extras/setting-toggle.js';
import { useEffect, useRef, useState } from 'react';
import { RoomCodeSchema, SeatListSchema, type RoomSnapshot } from '@party/contracts';
import { useTexts } from '../i18n/texts.js';
import { HOST_TEXTS } from './host.text.js';
import { translate } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from './extras.text.js';
const x = (key: keyof typeof EXTRAS_TEXTS.en, values?: Record<string, string | number>) => translate(EXTRAS_TEXTS, key, values);
import { newId, roomApi } from './api.js';

const problems: Record<string, string> = {
  ROOM_NOT_AVAILABLE: 'noRoom', INVALID_COMMAND: 'checkCode', SEAT_UNAVAILABLE: 'seatGone', SEAT_DENIED: 'seatDenied', RATE_LIMITED: 'tooMany',
};
const explain = (cause: unknown) => x((problems[cause instanceof Error ? cause.message : ''] ?? 'unreachable') as keyof typeof EXTRAS_TEXTS.en);
type Waiting = { requestId: string; playerId: string; name: string };
const storageKey = (code: string) => `party_reclaim_${code}`;

/** On a new phone: pick your old seat (only seats without a connected phone are offered). */
export function SeatReclaim({ roomCode, onJoined, onCancel }: { roomCode: string; onJoined: (sessionId: string) => void; onCancel: () => void }) {
  const code = RoomCodeSchema.safeParse(roomCode);
  const [seats, setSeats] = useState<{ id: string; displayName: string }[]>(); const [approval, setApproval] = useState(false);
  const [error, setError] = useState(''); const [waiting, setWaiting] = useState<Waiting>(); const [busy, setBusy] = useState(false);
  const joined = useRef(onJoined); joined.current = onJoined;
  const load = () => {
    if (!code.success) { setError(x('codeFirst')); return; }
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
  return <section aria-labelledby="reclaim-heading"><h2 id="reclaim-heading">{x('takeOver')}</h2>
    <p>{x('takeOverHint')}</p>
    {error && <p role="alert" className="error">{error}</p>}
    {waiting ? <><p role="status">{x('waitingApproval', { name: waiting.name })}</p>
      <button onClick={() => { try { localStorage.removeItem(storageKey(code.data!)); } catch { /* optional */ } setWaiting(undefined); }}>{x('stopWaiting')}</button></>
    : seats && (seats.length ? <><p>{x(approval ? 'willAsk' : 'straightAway')}{x('onlyFree')}</p>
      <ul className="plain-list">{seats.map(seat => <li key={seat.id}><button disabled={busy} onClick={() => take(seat)}>{x('iAm', { name: seat.displayName })}</button></li>)}</ul></>
      : <p>{x('noSeat')}</p>)}
    <div className="actions"><button onClick={load} disabled={busy}>{x('refreshSeats')}</button><button onClick={onCancel}>{x('backToJoining')}</button></div>
  </section>;
}

/** Host: the approval setting and any phones waiting to take over a seat. */
function useSeatAction(onError: (message: string) => void) {
  const [busy, setBusy] = useState(false); const h = useTexts(HOST_TEXTS);
  const act = (path: string, body: object) => { setBusy(true); void roomApi(path, body).catch(() => onError(h('seatFailed'))).finally(() => setBusy(false)); };
  return { busy, act, h };
}

/** The room setting (in the host's settings sheet): approve every seat takeover first. */
export function SeatApprovalSetting({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const { busy, act, h } = useSeatAction(onError);
  return <SettingToggle label={h('seatApproval')} checked={state.settings.reclaimApproval} disabled={busy}
    onChange={value => act(`/api/rooms/${sessionId}/settings`, { reclaimApproval: value })} />;
}

/** Waiting seat requests, right in the host panel (nothing when there are none). */
export function SeatRequests({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const { busy, act, h } = useSeatAction(onError);
  const name = (playerId: string) => state.players.find(player => player.id === playerId);
  if (!state.seatRequests.length) return null;
  return <div className="seat-requests">
    <div role="region" aria-label={h('seatRequests')}><h3>{h('seatRequests')}</h3><ul className="plain-list">{state.seatRequests.map(request => {
      const seat = name(request.playerId); const label = seat?.displayName ?? h('aPlayer');
      return <li key={request.requestId}>{h(seat?.connected ? 'seatWantedConnected' : 'seatWanted', { name: label })}
        <div className="actions"><button disabled={busy} onClick={() => act(`/api/rooms/${sessionId}/seat-requests`, { requestId: request.requestId, approve: true })}>{h('approveFor', { name: label })}</button>
          <button disabled={busy} onClick={() => act(`/api/rooms/${sessionId}/seat-requests`, { requestId: request.requestId, approve: false })}>{h('denyFor', { name: label })}</button></div></li>;
    })}</ul></div>
  </div>;
}
