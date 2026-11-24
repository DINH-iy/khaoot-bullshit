import { useEffect, useRef, useState } from 'react';
import { Loader } from '../ui/loader.js';
import { ARCADE_PASSWORD_MIN, ARCADE_PASSWORD_MAX, ARCADE_MAX_TEAMS, ArcadeLobbyViewSchema, HEAD_TO_HEAD_KEYS, MINIGAME_KEYS, SHARED_SCREEN_MINIGAMES, TEAM_MINIGAMES, isHeadToHeadKey, isMinigameKey, type ArcadeGame, type ArcadeLobbyView, type ArcadePick, type ArcadeTeams, type GraphLibraryEntry, ArcadeGraphsSchema } from '@party/contracts';
import { newId, roomApi } from '../room/api.js';
import { isUnavailablePageError, navigate, replaceWithHome } from '../navigation.js';
import { CopyButton, useQr } from '../room/join-qr.js';
import { Avatar } from '../players/avatar.js';
import { savedLook } from '../players/look-builder.js';
import { useMe } from '../people/use-me.js';
import { gameName, gameDescription } from '../presentation/catalog.text.js';
import { FaIcon } from '../presentation/icons.js';
import { GameSymbol } from '../presentation/game-symbol.js';
import { BottomSheet } from '../room-extras/bottom-sheet.js';
import { useSiteLookFrame } from '../presentation/site-look.js';
import { rememberName } from './arcade-home.js';
import { arcadeProblem, arcadeResult, points } from './arcade-text.js';

// The lobby checks in every few seconds: that keeps this browser present (and the leader the leader).
const POLL_MS = 2500;

/**
 * One lobby, laid out like a party game's phone lobby: a short bar (players, invite and settings behind icon buttons),
 * one card with the next round, and the one action pinned at the bottom. Lists open in bottom sheets.
 */
