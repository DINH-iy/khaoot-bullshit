import { useEffect, useRef, useState } from 'react';
import { formatRoomCode, HostMenuSchema, type HostMenu } from '@party/contracts';
import { newId, roomApi } from '../room/api.js';
import { MyGames } from './my-games.js';
import { ImportGame } from './import-game.js';
import { GamePicker } from './game-picker.js';
import { OwnerNav } from '../owner/owner-nav.js';
import { Icon } from '../editor/controls/icons.js';
import { rememberOwner, SIGNED_OUT_TEXT } from '../owner/owner-session.js';
import './host-menu.css';

const initial = new URL(location.href);
const ownerToken = new URLSearchParams(initial.hash.slice(1)).get('owner');
// Never leave the private owner key in the address bar or history.
if (ownerToken) history.replaceState(null, '', `${initial.pathname}${initial.search}`);

const problems: Record<string, string> = {
  UNAUTHORIZED: SIGNED_OUT_TEXT,
  AUTH_UNAVAILABLE: 'Hosting from the browser is not set up on this server yet.',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
};
const ROOM_STATUS: Record<HostMenu['rooms'][number]['status'], string> = { LOBBY: 'In the lobby', RUNNING: 'Playing', PAUSED: 'Paused', RECOVERING: 'Reconnecting', FINISHED: 'Finished' };
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'The server could not be reached. Check that it is running and try again.';

/** Copies a room code (without the dash, as players type it); a tick shows for a moment once copied. */
function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(timer); }, [copied]);
  return <button type="button" className={`copy-code${copied ? ' copied' : ''}`} aria-label={copied ? 'Room code copied' : `Copy room code ${code}`} title={copied ? 'Copied' : 'Copy the room code'}
    onClick={() => { void navigator.clipboard.writeText(code).then(() => setCopied(true), () => setCopied(false)); }}><Icon name={copied ? 'check' : 'copy'} size={16} /></button>;
}

