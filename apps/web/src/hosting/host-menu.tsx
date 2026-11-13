import { useEffect, useState } from 'react';
import { HostMenuSchema, type HostMenu } from '@party/contracts';
import { newId, roomApi } from '../network/api.js';
import { MyGames } from './my-games.js';
import { ImportGame } from './import-game.js';
import { GamePicker } from './game-picker.js';
import './host-menu.css';

const initial = new URL(location.href);
const ownerToken = new URLSearchParams(initial.hash.slice(1)).get('owner');
// Never leave the private owner key in the address bar or history.
if (ownerToken) history.replaceState(null, '', `${initial.pathname}${initial.search}`);

const problems: Record<string, string> = {
  UNAUTHORIZED: 'This browser is not signed in as the owner. Start the app with “npm run host” on the computer that runs it; that opens this page already signed in.',
  AUTH_UNAVAILABLE: 'Hosting from the browser is not set up on this server yet.',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
};
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'The server could not be reached. Check that it is running and try again.';

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
      if (mounted) { setMenu(loaded); setGameKey(loaded.games[0]?.key ?? ''); }
    })().catch(cause => { if (mounted) setError(explain(cause)); }).finally(() => { if (mounted) setBusy(false); });
    // A page restored from the back/forward cache would reuse the previous room request.
    const restored = (event: PageTransitionEvent) => { if (event.persisted) location.reload(); };
    window.addEventListener('pageshow', restored);
    return () => { mounted = false; window.removeEventListener('pageshow', restored); };
  }, []);
  const reload = () => { void roomApi('/api/host').then(data => setMenu(HostMenuSchema.parse(data))).catch(cause => setError(explain(cause))); };
  const open = (work: Promise<{ sessionId: string }>) => {
    setBusy(true); setError('');
    work.then(result => location.assign(`/?room=${result.sessionId}`)).catch(cause => { setError(explain(cause)); setBusy(false); });
  };
  return <main className="host-page">
    <header className="host-hero"><p className="brand">party<span>.</span></p><p className="eyebrow">Host</p><h1>Host a game</h1>
      <p>Pick a game and open a room. Players join on their phones with the room code or the QR code on the next screen.</p></header>
    {error && <p role="alert" className="error">{error}</p>}
    {busy && !menu && <p role="status">Loading your games…</p>}
    {menu && <>
      <section className="host-games" aria-labelledby="games-heading"><h2 id="games-heading">Choose a game</h2>
        <GamePicker games={menu.games} chosen={gameKey} onChoose={setGameKey} busy={busy} onOpen={() => open(roomApi('/api/host/rooms', { gameKey, ...request }))} />
        <p className="hint">These are the built-in games. Make your own under Your games, or import one from text.</p>
      </section>
      <MyGames menu={menu} reload={reload} openRoom={gameId => open(roomApi('/api/host/rooms', { gameId, sessionId: newId(), commandId: newId() }))} />
      <ImportGame />
      {menu.rooms.length > 0 && <section aria-labelledby="rooms-heading"><h2 id="rooms-heading">Your open rooms</h2>
        <ul>{menu.rooms.map(room => <li key={room.sessionId}>{room.title} · room {room.roomCode} · {room.status.toLowerCase()} · {room.playerCount} {room.playerCount === 1 ? 'player' : 'players'}
          <button className="small-button" disabled={busy} aria-label={`Return to room ${room.roomCode}`} onClick={() => open(roomApi(`/api/host/rooms/${room.sessionId}/enter`, {}))}>Return to room</button></li>)}</ul>
      </section>}
    </>}
    <p><a href="/">Join a game as a player instead</a></p>
  </main>;
}