export function ArcadeLobby({ lobbyId }: { lobbyId: string }) {
  const frame = useSiteLookFrame();
  const [lobby, setLobby] = useState<ArcadeLobbyView | null>(null); const [error, setError] = useState(''); const [gone, setGone] = useState(false);
  const [tick, setTick] = useState(0); const refresh = () => setTick(value => value + 1);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
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
  // A round that just finished: back to the newest card.
  const newest = lobby?.rounds[0]?.number;
  useEffect(() => { setRoundIndex(0); }, [newest]);
  const act = (path: string, body: unknown = {}) => { setError(''); void roomApi(`/api/arcade/lobbies/${lobbyId}/${path}`, body).then(refresh).catch(cause => setError(arcadeProblem(cause))); };
  const close = () => setSheet(null);

  if (gone) return null;
  if (!lobby || !lobby.me) return <main className={`room arcade ${frame.className}`} style={frame.style}>
    <header className="room-bar"><div className="room-id"><p className="brand">party<span>.</span></p><p className="room-game">Arcade{lobby ? ` · ${lobby.title}` : ''}</p></div>
      <a className="arcade-nav-button" href="/?arcade">All lobbies</a></header>
    <div className="arcade-page">{error && <p role="alert" className="join-error">{error}</p>}
      {lobby ? <JoinLobby lobby={lobby} onJoined={refresh} /> : <Loader label="Opening the lobby…" />}</div></main>;

  const me = lobby.me; const leader = lobby.members.find(member => member.leader);
  const rounds = lobby.rounds.length ? lobby.rounds : lobby.lastRound ? [lobby.lastRound] : [];
  // The round shown in the history (0 = newest); a new round coming in keeps the view on the newest.
  const shownIndex = Math.min(roundIndex, Math.max(0, rounds.length - 1)); const shown = rounds[shownIndex];
  const url = `${location.origin}/?arcade=${lobby.id}`;
  // The player count is on the avatar button next to it, so the status stays one short word.
  const status = lobby.locked ? 'Locked' : lobby.protected ? 'Open · password' : 'Open';
  return <main className={`room arcade arcade-lobby ${frame.className}`} style={frame.style}>
    <header className="arcade-lobby-bar">
      <a className="arcade-icon-button" href="/?arcade" aria-label="All lobbies"><FaIcon name="arrow-right" turn={180} /></a>
      <div className="arcade-lobby-name"><h1>{lobby.title}</h1>
        <p>{lobby.locked && <FaIcon name="lock" />}{status}</p></div>
      <button type="button" className="arcade-players-button" aria-haspopup="dialog" onClick={() => setSheet('players')}>
        <span className="arcade-avatar-stack" aria-hidden="true">{lobby.members.slice(0, 2).map(member => <Avatar key={member.id} look={member.look} size={26} />)}</span>
        <span className="arcade-count"><span className="visually-hidden">Players </span>{lobby.members.length}</span></button>
      <button type="button" className="arcade-icon-button" aria-label="Invite players" aria-haspopup="dialog" onClick={() => setSheet('invite')}><FaIcon name="user-plus" /></button>
      <button type="button" className="arcade-icon-button" aria-label="Lobby settings" aria-haspopup="dialog" onClick={() => setSheet('settings')}><FaIcon name="gear" /></button>
    </header>

    <div className="arcade-lobby-main">
      {error && <p role="alert" className="join-error">{error}</p>}
      {lobby.round ? <section className="arcade-next" aria-live="polite" aria-labelledby="round-heading">
        <p className="arcade-kicker">Round {lobby.round.number} is on</p>
        <div className="arcade-game-tile static"><span className="arcade-game-symbol" aria-hidden="true"><GameSymbol game={lobby.round.game} /></span>
          <span><strong id="round-heading">{gameName(lobby.round.game)}</strong><small>{lobby.round.seated ? 'Going to the round…' : 'It started before you came in. You play in the next one.'}</small></span></div>
      </section>
        : <PickRound lobbyId={lobby.id} players={lobby.members.length} pick={lobby.pick}
          {...(me.leader ? { onPick: (pick: ArcadePick) => act('pick', pick), onStart: (game: ArcadeGame, teams: ArcadeTeams | null, graph?: string) => act('rounds', { roundId: newId(), game, teams, ...(graph ? { graph } : {}) }) }
            : { chooser: leader?.displayName ?? 'The leader' })} />}

      {rounds.length > 0 && <RoundHistory rounds={rounds} me={me.memberId} index={shownIndex} onIndex={setRoundIndex} onScores={() => setSheet('scores')} />}
    </div>

    {/* The one action of this screen, always in reach at the bottom (the leader's Play sits in the picker form). */}
    {(lobby.round || !me.leader) && <div className="arcade-lobby-action">
      {lobby.round ? me.leader && !lobby.round.seated ? <button type="button" className="ghost big" onClick={() => act('round/end')}>End this round</button>
        : <p className="arcade-waiting" role="status">{lobby.round.seated ? 'Going to the round…' : 'Round in progress'}</p>
        : me.leader ? null
        : <p className="arcade-waiting" role="status"><FaIcon name="star" /> Waiting for {leader?.displayName ?? 'the leader'} to start</p>}
    </div>}

    {sheet === 'players' && <BottomSheet title={`Players (${lobby.members.length})`} onClose={close}>
      <ul className="sheet-players arcade-member-list">{lobby.members.map(member => <li key={member.id} className={member.connected ? 'online' : 'offline'}>
        <Avatar look={member.look} size={40} /><span>{member.displayName}{member.id === me.memberId ? ' (you)' : ''}</span>
        {member.leader && <span className="arcade-badge"><FaIcon name="star" /> Leader</span>}{member.playing && <span className="arcade-badge">Playing</span>}
        <span className={`dot${member.connected ? '' : ' off'}`} role="img" aria-label={member.connected ? 'Online' : 'Away'} /></li>)}</ul>
    </BottomSheet>}
    {sheet === 'invite' && <BottomSheet title="Invite players" onClose={close}><InviteCard url={url} locked={lobby.locked} protected={lobby.protected} /></BottomSheet>}
    {sheet === 'settings' && <BottomSheet title="Lobby settings" onClose={close}>
      {me.leader ? <>
        <SettingSwitch label="Lock the lobby" hint={lobby.locked ? 'Nobody new can join. Players who were here can come back.' : 'Anyone with the link can join.'}
          on={lobby.locked} onChange={locked => act('lock', { locked })} />
        <LobbyPassword lobby={lobby} onChanged={refresh} />
      </> : <p className="arcade-meta">{leader?.displayName ?? 'The leader'} runs this lobby: the games, the lock and the password.</p>}
      <button type="button" className="ghost" onClick={() => { void roomApi(`/api/arcade/lobbies/${lobbyId}/leave`, {}).then(() => navigate('/?arcade')).catch(cause => setError(arcadeProblem(cause))); }}>Leave this lobby</button>
    </BottomSheet>}
    {sheet === 'scores' && shown && <BottomSheet title="Scores" onClose={close}>
      <section className="arcade-score-block" aria-labelledby="last-heading"><h3 id="last-heading">Round {shown.number}: {gameName(shown.game)}</h3>
        <ol className="arcade-board">{shown.results.map(row => <li key={row.memberId}><span><Avatar look={row.look} size={28} /> {row.place ? `${row.place}. ` : ''}{row.displayName}</span>
          <span>{shown.teams || !isMinigameKey(shown.game) ? '' : `${arcadeResult(shown.game, row.value)} · `}{points(row.pointsMilli)}</span></li>)}</ol></section>
      {lobby.totals.length > 0 && <section className="arcade-score-block" aria-labelledby="totals-heading"><h3 id="totals-heading">Total in this lobby</h3>
        <ol className="arcade-board">{lobby.totals.map(row => <li key={row.memberId}><span><Avatar look={row.look} size={28} /> {row.displayName}</span><span>{points(row.pointsMilli)} · {row.wins} {row.wins === 1 ? 'win' : 'wins'} · {row.rounds} played</span></li>)}</ol></section>}
    </BottomSheet>}
  </main>;
}

