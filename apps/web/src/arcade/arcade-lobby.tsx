import { Dropdown } from '../ui/dropdown.js';
import { useEffect, useRef, useState } from 'react';
import { ARCADE_PASSWORD_MIN, ARCADE_PASSWORD_MAX, ARCADE_MAX_TEAMS, ArcadeLobbyViewSchema, HEAD_TO_HEAD_KEYS, MINIGAME_KEYS, SHARED_SCREEN_MINIGAMES, TEAM_MINIGAMES, isHeadToHeadKey, isMinigameKey, type ArcadeGame, type ArcadeLobbyView, type ArcadeTeams } from '@party/contracts';
import { newId, roomApi } from '../room/api.js';
import { isUnavailablePageError, navigate, replaceWithHome } from '../navigation.js';
import { CopyButton, useQr } from '../room/join-qr.js';
import { Avatar } from '../players/avatar.js';
import { savedLook } from '../players/look-builder.js';
import { useMe } from '../people/use-me.js';
import { gameName, gameDescription } from '../presentation/catalog.text.js';
import { FaIcon } from '../presentation/icons.js';
import { useSiteLookFrame } from '../presentation/site-look.js';
import { rememberName } from './arcade-home.js';
import { arcadeProblem, arcadeResult, points } from './arcade-text.js';

// The lobby checks in every few seconds: that keeps this browser present (and the leader the leader).
const POLL_MS = 2500;

/** One lobby: join it, see who is here, and (the leader) pick the next minigame and lock or unlock it. */
export function ArcadeLobby({ lobbyId }: { lobbyId: string }) {
  const frame = useSiteLookFrame();
  const [lobby, setLobby] = useState<ArcadeLobbyView | null>(null); const [error, setError] = useState(''); const [gone, setGone] = useState(false);
  const [tick, setTick] = useState(0); const refresh = () => setTick(value => value + 1);
  const entering = useRef(false);
  useEffect(() => {
    let mounted = true;
    const leave = () => { setGone(true); replaceWithHome(); };
    const load = () => { void roomApi(`/api/arcade/lobbies/${lobbyId}`).then(data => {
      if (!mounted) return;
      const next = ArcadeLobbyViewSchema.parse(data);
      if (next.closed) leave();
      else setLobby(next);
    }).catch(cause => {
      if (!mounted) return;
      if (isUnavailablePageError(cause)) leave();
      else setError(arcadeProblem(cause));
    }); };
    load(); const timer = setInterval(load, POLL_MS);
    return () => { mounted = false; clearInterval(timer); };
  }, [lobbyId, tick]);
  // A round this browser plays in: straight into its room.
  useEffect(() => {
    if (!lobby?.round?.seated || entering.current) return; entering.current = true;
    void roomApi<{ sessionId: string }>(`/api/arcade/lobbies/${lobbyId}/enter`, {}).then(result => navigate(`/?room=${result.sessionId}`))
      .catch(cause => { entering.current = false; setError(arcadeProblem(cause)); });
  }, [lobby?.round?.seated, lobby?.round?.number]);
  const act = (path: string, body: unknown = {}) => { setError(''); void roomApi(`/api/arcade/lobbies/${lobbyId}/${path}`, body).then(refresh).catch(cause => setError(arcadeProblem(cause))); };

  const shell = (content: React.ReactNode) => <main className={`room arcade ${frame.className}`} style={frame.style}>
    <header className="room-bar"><div className="room-id"><p className="brand">party<span>.</span></p><p className="room-game">Arcade{lobby ? ` · ${lobby.title}` : ''}</p></div><a href="/?arcade">All lobbies</a></header>
    <div className="arcade-page">{error && <p role="alert" className="join-error">{error}</p>}{content}</div></main>;
  if (gone) return null;
  if (!lobby) return shell(<p role="status">Opening the lobby…</p>);
  if (!lobby.me) return shell(<JoinLobby lobby={lobby} onJoined={refresh} />);

  const leader = lobby.members.find(member => member.leader);
  const url = `${location.origin}/?arcade=${lobby.id}`;
  return shell(<>
    <div className="arcade-title"><h1>{lobby.title}</h1>
      {lobby.me.leader ? <button type="button" className={lobby.locked ? 'primary' : 'ghost'} aria-pressed={lobby.locked} onClick={() => act('lock', { locked: !lobby.locked })}>{lobby.locked ? 'Locked: unlock' : 'Open: lock'}</button>
        : <p className="arcade-meta">{lobby.locked ? 'Locked: nobody new can join' : lobby.protected ? 'Password required to join' : 'Open: anyone with the link can join'}</p>}</div>
    {lobby.round ? <section className="arcade-card" aria-live="polite"><h2>Round {lobby.round.number}: {gameName(lobby.round.game)}</h2>
      {lobby.round.seated ? <p role="status">Going to the round…</p> : <p>This round started before you came in. You play in the next one.</p>}
      {lobby.me.leader && !lobby.round.seated && <button type="button" className="ghost" onClick={() => act('round/end')}>End this round</button>}</section>
      : lobby.me.leader ? <PickRound players={lobby.members.length} onStart={(game, teams) => act('rounds', { roundId: newId(), game, teams })} />
      : <section className="arcade-card"><h2>Next round</h2><p>Waiting for {leader?.displayName ?? 'the leader'} to pick a game…</p></section>}
    <section className="arcade-card" aria-labelledby="members-heading">
      <h2 id="members-heading">Players ({lobby.members.length})</h2>
      <ul className="arcade-members">{lobby.members.map(member => <li key={member.id} className={member.connected ? 'online' : 'offline'}>
        <Avatar look={member.look} size={48} /><span>{member.displayName}{member.id === lobby.me?.memberId ? ' (you)' : ''}</span>
        {member.leader && <span className="arcade-badge"><FaIcon name="star" /> Leader</span>}{member.playing && <span className="arcade-badge">Playing</span>}</li>)}</ul>
    </section>
    {lobby.lastRound && <section className="arcade-card" aria-labelledby="last-heading"><h2 id="last-heading">Round {lobby.lastRound.number}: {gameName(lobby.lastRound.game)}</h2>
      <ol className="arcade-board">{lobby.lastRound.results.map(row => <li key={row.memberId}><span><Avatar look={row.look} size={28} /> {row.place ? `${row.place}. ` : ''}{row.displayName}</span>
        <span>{lobby.lastRound!.teams || !isMinigameKey(lobby.lastRound!.game) ? '' : `${arcadeResult(lobby.lastRound!.game, row.value)} · `}{points(row.pointsMilli)}</span></li>)}</ol></section>}
    {lobby.totals.length > 0 && <section className="arcade-card" aria-labelledby="totals-heading"><h2 id="totals-heading">Total in this lobby</h2>
      <ol className="arcade-board">{lobby.totals.map(row => <li key={row.memberId}><span><Avatar look={row.look} size={28} /> {row.displayName}</span><span>{points(row.pointsMilli)} · {row.wins} {row.wins === 1 ? 'win' : 'wins'} · {row.rounds} played</span></li>)}</ol></section>}
    <InviteCard url={url} locked={lobby.locked} protected={lobby.protected} />
    {lobby.me.leader && <LobbyPassword lobby={lobby} onChanged={refresh} />}
    <p><button type="button" className="ghost" onClick={() => { void roomApi(`/api/arcade/lobbies/${lobbyId}/leave`, {}).then(() => navigate('/?arcade')).catch(cause => setError(arcadeProblem(cause))); }}>Leave this lobby</button></p>
  </>);
}