export function HostMenu() {
  const [menu, setMenu] = useState<HostMenu>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(true);
  const [gameKey, setGameKey] = useState('');
  // One request identity per page load: a repeated click or retry returns the same room.
  const [request] = useState(() => ({ sessionId: newId(), commandId: newId() }));
  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (ownerToken) await roomApi('/api/host/claim', { token: ownerToken });
      const loaded = HostMenuSchema.parse(await roomApi('/api/host'));
      rememberOwner(loaded.role === 'owner');
      if (mounted) { setMenu(loaded); setGameKey(loaded.games[0]?.key ?? ''); }
    })().catch(cause => {
      if (cause instanceof Error && cause.message === 'UNAUTHORIZED') rememberOwner(false);
      if (mounted) setError(explain(cause));
    }).finally(() => { if (mounted) setBusy(false); });
    // A page restored from the back/forward cache would reuse the previous room request.
    const restored = (event: PageTransitionEvent) => { if (event.persisted) location.reload(); };
    window.addEventListener('pageshow', restored);
    return () => { mounted = false; window.removeEventListener('pageshow', restored); };
  }, []);
  // "Editor" in the owner bar points at Your games (#my-games). The list appears after loading, so scroll there once it is shown.
  const [hash, setHash] = useState(location.hash);
  const scrolled = useRef(false);
  useEffect(() => { const changed = () => setHash(location.hash); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  useEffect(() => { if (menu && hash === '#my-games' && !scrolled.current) { scrolled.current = true; document.getElementById('my-games')?.scrollIntoView(); } }, [menu, hash]);
  const reload = () => { void roomApi('/api/host').then(data => setMenu(HostMenuSchema.parse(data))).catch(cause => setError(explain(cause))); };
  const open = (work: Promise<{ sessionId: string }>) => {
    setBusy(true); setError('');
    work.then(result => location.assign(`/?room=${result.sessionId}`)).catch(cause => { setError(explain(cause)); setBusy(false); });
  };
  // Closing a room asks first (the game ends for everyone in it); afterwards the list is loaded again.
  const [closing, setClosing] = useState<string | null>(null);
  const closeRoom = (sessionId: string) => {
    setBusy(true); setError('');
    roomApi(`/api/host/rooms/${sessionId}/close`, {}).then(() => { setClosing(null); reload(); }).catch(cause => setError(explain(cause))).finally(() => setBusy(false));
  };
  // Editors (people with editor rights) work on the games only: no hosting, no open rooms, no admin.
  const owner = menu?.role === 'owner';
  return <><OwnerNav current={hash === '#my-games' || (menu && !owner) ? 'editor' : 'host'} role={menu?.role ?? null} /><main className="host-page">
    {!menu || owner
      ? <header className="host-hero"><p className="brand">party<span>.</span></p><p className="eyebrow">Host</p><h1>Host a game</h1>
        <p>Pick a game and open a room. Players join on their phones with the room code or the QR code on the next screen.</p></header>
      : <header className="host-hero"><p className="brand">party<span>.</span></p><p className="eyebrow">Editor</p><h1>Edit games</h1>
        <p>Make and change games, publish them and rehearse them in a practice room. Hosting real rooms is up to the organiser.</p></header>}
    {error && <p role="alert" className="error">{error}</p>}
    {busy && !menu && <p role="status">Loading your games…</p>}
    {menu && <>
      {menu.rooms.length > 0 && <section aria-labelledby="rooms-heading"><div className="my-games-head"><h2 id="rooms-heading">Your open rooms</h2><span className="my-games-count">{menu.rooms.length}</span></div>
        <ul className="open-rooms">{menu.rooms.map(room => <li key={room.sessionId} className={`open-room status-${room.status.toLowerCase()}`}>
          <div className="open-room-info"><div className="open-room-title"><h3>{room.title}</h3><span className="room-code-copy"><span className="room-code" aria-label={`Room code ${room.roomCode}`}>{formatRoomCode(room.roomCode)}</span><CopyCode code={room.roomCode} /></span></div>
            <p className="game-badges"><span className={`badge${room.status === 'RUNNING' ? ' good' : room.status === 'PAUSED' || room.status === 'RECOVERING' ? ' warn' : ''}`}>{ROOM_STATUS[room.status]}</span><span className="badge">{room.playerCount} {room.playerCount === 1 ? 'player' : 'players'}</span></p></div>
          {closing === room.sessionId
            ? <span className="open-room-actions" role="group" aria-label={`Close room ${room.roomCode}?`}><span className="open-room-ask">Close this room? The game ends for everyone in it.</span>
              <button type="button" className="keep" onClick={() => setClosing(null)}>Keep it</button>
              <button type="button" className="danger" disabled={busy} aria-label={`Yes, close room ${room.roomCode}`} onClick={() => closeRoom(room.sessionId)}>Yes, close</button></span>
            : <span className="open-room-actions"><button className="primary" disabled={busy} aria-label={`Return to room ${room.roomCode}`} onClick={() => open(roomApi(`/api/host/rooms/${room.sessionId}/enter`, {}))}>Return to room</button>
              <button type="button" className="danger icon-only" disabled={busy} aria-label={`Close room ${room.roomCode}`} title="Close this room" onClick={() => setClosing(room.sessionId)}><Icon name="trash" size={20} /></button></span>}</li>)}</ul>
      </section>}
      {owner && <section className="host-games" aria-labelledby="games-heading"><h2 id="games-heading">Choose a game</h2>
        <GamePicker games={menu.games} chosen={gameKey} onChoose={setGameKey} busy={busy} onOpen={() => open(roomApi('/api/host/rooms', { gameKey, ...request }))}
          onEdit={key => { setBusy(true); void roomApi<{ gameId: string }>(`/api/host/builtins/${key}/edit`, {}).then(result => location.assign(`/?edit=${result.gameId}`)).catch(cause => { setError(explain(cause)); setBusy(false); }); }}
          onRestore={key => { void roomApi(`/api/host/builtins/${key}/restore`, {}).then(reload).catch(cause => setError(explain(cause))); }} />
        <p className="hint">These are the built-in games. Change one with <strong>Edit this game</strong> (rooms play your version once you publish it), make your own under Your games, or import one from text.</p>
      </section>}
      <MyGames menu={menu} reload={reload} openRoom={owner ? gameId => open(roomApi('/api/host/rooms', { gameId, sessionId: newId(), commandId: newId() })) : null} />
      <ImportGame />
    </>}
    <p className="host-links"><a href="/">Join a game as a player instead</a>{owner && <><a href="/?admin">Admin: feedback from testers</a><a href="/?admin=people">Admin: people (accounts)</a></>}</p>
  </main></>;
}