type Sheet = 'players' | 'invite' | 'settings' | 'scores';

/**
 * Draw the Graph: which chart. "Random" takes one from all collections (every graph in the games authors made, and the
 * built-in sample); or one chart, picked from the list grouped by collection. Only questions and labels come here.
 */
function GraphChoice({ lobbyId, value, disabled, onChange }: { lobbyId: string; value: string | undefined; disabled: boolean; onChange: (value: string | undefined) => void }) {
  const [graphs, setGraphs] = useState<GraphLibraryEntry[] | null>(null); const [open, setOpen] = useState(false);
  useEffect(() => { void roomApi(`/api/arcade/lobbies/${lobbyId}/graphs`).then(data => setGraphs(ArcadeGraphsSchema.parse(data).graphs)).catch(() => setGraphs([])); }, [lobbyId]);
  const chosen = value ? graphs?.find(entry => entry.id === value) : undefined;
  const collections = [...new Set((graphs ?? []).map(entry => entry.collection))];
  const label = chosen ? chosen.question : value && !graphs ? 'Loading…' : 'Random from all collections';
  return <div className="arcade-segment-row"><span className="arcade-segment-label" aria-hidden="true">Graph</span>
    {disabled ? <p className="arcade-graph-choice static">{label}</p>
      : <button type="button" className="arcade-graph-choice" aria-haspopup="dialog" onClick={() => setOpen(true)}><span><span className="visually-hidden">Graph: </span>{label}</span><span className="arcade-change">Change</span></button>}
    {open && <BottomSheet title="Choose a graph" onClose={() => setOpen(false)} resizable>
      <button type="button" className="arcade-graph-option" aria-pressed={!value} onClick={() => { onChange(undefined); setOpen(false); }}>
        <strong>Random from all collections</strong><small>{graphs ? `${graphs.length} ${graphs.length === 1 ? 'graph' : 'graphs'} to draw from` : 'Loading…'}</small></button>
      {collections.map(collection => <div key={collection} role="group" aria-label={collection} className="arcade-game-group"><h3>{collection}</h3>
        <div className="arcade-graph-list">{graphs!.filter(entry => entry.collection === collection).map(entry => <button key={entry.id} type="button" className="arcade-graph-option" aria-pressed={entry.id === value}
          onClick={() => { onChange(entry.id); setOpen(false); }}><strong>{entry.question}</strong>
          {(entry.yLabel || entry.startLabel) && <small>{[entry.yLabel, entry.startLabel && entry.endLabel ? `${entry.startLabel}–${entry.endLabel}` : entry.startLabel].filter(Boolean).join(' · ')}</small>}</button>)}</div></div>)}
    </BottomSheet>}
  </div>;
}