function InviteCard({ url, locked, protected: needsPassword }: { url: string; locked: boolean; protected: boolean }) {
  const image = useQr(url);
  return <section className="arcade-card arcade-invite" aria-labelledby="invite-heading"><h2 id="invite-heading">Invite players</h2>
    {locked && <p className="arcade-meta">Unlock the lobby to accept new players.</p>}
    {needsPassword && <p className="arcade-meta">Share the password separately from the invite link.</p>}
    {image && <img src={image.src} width={image.pixels} height={image.pixels} alt="Scan to join this lobby" />}
    <a href={url}>{url}</a><div className="copy-row"><CopyButton text={url} label="Copy link" /></div></section>;
}

function JoinLobby({ lobby, onJoined }: { lobby: ArcadeLobbyView; onJoined: () => void }) {
  const account = useMe(); const [name, setName] = useState(() => { try { return localStorage.getItem('party_arcade_name') ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [password, setPassword] = useState('');
  const join = async (event: React.FormEvent) => {
    event.preventDefault(); if (!account.person && !name.trim()) { setError('Type your name first.'); return; }
    setBusy(true); setError('');
    try {
      if (!account.person) rememberName(name.trim()); const look = savedLook();
      await roomApi(`/api/arcade/lobbies/${lobby.id}/join`, { displayName: account.person?.name ?? name.trim(), ...(password ? { password } : {}), ...(look ? { look } : {}) }); onJoined();
    } catch (cause) { setError(arcadeProblem(cause)); } finally { setBusy(false); }
  };
  return <section className="join-card arcade-join" aria-labelledby="join-lobby-heading">
    <h1 id="join-lobby-heading">{lobby.title}</h1>
    <p className="arcade-meta">{lobby.protected ? 'Password-protected lobby' : <>{lobby.members.length} {lobby.members.length === 1 ? 'player' : 'players'}: {lobby.members.map(member => member.displayName).join(', ') || 'nobody yet'}</>}</p>
    {error && <p role="alert" className="join-error">{error}</p>}
    {lobby.locked && <p>This lobby is locked: only players who were in it can come back.</p>}
    <form className="join-form" onSubmit={event => { void join(event); }}>
      {account.person ? <p className="person-badge">Playing as <strong>{account.person.name}</strong></p>
        : <label>Your name<input autoComplete="nickname" maxLength={40} value={name} onChange={event => setName(event.target.value)} /></label>}
      {lobby.protected && <label>Lobby password<input type="password" autoComplete="current-password" maxLength={ARCADE_PASSWORD_MAX}
        value={password} onChange={event => setPassword(event.target.value)} /></label>}
      <button className="primary big" disabled={busy}>{busy ? 'Joining…' : 'Join the lobby'}</button>
    </form>
  </section>;
}

function LobbyPassword({ lobby, onChanged }: { lobby: ArcadeLobbyView; onChanged: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const save = async (next: string | null) => {
    setBusy(true); setNotice(''); setError('');
    try {
      await roomApi(`/api/arcade/lobbies/${lobby.id}/password`, { password: next });
      setPassword(''); setNotice(next ? 'Lobby password saved.' : 'Lobby password removed.'); onChanged();
    } catch (cause) { setError(arcadeProblem(cause)); }
    finally { setBusy(false); }
  };
  return <details className="arcade-card arcade-password">
    <summary>Lobby password{lobby.protected ? ' · On' : ''}</summary>
    <form className="arcade-form" onSubmit={event => { event.preventDefault(); void save(password); }}>
      <label>{lobby.protected ? 'New lobby password' : 'Set a lobby password'}<input type="password" autoComplete="new-password" required
        minLength={ARCADE_PASSWORD_MIN} maxLength={ARCADE_PASSWORD_MAX} value={password} onChange={event => setPassword(event.target.value)} /></label>
      <div className="arcade-password-actions">
        <button type="submit" className="primary" disabled={busy || password.trim().length === 0}>Save password</button>
        {lobby.protected && <button type="button" className="danger" disabled={busy} onClick={() => void save(null)}>Remove password</button>}
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="join-error">{error}</p>}
    </form>
  </details>;
}

/** The leader's choice for the next round: a minigame, and alone or in a number of teams (made at random or by the players). */
function PickRound({ players, onStart }: { players: number; onStart: (game: ArcadeGame, teams: ArcadeTeams | null) => void }) {
  const [game, setGame] = useState<ArcadeGame>('reaction'); const [teamCount, setTeamCount] = useState(0); const [formation, setFormation] = useState<ArcadeTeams['formation']>('random');
  const duel = isHeadToHeadKey(game);
  const teamOnly = !duel && TEAM_MINIGAMES.includes(game);
  // Never more teams than players; a team-only minigame needs at least two.
  const most = Math.min(ARCADE_MAX_TEAMS, Math.max(2, players));
  const count = duel ? 0 : teamOnly && teamCount < 2 ? 2 : Math.min(teamCount, most);
  const enough = players >= Math.max(duel ? 2 : 1, count);
  return <section className="arcade-card" aria-labelledby="pick-heading">
    <h2 id="pick-heading">Next round</h2>
    <div className="arcade-pick">
      <label>Game<Dropdown value={game} onChange={value => setGame(value as ArcadeGame)}
        options={[
          ...MINIGAME_KEYS.map(value => ({ value, group: 'Minigames', label: gameName(value) + (TEAM_MINIGAMES.includes(value) ? ' (teams)' : '') })),
          ...HEAD_TO_HEAD_KEYS.map(value => ({ value, group: 'Head-to-head', label: gameName(value) })),
        ]} /></label>
      {!duel && <label>Play<Dropdown value={String(count)} onChange={value => setTeamCount(Number(value))}
        options={[...(teamOnly ? [] : [{ value: '0', label: 'Everyone alone' }]),
          ...Array.from({ length: most - 1 }, (_, index) => ({ value: String(index + 2), label: `In ${index + 2} teams` }))]} /></label>}
      {count > 0 && <label>Teams made<Dropdown value={formation} onChange={value => setFormation(value as ArcadeTeams['formation'])}
        options={[{ value: 'random', label: 'At random' }, { value: 'players', label: 'By the players' }]} /></label>}
    </div>
    <p className="arcade-meta">{gameDescription(game)}</p>
    {isMinigameKey(game) && SHARED_SCREEN_MINIGAMES.includes(game) && <p className="arcade-meta">No TV? The phones show the game too. A shared screen from the round lets everyone watch together.</p>}
    {!enough && <p className="arcade-meta">{duel ? 'A duel needs two players.' : `${count} teams need at least ${count} players.`}</p>}
    <button type="button" className="primary big" disabled={!enough} onClick={() => onStart(game, count ? { count, formation } : null)}>Play {gameName(game)}</button>
  </section>;
}
