import { useEffect, useState } from 'react';
import { navigate } from '../navigation.js';
import { ArcadeLeaderboardSchema, ArcadeListSchema, MINIGAMES, type ArcadeLeaderboard, type ArcadeList } from '@party/contracts';
import { newId, roomApi } from '../room/api.js';
import { savedLook } from '../players/look-builder.js';
import { useMe } from '../people/use-me.js';
import { FaIcon } from '../presentation/icons.js';
import { useSiteLookFrame } from '../presentation/site-look.js';
import { arcadeProblem, arcadeResult, points } from './arcade-text.js';

const NAME_KEY = 'party_arcade_name';
const rememberedName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
export const rememberName = (name: string) => { try { localStorage.setItem(NAME_KEY, name); } catch { /* only a convenience */ } };
export const openLobby = (lobbyId: string) => { navigate(`/?arcade=${lobbyId}`); };

/** The arcade's front page: open lobbies to join, opening your own, and the all-time leaderboards. */
export function ArcadeHome() {
  const frame = useSiteLookFrame();
  const account = useMe();
  const [list, setList] = useState<ArcadeList | null>(null); const [board, setBoard] = useState<ArcadeLeaderboard | null>(null);
  const [name, setName] = useState(rememberedName); const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const load = () => { void roomApi('/api/arcade').then(data => { if (mounted) setList(ArcadeListSchema.parse(data)); }).catch(cause => { if (mounted) setError(arcadeProblem(cause)); }); };
    const loadBoard = () => { void roomApi('/api/arcade/leaderboard').then(data => { if (mounted) setBoard(ArcadeLeaderboardSchema.parse(data)); }).catch(() => {}); };
    load(); loadBoard();
    const lobbies = setInterval(load, 5000); const boards = setInterval(loadBoard, 30_000);
    return () => { mounted = false; clearInterval(lobbies); clearInterval(boards); };
  }, []);
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (!account.person && !name.trim()) { setError('Type your name first.'); return; }
    setBusy(true); setError('');
    try {
      if (!account.person) rememberName(name.trim());
      const look = savedLook(); const lobbyId = newId();
      await roomApi('/api/arcade', { lobbyId, displayName: account.person?.name ?? name.trim(), ...(title.trim() ? { title: title.trim() } : {}), ...(look ? { look } : {}) });
      openLobby(lobbyId);
    } catch (cause) { setError(arcadeProblem(cause)); setBusy(false); }
  };

  return <main className={`room arcade ${frame.className}`} style={frame.style}>
    <header className="room-bar"><div className="room-id"><p className="brand">party<span>.</span></p><p className="room-game">Arcade</p></div><a href="/">Join a game with a code</a></header>
    <div className="arcade-page">
      <h1>Arcade</h1>
      <p className="arcade-lead">Play the minigames with friends, without a host or a game: open a lobby and send its link, or join one below.</p>
      {error && <p role="alert" className="join-error">{error}</p>}
      <section className="arcade-card" aria-labelledby="open-heading">
        <h2 id="open-heading">Open a lobby</h2>
        <form className="arcade-form" onSubmit={event => { void create(event); }}>
          {account.person ? <p className="person-badge">Playing as <strong>{account.person.name}</strong></p>
            : <label>Your name<input autoComplete="nickname" maxLength={40} value={name} onChange={event => setName(event.target.value)} /></label>}
          <label>Lobby name (optional)<input maxLength={60} value={title} placeholder={account.person || name.trim() ? `${account.person?.name ?? name.trim()}'s lobby` : 'For example: Friday arcade'} onChange={event => setTitle(event.target.value)} /></label>
          <button className="primary big" disabled={busy}>{busy ? 'Opening…' : 'Open a lobby'}</button>
        </form>
      </section>
      <section className="arcade-card" aria-labelledby="lobbies-heading">
        <h2 id="lobbies-heading">Open lobbies</h2>
        {!list ? <p role="status">Loading…</p> : !list.lobbies.length ? <p>No open lobbies right now. Open one!</p>
          : <ul className="arcade-lobbies">{list.lobbies.map(lobby => <li key={lobby.id}>
            <div><strong>{lobby.title}</strong>
              <p className="arcade-meta">{lobby.players} {lobby.players === 1 ? 'player' : 'players'}{lobby.leaderName ? ` · led by ${lobby.leaderName}` : ''}{lobby.playing ? ` · playing ${MINIGAMES[lobby.playing].name}` : ''}{lobby.locked ? ' · locked' : ''}</p></div>
            <button type="button" className={lobby.member ? 'primary' : undefined} disabled={lobby.locked && !lobby.member} onClick={() => openLobby(lobby.id)}>{lobby.member ? 'Back in' : lobby.locked ? 'Locked' : 'Join'}</button>
          </li>)}</ul>}
      </section>
      <Leaderboards board={board} signedIn={Boolean(account.person)} />
    </div>
  </main>;
}

/** All-time leaderboards: people only, so a personal key is what puts your name on them. */
function Leaderboards({ board, signedIn }: { board: ArcadeLeaderboard | null; signedIn: boolean }) {
  const [game, setGame] = useState<string | null>(null);
  const shown = board?.best.find(entry => entry.game === game) ?? board?.best[0];
  return <section className="arcade-card" aria-labelledby="boards-heading">
    <h2 id="boards-heading"><FaIcon name="trophy" /> Leaderboards</h2>
    <p className="arcade-meta">{signedIn ? 'Your results count here because this phone plays as you.' : 'Only people with a personal key are on these boards. Sign in with your key on the start page to be on them.'}</p>
    {!board ? <p role="status">Loading…</p> : !board.wins.length ? <p>No results yet.</p> : <>
      <h3>Most wins</h3>
      <ol className="arcade-board">{board.wins.map(row => <li key={row.name}><span>{row.name}</span><span>{row.wins} {row.wins === 1 ? 'win' : 'wins'} · {row.rounds} played · {points(row.pointsMilli)}</span></li>)}</ol>
      {shown && <>
        <h3>Best results</h3>
        <div className="arcade-tabs" role="group" aria-label="Minigame">{board.best.map(entry => <button key={entry.game} type="button" className="small-button" aria-pressed={entry.game === shown.game} onClick={() => setGame(entry.game)}>{MINIGAMES[entry.game].name}</button>)}</div>
        <ol className="arcade-board">{shown.rows.map(row => <li key={row.name}><span>{row.name}</span><span>{arcadeResult(shown.game, row.value, true)}</span></li>)}</ol>
      </>}
    </>}
  </section>;
}