type RoundResults = ArcadeLobbyView['rounds'][number];

/**
 * The lobby's rounds, newest first, as cards to swipe through (older to the right), each with its top three and your
 * own place. The arrows and dots do the same for a mouse or keyboard; Scores opens the full results of the shown round.
 */
function RoundHistory({ rounds, me, index, onIndex, onScores }: { rounds: RoundResults[]; me: string; index: number; onIndex: (index: number) => void; onScores: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const go = (next: number) => {
    const target = Math.max(0, Math.min(rounds.length - 1, next)); const node = track.current;
    node?.scrollTo({ left: target * node.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    onIndex(target);
  };
  // Keep the shown card in place when the list changes (a new round arrives and the view stays on index 0).
  useEffect(() => { const node = track.current; if (node && Math.round(node.scrollLeft / Math.max(1, node.clientWidth)) !== index) node.scrollLeft = index * node.clientWidth; }, [index, rounds.length]);
  return <section className="arcade-last" aria-label="Rounds played" aria-roledescription="carousel">
    <div ref={track} className="arcade-rounds" tabIndex={0} aria-label="Rounds, newest first"
      onScroll={event => { const node = event.currentTarget; const at = Math.round(node.scrollLeft / Math.max(1, node.clientWidth)); if (at !== index) onIndex(at); }}
      onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); } if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); } }}>
      {rounds.map((round, position) => <RoundCard key={round.number} round={round} me={me} newest={position === 0} hidden={position !== index} />)}
    </div>
    <div className="arcade-rounds-nav">
      <button type="button" className="arcade-round-arrow" aria-label="Newer round" disabled={index === 0} onClick={() => go(index - 1)}><FaIcon name="chevron-down" turn={90} /></button>
      <span className="arcade-round-dots" aria-hidden="true">{rounds.length <= 10 ? rounds.map((round, position) => <span key={round.number} className={position === index ? 'on' : undefined} />)
        : `${index + 1} / ${rounds.length}`}</span>
      <button type="button" className="arcade-round-arrow" aria-label="Older round" disabled={index === rounds.length - 1} onClick={() => go(index + 1)}><FaIcon name="chevron-down" turn={-90} /></button>
      <button type="button" className="arcade-last-more" aria-haspopup="dialog" onClick={onScores}>Scores</button>
    </div>
  </section>;
}

function RoundCard({ round, me, newest, hidden }: { round: RoundResults; me: string; newest: boolean; hidden: boolean }) {
  const top = round.results.slice(0, 3); const mine = round.results.find(row => row.memberId === me);
  const rows = mine && !top.includes(mine) ? [...top, mine] : top;
  const measured = (row: RoundResults['results'][number]) => round.teams || !isMinigameKey(round.game) ? '' : arcadeResult(round.game, row.value);
  const id = `round-${round.number}-heading`;
  return <article className="arcade-round-slide" aria-labelledby={id} aria-hidden={hidden || undefined}>
    <div className="arcade-last-head"><FaIcon name="trophy" /><h2 id={id}>Round {round.number}: {gameName(round.game)}</h2>{newest && <span className="arcade-badge">Latest</span>}</div>
    {rows.length ? <ol className="arcade-podium">{rows.map(row => <li key={row.memberId} className={row.memberId === me ? 'mine' : undefined}>
      <span className={`arcade-place${row.place === 1 ? ' first' : ''}`}>{row.place ?? '–'}</span><Avatar look={row.look} size={28} />
      <span className="arcade-podium-name"><strong>{row.displayName}{row.memberId === me ? ' (you)' : ''}</strong>{measured(row) && <small>{measured(row)}</small>}</span>
      {/* This round's points, and the lobby total they brought the player to. */}
      <span className="arcade-podium-points"><strong>+{points(row.pointsMilli)}</strong>{row.totalMilli !== undefined && <small>{points(row.totalMilli)} total</small>}</span></li>)}</ol>
      : <p className="arcade-meta">No results.</p>}
  </article>;
}

/** A labelled segmented bar: equal parts on one line, the chosen one lit (also shown read-only to the other players). */
function Segments<T extends string | number>({ label, value, options, disabled, onChange }: {
  label: string; value: T; options: { value: T; text: string; name: string }[]; disabled: boolean; onChange: (value: T) => void;
}) {
  return <div className="arcade-segment-row"><span className="arcade-segment-label" aria-hidden="true">{label}</span>
    <div className="arcade-segments" role="group" aria-label={label}>{options.map(option =>
      <button key={option.value} type="button" aria-pressed={option.value === value} aria-label={option.name} disabled={disabled} onClick={() => onChange(option.value)}>{option.text}</button>)}</div></div>;
}

/** An on/off setting as a switch with its label and what it means now. */
function SettingSwitch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} className="arcade-switch" onClick={() => onChange(!on)}>
    <span><strong>{label}</strong><small>{hint}</small></span><span className="arcade-switch-track" aria-hidden="true"><span /></span></button>;
}

/**
 * The next round: the game as a big tile, and alone or in teams as chips. The leader changes them (each change is
 * sent to the lobby) and starts with the pinned Play button; everyone else sees the same card read-only, following along.
 */
function PickRound({ lobbyId, players, pick, chooser, onPick, onStart }: {
  lobbyId: string; players: number; pick: ArcadePick | null; chooser?: string;
  onPick?: (pick: ArcadePick) => void; onStart?: (game: ArcadeGame, teams: ArcadeTeams | null, graph?: string) => void;
}) {
  const watching = chooser !== undefined;
  const [choosing, setChoosing] = useState(false);
  const fromPick = () => ({ game: pick?.game ?? 'reaction' as ArcadeGame, teamCount: pick?.teams?.count ?? 0, formation: pick?.teams?.formation ?? 'random' as ArcadeTeams['formation'], graph: pick?.graph });
  // The leader starts from the stored choice (also after taking over) and then keeps their own; watchers always show the stored one.
  const [own, setOwn] = useState(fromPick);
  const { game, teamCount, formation, graph } = watching ? fromPick() : own;
  const choose = (next: Partial<typeof own>) => {
    const value = { ...own, ...next }; setOwn(value);
    onPick?.({ game: value.game, teams: value.teamCount >= 2 ? { count: value.teamCount, formation: value.formation } : null, ...(value.graph ? { graph: value.graph } : {}) });
  };
  const duel = isHeadToHeadKey(game);
  const teamOnly = !duel && TEAM_MINIGAMES.includes(game);
  // Never more teams than players; a team-only minigame needs at least two.
  const most = Math.min(ARCADE_MAX_TEAMS, Math.max(2, players));
  const count = duel ? 0 : teamOnly && teamCount < 2 ? 2 : Math.min(teamCount, most);
  const enough = players >= Math.max(duel ? 2 : 1, count);
  const teamCounts = Array.from({ length: most - 1 }, (_, index) => index + 2);
  // Switching back to teams brings back the last number of teams the leader chose.
  const [lastCount, setLastCount] = useState(Math.max(2, own.teamCount));
  const tile = <><span className="arcade-game-symbol" aria-hidden="true"><GameSymbol game={game} /></span>
    <span><strong>{gameName(game)}{duel ? ' · duel' : ''}</strong><small>{gameDescription(game)}</small></span></>;
  return <form id="arcade-pick" className="arcade-next" aria-labelledby="pick-heading"
    onSubmit={event => { event.preventDefault(); if (enough) onStart?.(game, count ? { count, formation } : null, game === 'draw-the-graph' ? graph : undefined); }}>
    <h2 id="pick-heading" className="arcade-kicker">Next round</h2>
    {watching && <p className="arcade-meta" role="status"><FaIcon name="star" /> {chooser} is choosing</p>}
    {watching ? <div className="arcade-game-tile static">{tile}</div>
      : <button type="button" className="arcade-game-tile" aria-haspopup="dialog" onClick={() => setChoosing(true)}>
        {tile}<span className="arcade-change">Change</span></button>}
    {/* Alone or in teams; choosing teams opens how many and how they are made. Others see the same, read-only. */}
    {!duel && <Segments label="Play" value={count > 0 ? 'teams' : 'alone'} disabled={watching}
      onChange={value => choose({ teamCount: value === 'teams' ? Math.min(lastCount, most) : 0 })}
      options={[...(teamOnly ? [] : [{ value: 'alone' as const, text: 'Alone', name: 'Alone' }]), { value: 'teams' as const, text: 'In teams', name: 'In teams' }]} />}
    {count > 0 && <div className="arcade-teams-more">
      <Segments label="How many teams" value={count} disabled={watching} onChange={value => { setLastCount(value); choose({ teamCount: value }); }}
        options={teamCounts.map(value => ({ value, text: String(value), name: `${value} teams` }))} />
      <Segments label="Teams made" value={formation} onChange={value => choose({ formation: value })} disabled={watching}
        options={[{ value: 'random' as const, text: 'Random', name: 'Random teams' }, { value: 'players' as const, text: 'Players pick', name: 'Players pick teams' }]} />
    </div>}
    {game === 'draw-the-graph' && <GraphChoice lobbyId={lobbyId} value={graph} disabled={watching} onChange={value => choose({ graph: value })} />}
    {isMinigameKey(game) && SHARED_SCREEN_MINIGAMES.includes(game) && <p className="arcade-meta">No TV needed: the phones show the game too.</p>}
    {!enough && <p className="arcade-meta">{duel ? 'A duel needs two players.' : `${count} teams need at least ${count} players.`}</p>}
    {/* The leader's Play: pinned at the bottom of the screen (see .arcade-lobby-action). */}
    {onStart && <div className="arcade-lobby-action arcade-play"><button type="submit" className="primary big" disabled={!enough}><FaIcon name="play" /> Play {gameName(game)}</button></div>}
    {choosing && <BottomSheet title="Choose a game" onClose={() => setChoosing(false)} resizable>
      {([['Minigames', MINIGAME_KEYS], ['Head-to-head', HEAD_TO_HEAD_KEYS]] as const).map(([group, keys]) =>
        <div key={group} role="group" aria-label={group} className="arcade-game-group"><h3>{group}</h3>
          <div className="arcade-game-grid">{keys.map(key => <button key={key} type="button" className="arcade-game-option" aria-pressed={key === game}
            onClick={() => { choose({ game: key }); setChoosing(false); }}>
            <span className="arcade-game-symbol" aria-hidden="true"><GameSymbol game={key} /></span>
            <span>{gameName(key)}{isMinigameKey(key) && TEAM_MINIGAMES.includes(key) ? <small>Teams</small> : null}</span></button>)}</div></div>)}
    </BottomSheet>}
  </form>;
}

function InviteCard({ url, locked, protected: needsPassword }: { url: string; locked: boolean; protected: boolean }) {
  const image = useQr(url);
  return <section className="arcade-invite" aria-label="Invite link">
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
  return <section className="arcade-password" aria-labelledby="password-heading">
    <h3 id="password-heading">Lobby password · {lobby.protected ? 'On' : 'Off'}</h3>
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
  </section>;
}
