import { useEffect, useRef, useState } from 'react';
import { testSeat } from './test-seat.js';
import { answerMark, cleanRoomCode, formatRoomCode, GameCommandSchema, PLAYER_COMMANDS, ROOM_CODE_LENGTH, RoomLookSchema, type TextKey } from '@party/contracts';
import { newId, roomApi } from './api.js';
import { useRoom } from './use-room.js';
import { BigCode, CopyIcon, JoinLink, JoinQr, publicJoinUrl } from './join-qr.js';
import { useRemaining } from './stage-timer.js';
import { ConnectionMenu, FloatingScores, HostDialog, Popover, RoundBar } from './room-chrome.js';
import { FaIcon } from '../presentation/icons.js';
import { AnswerInput, draftValue, emptyDraft } from './answer-input.js';
import { JudgePanel, leaderLine, Scoreboard, StageResults } from './results.js';
import { VoteBallot } from './vote.js';
import { SeatApprovalSetting, SeatReclaim, SeatRequests } from './seat-reclaim.js';
import { ExpectedPeople, NameRequests, NewKeyCard, PickYourName, SignupSetting, TestBenchSetting } from './room-people.js';
import { TeamForming, TeamSummary, captainAnswers, ownTeam } from './teams.js';
import { RouteChoice } from './route-choice.js';
import { ExplainPanel } from './explain-panel.js';
import { DuelPanel } from './duel.js';
import { MinigameStage } from '../minigames/minigame-stage.js';
import { DrawingAnswer } from '../drawing/drawing-answer.js';
import { PhoneDock } from '../room-extras/phone-dock.js';
import { ReactionsOverlay } from '../room-extras/reactions.js';
import { RoomSettings, SideGamesSwitch } from '../room-extras/room-settings.js';
import { PointsCelebration } from '../room-extras/celebrate.js';
import { BreakOverlay, FinaleShow, WheelBadge, WheelOverlay } from '../room-extras/show-extras.js';
import { formatPoints } from './results.js';
import { Avatar, RoomSessionContext } from '../players/avatar.js';
import { LookBuilder, rememberLook, savedLook } from '../players/look-builder.js';
import { useMe, type Person } from '../people/use-me.js';
import { wasOwner } from '../owner/owner-session.js';
import { KeySignIn } from '../people/key-sign-in.js';
import { ArcadeLeaderMenu, ArcadeLeaderNext, useArcadeRound } from '../arcade/arcade-round.js';
import './room.css';
import { LookContext, themeClass, themeStyle, useBuiltLook, useLook, useMoment, useText, type LookInput } from '../presentation/look.js';
import { answerFit } from './answer-fit.js';
import { Mark } from '../presentation/mark-icons.js';

const initial = new URL(location.href);
const access = new URLSearchParams(initial.hash.slice(1)).get('access');
if (access) history.replaceState(null, '', `${initial.pathname}${initial.search}`);

/** Joining from a phone: room code and name, plus seat takeover and a way to host instead. */
function JoinScreen({ roomCode, setRoomCode, name, setName, busy, error, onJoin, onReclaim, style, className, title, person, linked, onForget, onSignIn, signup, makeAccount, setMakeAccount, expected, onPicked }: {
  roomCode: string; setRoomCode: (value: string) => void; name: string; setName: (value: string) => void; busy: boolean; error: string; onJoin: () => void; onReclaim: () => void;
  style: React.CSSProperties; className: string; title: string | null;
  person: Person | null | undefined; linked: { name: string | null } | null; onForget: () => void; onSignIn: (key: string) => Promise<void>;
  // People in the room: whether a guest may make an account here, and the people the host added (pick your name).
  signup: boolean; makeAccount: boolean; setMakeAccount: (value: boolean) => void; expected: { id: string; name: string }[]; onPicked: (name: string) => void;
}) {
  const t = useText(); const [ownerBrowser] = useState(wasOwner);
  // Our own messages under the field, instead of the browser's small "fill in this field" bubble.
  const [problems, setProblems] = useState<{ code?: string; name?: string }>({});
  const codeRef = useRef<HTMLInputElement>(null); const nameRef = useRef<HTMLInputElement>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = { ...(roomCode.length !== ROOM_CODE_LENGTH ? { code: t('join.codeMissing') } : {}), ...(!person && !name.trim() ? { name: t('join.nameMissing') } : {}) };
    setProblems(found);
    if (found.code) codeRef.current?.focus(); else if (found.name) nameRef.current?.focus(); else onJoin();
  };
  return <main className={`room room-join ${className}`} style={style}>
    <section className="join-card" aria-labelledby="join-heading">
      <p className="brand">party<span>.</span></p>
      <div className="join-head"><h1 id="join-heading">{t('join.title')}</h1>{title && <p className="room-game">{title}</p>}</div>
      {error && <p role="alert" className="join-error">{error}</p>}
      {linked && <p role="status" className={linked.name ? 'person-linked' : 'join-error'}>{linked.name ? `This phone now plays as ${linked.name}. Join any room and you are ${linked.name}.` : 'This personal link no longer works. Ask the organiser for a new one.'}</p>}
      <form className="join-form" noValidate onSubmit={submit}>
        <label>{t('join.code')}
          {/* Shown as ABC-123 and always in capitals; only the six code characters are kept, so it can never get longer than a code. */}
          <input ref={codeRef} className="code-input" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" enterKeyHint="next"
            value={formatRoomCode(roomCode)} maxLength={ROOM_CODE_LENGTH + 1} placeholder="ABC-123" aria-invalid={problems.code ? true : undefined} aria-describedby={problems.code ? 'join-code-problem' : undefined}
            onChange={event => { setRoomCode(cleanRoomCode(event.target.value)); setProblems(({ code: _code, ...rest }) => rest); }} /></label>
        {problems.code && <p id="join-code-problem" className="field-problem" role="alert">{problems.code}</p>}
        {person ? <div className="person-badge"><span>Playing as <strong>{person.name}</strong></span><button type="button" className="link-button" onClick={onForget}>Not {person.name}?</button></div>
          : <><label>{t('join.name')}<input ref={nameRef} autoComplete="nickname" enterKeyHint="go" value={name} maxLength={40} aria-invalid={problems.name ? true : undefined} aria-describedby={problems.name ? 'join-name-problem' : undefined}
            onChange={event => { setName(event.target.value); setProblems(({ name: _name, ...rest }) => rest); }} /></label>
            {problems.name && <p id="join-name-problem" className="field-problem" role="alert">{problems.name}</p>}
            {signup && <label className="choice make-account"><input type="checkbox" checked={makeAccount} onChange={event => setMakeAccount(event.target.checked)} />
              <span>Make me an account <small>next time you are you again (look, chips and stats), with a personal code</small></span></label>}</>}
        <button className="primary big" disabled={busy} type="submit">{busy ? t('join.joining') : t('join.button')}</button>
      </form>
      {person === null && roomCode.length === ROOM_CODE_LENGTH && <PickYourName roomCode={roomCode} people={expected} onSignedIn={onPicked} />}
      {/* The arcade: minigames with friends, no host or game needed. */}
      <p className="join-links"><a href="/?arcade">Arcade: play minigames with friends</a></p>
      {/* Everything else stays folded away, so joining is just the code, a name and one button. */}
      <details className="join-more">
        <summary>More options</summary>
        {person === null && <KeySignIn onSignIn={onSignIn} />}
        <p className="join-links">{t('join.reclaim')} <button type="button" className="link-button" onClick={onReclaim}>{t('join.reclaimButton')}</button></p>
        {/* Only for a browser that signed in as the owner before: players never see it, and nothing asks the server. */}
        {ownerBrowser && <p className="join-links"><a href="/?host=1">Host a game instead</a></p>}
        {/* A person with editor rights (the server says so in /api/people/me). */}
        {!ownerBrowser && person?.canEdit && <p className="join-links"><a href="/?host=1#my-games">Edit games</a></p>}
      </details>
    </section>
  </main>;
}

export function RoomScreen() {
  const [sessionId, setSessionId] = useState(initial.searchParams.get('room') ?? undefined);
  const [roomCode, setRoomCode] = useState(cleanRoomCode(initial.searchParams.get('code') ?? '')); const [name, setName] = useState('');
  const [error, setError] = useState(''); const [closedMessage, setClosedMessage] = useState(''); const [busy, setBusy] = useState(Boolean(access)); const [ready, setReady] = useState(!access);
  const [draft, setDraft] = useState(emptyDraft(null)); const [editingLook, setEditingLook] = useState(false); const [displayUrl, setDisplayUrl] = useState(''); const [timerSeconds, setTimerSeconds] = useState('30'); const [reclaiming, setReclaiming] = useState(false);
  const room = useRoom(ready ? sessionId : undefined, initial.searchParams.get('display') === '1'); const state = room.snapshot;
  const account = useMe();
  // An arcade round: keeps this phone in its lobby and goes back there when the round ends.
  useArcadeRound(state);
  useEffect(() => {
    if (!access || !sessionId) return; let mounted = true;
    void roomApi(`/api/rooms/${sessionId}/claim`, { token: access }).then(() => { if (mounted) setReady(true); }).catch(() => { if (mounted) setError('Host/display access could not be verified. Open a fresh access link.'); }).finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [sessionId]);
  // Each stage starts from its own blank answer (and its own item order).
  useEffect(() => { setDraft(emptyDraft(state?.view.stage?.input)); }, [state?.view.stage?.id]);
  // Back to the lobby: this room has ended and the game goes on in a fresh one. Phones and the shared screen
  // move over by themselves; a host tab enters it with the owner key.
  const moveTo = (next: string) => { const url = new URL(location.href); url.searchParams.set('room', next); url.hash = ''; history.replaceState(null, '', url); setSessionId(next); };
  // Only the snapshot of the room this screen is in counts (never a stale one from before a move).
  const nextRoom = state && state.view.sessionId === sessionId ? state.nextRoom : null; const myRole = state?.role;
  useEffect(() => {
    if (!nextRoom || !sessionId || !myRole) return; let mounted = true;
    const follow = myRole === 'host' ? roomApi(`/api/host/rooms/${nextRoom}/enter`, {}).then(() => nextRoom)
      : roomApi<{ sessionId: string }>(`/api/rooms/${sessionId}/follow`, { display: myRole === 'display' }).then(result => result.sessionId);
    void follow.then(next => { if (mounted) moveTo(next); }).catch(() => { if (mounted) setError('The game moved to a new lobby. Ask the host for the new room code.'); });
    return () => { mounted = false; };
  }, [nextRoom, sessionId, myRole]);
  // The host panel's one open sheet (settings, invite, players, back to lobby), or none.
  const [sheet, setSheet] = useState<'settings' | 'invite' | 'players' | 'lobby' | null>(null);
  const backToLobby = () => {
    if (!sessionId) return; setSheet(null);
    void roomApi<{ sessionId: string }>(`/api/host/rooms/${sessionId}/restart`, { sessionId: newId(), commandId: newId() }).then(result => moveTo(result.sessionId))
      .catch(() => setError('Could not go back to the lobby. Try again.'));
  };
  // People in the room: make an account while joining (when allowed), then the new personal code is shown once before going in.
  const [makeAccount, setMakeAccount] = useState(false); const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const join = async (displayName?: string) => {
    setBusy(true); setError('');
    try {
      if (makeAccount && !account.person && !displayName) {
        const made = await roomApi<{ name: string; key: string }>('/api/rooms/signup', { roomCode, name });
        await account.refresh(); setMakeAccount(false); setNewKey(made); return;
      }
      // Each test bench phone (seat) joins as its own player.
      const key = `party_join_${roomCode.trim().toUpperCase()}${testSeat ? `_seat${testSeat}` : ''}`; let joinId: string | null = null;
      try { joinId = localStorage.getItem(key); } catch { /* Online join can still work. */ }
      if (!joinId) { joinId = newId(); try { localStorage.setItem(key, joinId); } catch { /* optional recovery */ } }
      const look = savedLook();
      // A person joins under their own name (the server decides), with the look they had last time unless this phone has its own.
      const result = await roomApi<{ sessionId: string }>('/api/rooms/join', { roomCode, displayName: displayName ?? account.person?.name ?? name, joinId, ...(look ? { look } : {}) });
      history.replaceState(null, '', `/?room=${result.sessionId}`); setReady(true); setSessionId(result.sessionId); setNewKey(null);
    } catch (cause) { setError(cause instanceof Error && cause.message === 'ROOM_NOT_AVAILABLE' ? look.text('join.notFound') : cause instanceof Error && cause.message === 'NAME_TAKEN' ? 'Someone already has that name. Pick another, or tap your name under “Played with us before?”.' : cause instanceof Error ? cause.message : 'Joining failed. Please retry.'); } finally { setBusy(false); }
  };
  // A test bench phone joins by itself under the name it was opened with (Player 1, Player 2…).
  const autoJoined = useRef(false);
  useEffect(() => {
    const preset = initial.searchParams.get('name')?.trim().slice(0, 40);
    if (!testSeat || !preset || sessionId || autoJoined.current || roomCode.length !== ROOM_CODE_LENGTH) return;
    autoJoined.current = true; setName(preset); void join(preset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, sessionId]);
  const command = (type: string, extra: Record<string, unknown> = {}) => {
    if (!state) return; const base = { formatVersion: 1, commandId: newId(), sessionId: state.view.sessionId, type };
    room.send(GameCommandSchema.parse({ ...base, ...((PLAYER_COMMANDS as readonly string[]).includes(type) ? {} : { expectedRevision: state.view.revision }), ...extra }));
  };
  const stage = state?.view.stage; const disabled = room.saving || Boolean(room.pending) || room.connection !== 'Connected';
  const remaining = useRemaining(stage, room.clockOffset); const timeUp = remaining === 0 && stage?.pausedRemainingMs === null;
  // Time is up with an answer chosen or typed but not sent (a choice, text, an order, an upload, a route vote): send it
  // anyway; the server still takes it during its short grace period. Drawings do the same in DrawingAnswer.
  useEffect(() => {
    if (!timeUp || state?.role !== 'player' || !stage?.input || stage.status !== 'ACTIVE' || state.view.ownSubmission || stage.input.kind === 'drawing') return;
    if (stage.route && !stage.route.canVote) return;
    if (stage.teams) { const mine = ownTeam(stage.teams); if (stage.teams.forming || !mine || (captainAnswers(stage.teams) && mine.captainId !== state.selfPlayerId)) return; }
    const value = draftValue(stage.input, draft);
    if (value) command('submission.submit', { stageRunId: stage.id, value });
  }, [timeUp]);
  // The game's look: from the room once joined, or (on the join screen) the look of the room whose code was entered.
  const [joinLook, setJoinLook] = useState<{ title: string; presentation: LookInput; signup?: boolean; expected?: { id: string; name: string }[] } | null>(null);
  useEffect(() => {
    if (sessionId) return; const code = roomCode.trim().toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(code)) { setJoinLook(null); return; }
    let mounted = true;
    const fetchLook = () => { void roomApi(`/api/rooms/look/${code}`).then(data => { if (mounted) setJoinLook(RoomLookSchema.parse(data) as { title: string; presentation: LookInput; signup?: boolean; expected?: { id: string; name: string }[] }); }).catch(() => { if (mounted) setJoinLook(null); }); };
    // Looked at again now and then: the host may add people (or allow accounts) while someone waits on this screen.
    fetchLook(); const again = setInterval(fetchLook, 10_000);
    return () => { mounted = false; clearInterval(again); };
  }, [roomCode, sessionId]);
  const look = useBuiltLook(state?.view.presentation ?? joinLook?.presentation); const t = look.text;
  const lookStyle = themeStyle(look.theme); const lookClass = themeClass(look.theme);
  // Animation moments.
  const stageRef = useRef<HTMLElement>(null); const answersRef = useRef<HTMLDivElement>(null); const savedRef = useRef<HTMLParagraphElement>(null);
  const timerRef = useRef<HTMLDivElement>(null); const resultsRef = useRef<HTMLDivElement>(null); const scoresRef = useRef<HTMLDivElement>(null); const playersRef = useRef<HTMLUListElement>(null);
  useMoment(stageRef, stage?.kind === 'info' ? 'cutscene' : 'sceneEnter', stage?.id, {}, look);
  useMoment(answersRef, 'answersEnter', stage?.status === 'ACTIVE' && stage.input ? stage.id : null, { staggerChildren: true }, look);
  useMoment(savedRef, 'answerSaved', state?.view.ownSubmission?.id, {}, look);
  useMoment(timerRef, 'timerEnding', remaining !== null && remaining > 0 && remaining <= 5000 && stage?.pausedRemainingMs === null ? `${stage?.id}:ending` : null, {}, look);
  useMoment(resultsRef, 'reveal', stage?.revealed ? stage.id : null, { staggerChildren: true }, look);
  useMoment(scoresRef, 'scoreboard', stage?.scoreboard ? stage.id : state?.view.status === 'FINISHED' ? 'finished' : null, { staggerChildren: true }, look);
  useMoment(playersRef, 'lobbyJoin', state?.view.status === 'LOBBY' && state.players.length ? state.players.length : null, {}, look);

  if (!sessionId && reclaiming) return <main className={`room room-join ${lookClass}`} style={lookStyle}><h1 className="visually-hidden">Join a game</h1><div className="join-card"><SeatReclaim roomCode={roomCode.trim().toUpperCase()} onCancel={() => setReclaiming(false)} onJoined={id => { history.replaceState(null, '', `/?room=${id}`); setReady(true); setSessionId(id); }} /></div></main>;
  if (!sessionId && newKey) return <main className={`room room-join ${lookClass}`} style={lookStyle}><h1 className="visually-hidden">Your personal code</h1><div className="join-card"><NewKeyCard name={newKey.name} personalKey={newKey.key} busy={busy} onContinue={() => { void join(newKey.name); }} />{error && <p role="alert" className="join-error">{error}</p>}</div></main>;
  if (!sessionId) return <LookContext.Provider value={look}><JoinScreen style={lookStyle} className={lookClass} title={joinLook?.title ?? null} roomCode={roomCode} setRoomCode={setRoomCode} name={name} setName={setName} busy={busy} error={error} onJoin={() => { void join(); }} onReclaim={() => { setError(''); setReclaiming(true); }}
    person={account.person} linked={account.linked} onForget={() => { void account.forget().catch(() => setError('Could not sign this phone out. Try again.')); }} onSignIn={account.signIn}
    signup={Boolean(joinLook?.signup)} makeAccount={makeAccount} setMakeAccount={setMakeAccount} expected={joinLook?.expected ?? []} onPicked={picked => { void account.refresh().then(() => join(picked)); }} /></LookContext.Provider>;

  const sorted = [...room.samples].sort((a, b) => a - b); const p95 = sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)];
  const seconds = Number(timerSeconds); const validSeconds = Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600;
  // In a team round: nobody answers while teams are being made, players outside a team sit out, and a captain may answer for the team.
  const myTeam = stage ? ownTeam(stage.teams) : undefined;
  // Only while the vote is actually open: a paused room makes nobody a late joiner.
  const routeBlock = stage?.route && !stage.route.canVote && !state?.view.ownSubmission && stage.status === 'ACTIVE' && state?.view.status === 'RUNNING'
    ? stage.route.method === 'host' ? t('wait.hostRoute') : stage.teams && !stage.teams.forming && myTeam && captainAnswers(stage.teams) ? null : t('wait.lateVoter') : null;
  const answerBlock = routeBlock ?? (!stage?.teams ? null : stage.teams.forming ? t('wait.forming')
    : !myTeam ? t('wait.sitOut') : captainAnswers(stage.teams) && myTeam.captainId !== state?.selfPlayerId ? t('wait.captain', { captain: state?.players.find(player => player.id === myTeam.captainId)?.displayName ?? '', team: myTeam.name }) : null);
  // Scenes that ask nothing: info, scoreboard, and a Pick teams scene once its teams are confirmed.
  const showOnly = stage?.kind === 'info' || stage?.kind === 'scoreboard' || (stage?.kind === 'teams' && !stage.teams?.forming);
  const timer = (change: Record<string, unknown>) => { if (stage) command('stage.timer', { stageRunId: stage.id, change }); };
  const role = state?.role ?? (initial.searchParams.get('display') === '1' ? 'display' : 'player');
  const host = role === 'host'; const running = state?.view.status === 'RUNNING';
  const connected = room.connection === 'Connected';
  const me = state?.players.find(player => player.id === state.selfPlayerId);
  const minigameLive = { go: room.go, progress: room.progress, sendTaps: room.sendTaps, strokes: room.liveStrokes, sendStroke: room.sendStroke };
  const saved = t((stage?.kind === 'vote' || stage?.kind === 'route' ? (captainAnswers(stage?.teams ?? null) ? 'vote.savedTeam' : 'vote.saved') : captainAnswers(stage?.teams ?? null) ? 'answer.savedTeam' : 'answer.saved') as TextKey);

  // The one big button the host needs right now, plus the less frequent ones.
  const primary = !state ? null : state.view.status === 'LOBBY' ? { label: t('host.start'), run: () => command('session.start') }
    : state.view.status === 'PAUSED' ? { label: t('host.resume'), run: () => command('session.resume') }
    // While teams are picked, confirming them is the host's next step (possible once anyone is in a team).
    : running && stage?.status === 'ACTIVE' && stage.teams?.forming ? { label: t('host.startTeams'), run: () => command('teams.confirm', { stageRunId: stage.id }), blocked: stage.teams.teams.every(team => team.memberIds.length === 0) }
    // A scene that explains itself first: the host starts it once everyone has read it.
    : running && stage?.status === 'ACTIVE' && stage.explain ? { label: t('explain.start'), run: () => command('stage.explained', { stageRunId: stage.id }) }
    : running && stage?.status === 'ACTIVE' && !stage.teams?.forming && !showOnly && !(stage.kind === 'duel' && !stage.duel?.duelistIds) ? { label: t('host.close'), run: () => command('stage.close', { stageRunId: stage.id }) }
    : running && stage?.status === 'CLOSED' && !stage.revealed && !showOnly && !stage.revealAfterVote && stage.kind !== 'duel' && (stage.kind !== 'route' || stage.route?.decision) ? { label: stage.kind === 'route' ? t('host.announce') : t('host.reveal'), run: () => command('stage.reveal', { stageRunId: stage.id }) }
    : running && stage && (stage.status === 'CLOSED' || (stage.status === 'ACTIVE' && showOnly)) && (stage.kind !== 'route' || stage.route?.decision) && (stage.kind !== 'duel' || stage.duel?.winnerId) ? { label: t('host.next'), run: () => command('stage.advance', { stageRunId: stage.id }) }
    : null;
  // What is happening now, in a word or two, above the round.
  const forming = Boolean(stage?.teams?.forming);
  // Teams are made first; then the explanation; then the round itself.
  const explaining = !forming && Boolean(stage?.explain);
  const phase = !stage || showOnly ? null : state?.view.status === 'PAUSED' ? t('phase.paused') : forming ? t('phase.teams') : explaining ? t('explain.title')
    : stage.revealed ? t('phase.results') : stage.kind === 'duel' ? (stage.status === 'CLOSED' ? t('phase.duelOn') : t('phase.duel')) : stage.status === 'CLOSED' ? t('phase.locked')
    : stage.kind === 'challenge' ? t('phase.challenge') : stage.kind === 'minigame' ? t('phase.minigame') : stage.kind === 'route' ? t('phase.route') : stage.kind === 'vote' ? t('phase.vote')
    : stage.eligibleCount > 0 && stage.submittedCount >= stage.eligibleCount ? t('phase.allIn') : t('phase.answer');
  // Scores: the host always; phones and the shared screen when the host allows it, and always at a scoreboard scene and the end.
  const scoreMoment = state?.view.status === 'FINISHED' || (stage?.kind === 'scoreboard' && stage.status === 'ACTIVE');
  const canSeeScores = Boolean(state && (host || state.settings.showScores || scoreMoment));
  const ownPoints = role === 'player' && stage?.revealed && state ? stage.reveal?.awards.find(award => award.playerId === state.selfPlayerId)?.amountMilli ?? null : null;
  const nextAlso = running && stage && stage.status === 'CLOSED' && primary?.label !== t('host.next') && (stage.kind !== 'route' || stage.route?.decision);

  return <LookContext.Provider value={look}><RoomSessionContext.Provider value={sessionId ?? null}><main className={`room room-${role}${state?.view.status === 'LOBBY' ? ' in-lobby' : ''} ${lookClass}`} style={lookStyle}>
    <header className="room-bar">
      <h1 className="visually-hidden">{state ? `${state.view.title}: ${role === 'host' ? 'host screen' : role === 'display' ? 'shared screen' : 'your phone'}` : 'Party game room'}</h1>
      <div className="room-id"><p className="brand">party<span>.</span></p>
        <div><p className="room-game">{state?.view.title ?? 'Connecting…'}{state ? ` · ${t(state.view.status === 'LOBBY' ? 'status.waiting' : state.view.status === 'PAUSED' ? 'status.paused' : state.view.status === 'FINISHED' ? 'status.finished' : 'status.playing')}` : ''}</p>
          {state && <h2 id="room-heading" className="room-code">Room {state.roomCode}</h2>}</div></div>
      <ConnectionMenu status={room.connection} ok={connected} slow={slowConnection(room.samples)} busy={busy} saving={room.saving} onReconnect={room.reconnect} details={<details className="conn-details"><summary>Details</summary>
        <dl className="metrics"><div><dt>Latest round trip</dt><dd>{room.samples.length ? `${Math.round(room.samples.at(-1)!)} ms` : 'Measuring…'}</dd></div>
          <div><dt>p95 · last {room.samples.length} samples</dt><dd>{p95 === undefined ? 'Measuring…' : `${Math.round(p95)} ms`}</dd></div><div><dt>Reconnects</dt><dd>{room.reconnects}</dd></div><div><dt>Last saved action</dt><dd>{room.confirmMs === null ? '—' : `${room.confirmMs} ms`}</dd></div></dl>
        <p>Round trip includes the connection and the server’s access check.</p></details>} />
    </header>
    {stage && state && <RoundBar state={state} stage={stage} phase={phase} remaining={remaining} timerRef={timerRef} tools={state.arcade?.leader && role === 'player' && state.view.status !== 'FINISHED' ? <ArcadeLeaderMenu state={state} disabled={disabled} /> : undefined} />}
    {/* Messages float over the page instead of pushing it down. An action still being sent only shows the spinner above;
        the retry choice appears once it is really stuck (sending stopped without a confirmation). */}
    <div className="room-toasts">
      {error && <p role="alert" className="error room-toast">{error}</p>}
      {room.message && room.message !== closedMessage && <div className="room-toast"><p role="status" aria-label="Action status">{room.message}</p>
        <button type="button" className="toast-close" aria-label="Close message" onClick={() => setClosedMessage(room.message)}>×</button></div>}
      {room.pending && !room.saving && <div className="room-toast pending" role="region" aria-label="Unconfirmed action"><p role="status">Your last action is not confirmed yet.</p>
        <div className="actions"><button onClick={room.retry}>Check / retry original action</button><button className="ghost" onClick={room.discard}>Discard pending action</button></div></div>}
    </div>

    {state && <div className="room-grid">
      <div className="room-main">
        {state.arcade && role === 'player' && <ArcadeLeaderNext state={state} disabled={disabled} />}
        {state.view.status === 'LOBBY' && !state.arcade && <section className="lobby" aria-labelledby="lobby-heading">
          {role === 'player' ? <><h2 id="lobby-heading">{t('lobby.playerTitle')}</h2><p>{t('lobby.playerText')}</p>
            {me && <div className="my-look"><Avatar look={me.look} size={96} /><button className="ghost" onClick={() => setEditingLook(true)}>{t('players.changeLook')}</button></div>}</>
            : <>{/* Like a party game's lobby: how to join across the top, then a stage of seats that fill up as people join. */}
              {/* On the test bench the phones are added with its + and the room code is in its bar: no join strip there. */}
              {!onBench && <div className="lobby-band">
                <div className="lobby-band-text"><div className="lobby-band-head"><h2 id="lobby-heading">{t('lobby.screenTitle')}</h2>
                    {role !== 'display' && <CopyIcon text={publicJoinUrl(location.origin, state.roomCode)} label="Copy join link" icon="link" />}</div>
                  <p className="lobby-go">{t('lobby.screenGo', { host: location.host })}</p><BigCode roomCode={state.roomCode} copy={role !== 'display'} /></div>
                <JoinQr origin={location.origin} roomCode={state.roomCode} link={false} />
              </div>}
              <div className="lobby-stage">
                <p className="lobby-count" aria-label={`${state.players.length} ${state.players.length === 1 ? 'player' : 'players'} joined`}><FaIcon name="users" /> {state.players.length}</p>
                <ul ref={playersRef} className="lobby-seats" aria-label="Players who joined">
                  {state.players.map(player => <li key={player.id} className="seat taken"><Avatar look={player.look} size={88} /><span>{player.displayName}</span></li>)}
                  {Array.from({ length: emptySeats(state.players.length) }, (_, index) => <li key={`empty-${index}`} className="seat empty" aria-hidden="true"><span className="seat-ring"><FaIcon name="user-plus" /></span></li>)}
                </ul>
              </div></>}
        </section>}
        {stage && <section ref={stageRef} className={`stage-card kind-${stage.kind}`} aria-labelledby="stage-heading">
          {stage.info && <p className="stage-banner">{stage.info.title}</p>}
          {/* While teams are picked, the round's question waits: one thing at a time. */}
          <h2 id="stage-heading" className={stage.info ? 'visually-hidden' : undefined}>{forming ? t('phase.teams') : stage.info?.title ?? (stage.scoreboard ? 'Scoreboard' : stage.prompt)}</h2>
          {stage.info && <p className="info-text">{stage.prompt}</p>}
          {forming && role === 'player' && <p className="wait-note">{t('wait.forming')}</p>}
          <TeamForming state={state} stage={stage} disabled={disabled} send={command} />
          <TeamSummary state={state} stage={stage} />
          {explaining && <ExplainPanel state={state} stage={stage} disabled={disabled} send={command} />}
          {!forming && !explaining && <><div ref={answersRef} className="answers-slot">{role !== 'player' && stage.input && stage.input.kind !== 'text' && stage.input.kind !== 'media' && !stage.revealed && <OptionsBoard input={stage.input} route={stage.kind === 'route'} />}
          {stage.kind === 'vote' && !stage.revealed && <VoteBallot state={state} stage={stage} disabled={disabled || timeUp} canVote={role === 'player' && !answerBlock && !state.view.ownSubmission && stage.status === 'ACTIVE' && running}
            onVote={submissionId => command('submission.submit', { stageRunId: stage.id, value: { kind: 'vote', submissionId } })} />}
          {stage.kind !== 'challenge' && stage.kind !== 'route' && stage.kind !== 'duel' && !showOnly && !stage.revealed && <p className="progress-line">{t(stage.kind === 'vote' ? 'progress.voted' : 'progress.answered', { count: stage.submittedCount, total: stage.eligibleCount })}{stage.status === 'CLOSED' ? ` · ${t('progress.locked')}` : ''}</p>}
          {host && stage.kind === 'challenge' && stage.status === 'CLOSED' && !stage.revealed && running && <JudgePanel state={state} stage={stage} disabled={disabled} send={command} />}
          {stage.kind === 'minigame' && <MinigameStage state={state} stage={stage} offset={room.clockOffset} disabled={disabled}
            canPlay={role === 'player' && !answerBlock && stage.status === 'ACTIVE' && running}
            onResult={result => command('submission.submit', { stageRunId: stage.id, value: { kind: 'minigame', ...result } })}
            live={minigameLive} onPart={(turn, assetId) => command('minigame.part', { stageRunId: stage.id, turn, assetId })}
            onMove={(step, option, decide) => command('minigame.move', { stageRunId: stage.id, step, option, ...(decide ? { decide: true } : {}) })} />}
          <RouteChoice state={state} stage={stage} disabled={disabled} send={command} />
          <DuelPanel state={state} stage={stage} disabled={disabled} send={command} />
          {stage.kind !== 'route' && <div ref={resultsRef}><StageResults state={state} stage={stage} /></div>}
          {stage.status === 'CLOSED' && !stage.revealed && stage.revealAfterVote && <p>These answers are shown without names in the vote that comes next.</p>}
          {stage.kind === 'minigame' ? (role === 'player' && answerBlock && stage.status === 'ACTIVE' ? <p className="wait-note">{answerBlock}</p> : null)
            : role === 'player' && state.view.ownSubmission ? <p ref={savedRef} role="status" className="answer-in">{saved}</p>
            : role === 'player' && answerBlock && stage.status === 'ACTIVE' ? <p className="wait-note">{answerBlock}</p>
            : role === 'player' && stage.input?.kind === 'drawing' && stage.status === 'ACTIVE' && running ? <DrawingAnswer sessionId={state.view.sessionId} stageRunId={stage.id} input={stage.input} disabled={disabled} timeUp={timeUp}
              onSubmit={assetId => command('submission.submit', { stageRunId: stage.id, value: { kind: 'drawing', assetId } })} />
            : role === 'player' && stage.input && stage.status === 'ACTIVE' && running ? <form className="answer-form" onSubmit={event => {
              event.preventDefault(); const value = stage.input && draftValue(stage.input, draft); if (value) command('submission.submit', { stageRunId: stage.id, value });
            }}>
              <AnswerInput sessionId={state.view.sessionId} input={stage.input} draft={draft} onChange={setDraft} legend={stage.kind === 'route' ? t('vote.legend') : t('answer.legend')} route={stage.kind === 'route'} />
              <button className="primary" disabled={disabled || !draftValue(stage.input, draft) || timeUp}>{timeUp ? t('timer.up') : stage.kind === 'route' ? t('vote.submit') : t('answer.submit')}</button></form>
            : role === 'player' ? <p className="wait-note">{stage.kind === 'challenge' ? t('wait.challenge') : stage.kind === 'vote' || showOnly ? '' : t('wait.screen')}</p> : null}</div></>}
        </section>}
        {role !== 'display' && <WheelBadge wheel={state.view.wheel} />}
        {state.view.status === 'FINISHED' && <FinaleShow state={state} />}
        {/* Phones keep the scores one tap away (the dock). The shared screen shows them with the results of a round, at scoreboard scenes and at the end: nothing it does not need. */}
        {scoreMoment && canSeeScores && <div ref={scoresRef}><Scoreboard state={state} disabled={disabled} send={command} /></div>}
      </div>

      {host && <aside className="room-controls" aria-label="Host controls">
        {primary && <button className="primary big" disabled={disabled || ('blocked' in primary && primary.blocked)} onClick={primary.run}>{primary.label}</button>}
        {nextAlso && <button disabled={disabled} onClick={() => command('stage.advance', { stageRunId: stage!.id })}>{t('host.next')}</button>}
        {running && stage && state.view.wheel.canSpin && <button disabled={disabled} onClick={() => command('wheel.spin', { stageRunId: stage.id })}>{state.view.wheel.spin ? t('wheel.again') : t('wheel.spin')}</button>}
        {/* The round's tools in one row of icons (names on hover and for screen readers). */}
        <div className="host-toolbar" role="toolbar" aria-label="Round tools">
          {running && <button type="button" className="icon-tool" aria-label={t('host.pause')} title={t('host.pause')} disabled={disabled} onClick={() => command('session.pause')}><FaIcon name="pause" /></button>}
          {running && <button type="button" className="icon-tool" aria-label={t('break.vote')} title={t('break.vote')} disabled={disabled} onClick={() => { void roomApi(`/api/rooms/${sessionId}/break`, {}).catch(() => setError('The break could not be started.')); }}><FaIcon name="smoking" /></button>}
          {stage && stage.status === 'ACTIVE' && !stage.teams?.forming && <>
            {remaining !== null && <button type="button" className="icon-tool text" title={`Add ${state.settings.quickTimeSeconds} seconds`} disabled={disabled} onClick={() => timer({ kind: 'add', ms: state.settings.quickTimeSeconds * 1000 })}>+{quickTime(state.settings.quickTimeSeconds)}<span className="visually-hidden"> (add {state.settings.quickTimeSeconds} seconds)</span></button>}
            <Popover label="Set the time" icon="stopwatch" className="icon-tool">
              {remaining !== null && <div className="actions"><button type="button" className="ghost small-button" disabled={disabled} onClick={() => timer({ kind: 'add', ms: 60_000 })}>+1 min</button>
                <button type="button" className="ghost small-button" disabled={disabled} onClick={() => timer({ kind: 'clear' })}><FaIcon name="infinity" /> Remove time limit</button></div>}
              <form className="inline-form time-set" onSubmit={event => { event.preventDefault(); if (validSeconds) timer({ kind: 'set', ms: seconds * 1000 }); }}>
                <label>Time left (seconds)<input type="number" inputMode="numeric" min={1} max={3600} step={1} value={timerSeconds} onChange={event => setTimerSeconds(event.target.value)} /></label>
                <button className="ghost small-button" disabled={disabled || !validSeconds}>Set time</button></form>
            </Popover></>}
          {running && stage?.status === 'CLOSED' && !stage.revealed && !showOnly && !stage.route?.decision && stage.route?.method !== 'host' && <Popover label="Reopen answers" icon="arrow-rotate-left" className="icon-tool">
            <button className="ghost" disabled={disabled} onClick={() => command('stage.reopen', { stageRunId: stage.id, durationMs: 30_000 })}>Reopen for 30 seconds</button>
            <button className="ghost" disabled={disabled} onClick={() => command('stage.reopen', { stageRunId: stage.id, durationMs: null })}>Reopen without time limit</button></Popover>}
        </div>
        <SeatRequests state={state} sessionId={state.view.sessionId} onError={setError} />
        <NameRequests state={state} sessionId={state.view.sessionId} onError={setError} />
        {/* Everything less frequent behind four icons; one sheet at a time, under the icons. */}
        <div className="host-tabs" role="group" aria-label="More">
          {([['settings', 'gear', 'Room settings'], ['invite', 'tv', 'Shared screen & invite'], ['players', 'users', `Players (${state.players.length})`], ['lobby', 'arrow-rotate-left', 'Back to lobby']] as const).map(([key, icon, label]) =>
            (state.view.status !== 'LOBBY' || (key !== 'lobby' && key !== 'players')) && <button key={key} type="button" className="icon-tool" aria-label={key === 'players' ? undefined : label} title={label} aria-expanded={sheet === key} onClick={() => setSheet(sheet === key ? null : key)}><FaIcon name={icon} />{key === 'players' && <><span className="visually-hidden">Players </span><span className="tool-count">{state.players.length}</span></>}</button>)}
        </div>
        {sheet === 'settings' && <HostDialog title="Room settings" icon="gear" onClose={() => setSheet(null)}><div className="settings-layout">
          <div className="settings-col"><h3>Phones while waiting</h3><SideGamesSwitch state={state} sessionId={state.view.sessionId} onError={setError} />
            <h3>Joining</h3><SeatApprovalSetting state={state} sessionId={state.view.sessionId} onError={setError} /><SignupSetting state={state} sessionId={state.view.sessionId} onError={setError} /><TestBenchSetting state={state} sessionId={state.view.sessionId} onError={setError} />
            <p className="control-back"><a href="/?host=1">Back to the host menu</a></p></div>
          <RoomSettings state={state} sessionId={state.view.sessionId} onError={setError} /></div></HostDialog>}
        {sheet === 'invite' && <HostDialog title="Shared screen & invite" icon="tv" size="compact" onClose={() => setSheet(null)}>
          <div className="invite-join"><JoinQr origin={location.origin} roomCode={state.roomCode} link={false} />
            <div className="invite-code"><h3>Invite players</h3><BigCode roomCode={state.roomCode} copy /><JoinLink url={publicJoinUrl(location.origin, state.roomCode)} copy /></div></div>
          {/* Testing alone: the host screen with phones next to it, each its own player (virtual phones; real ones can join too). */}
          <div className="invite-display"><FaIcon name="users" /><p><strong>Test with phones</strong> The host screen with virtual phones next to it, each its own player; real phones can join too.</p>
            <a className="invite-bench" href={`/?bench=${sessionId}`} target="_blank" rel="noreferrer">Open test bench ↗</a></div>
          <div className="invite-display"><FaIcon name="tv" /><p><strong>Shared screen</strong> Questions and scores on a TV or second screen.</p>
            {displayUrl ? <span className="invite-display-open"><a href={displayUrl} target="_blank" rel="noreferrer">Open shared display</a><CopyIcon text={displayUrl} label="Copy display link" icon="link" /></span>
              : <button className="ghost" onClick={() => { void roomApi<{ token: string }>(`/api/rooms/${sessionId}/display`, {}).then(result => setDisplayUrl(`${location.origin}/?room=${sessionId}&display=1#access=${result.token}`)).catch(() => setError('Display access could not be created.')); }}>Create display link</button>}</div>
        </HostDialog>}
        {state.view.status === 'LOBBY' && <section className="host-sheet players" aria-labelledby="players-heading"><h2 id="players-heading">{t('players.title', { count: state.players.length })}</h2>

          <ul>{state.players.map(player => <li key={player.id} className={player.connected ? 'online' : 'offline'}><span className="dot" aria-hidden="true" /><Avatar look={player.look} size={28} />{player.displayName}{player.id === state.selfPlayerId ? ' (you)' : ''}<span className="visually-hidden"> · </span><span className="player-state">{player.connected ? 'connected' : 'disconnected'}</span>
            {player.look.picture && <button className="small-button ghost" aria-label={`Remove the picture of ${player.displayName}`} onClick={() => command('player.removePicture', { playerId: player.id })}>Remove picture</button>}
            <button className="icon-button player-revoke" aria-label={`Revoke access for ${player.displayName}`} title={`Kick ${player.displayName} out`} onClick={() => { void roomApi(`/api/rooms/${sessionId}/revoke`, { playerId: player.id }).catch(() => setError('Could not revoke access.')); }}><FaIcon name="boot" /></button></li>)}</ul>
          <ExpectedPeople state={state} sessionId={state.view.sessionId} onError={setError} /></section>}
        {sheet === 'players' && state.view.status !== 'LOBBY' && <HostDialog title={t('players.title', { count: state.players.length })} icon="users" onClose={() => setSheet(null)}><section className="host-sheet players in-dialog" aria-label="Players">
          {me && <button className="small-button ghost change-look" onClick={() => setEditingLook(true)}>{t('players.changeLook')}</button>}
          <ul ref={playersRef}>{state.players.map(player => <li key={player.id} className={player.connected ? 'online' : 'offline'}><span className="dot" aria-hidden="true" /><Avatar look={player.look} size={28} />{player.displayName}{player.id === state.selfPlayerId ? ' (you)' : ''}<span className="visually-hidden"> · </span><span className="player-state">{player.connected ? 'connected' : 'disconnected'}</span>
            {player.look.picture && <button className="small-button ghost" aria-label={`Remove the picture of ${player.displayName}`} onClick={() => command('player.removePicture', { playerId: player.id })}>Remove picture</button>}
            <button className="icon-button player-revoke" aria-label={`Revoke access for ${player.displayName}`} title={`Kick ${player.displayName} out`} onClick={() => { void roomApi(`/api/rooms/${sessionId}/revoke`, { playerId: player.id }).catch(() => setError('Could not revoke access.')); }}><FaIcon name="boot" /></button></li>)}</ul>
          <ExpectedPeople state={state} sessionId={state.view.sessionId} onError={setError} /></section></HostDialog>}
        {sheet === 'lobby' && <div className="host-sheet reset-confirm" role="group" aria-label="Back to lobby">
          <p>Start the game again in a new lobby? Everyone comes along (the room gets a new code); the scores of this game stay in its history.</p>
          <div className="actions"><button className="danger" onClick={backToLobby}>Yes, back to lobby</button><button className="ghost" onClick={() => setSheet(null)}>Cancel</button></div></div>}
        {/* The scores, small and foldable, at the bottom of the panel (big only at a scoreboard scene and the end). */}
        {!scoreMoment && state.view.status !== 'LOBBY' && <FloatingScores docked leader={leaderLine(state)}><Scoreboard state={state} disabled={disabled} send={command} compact /></FloatingScores>}
      </aside>}
    </div>}
    {state && me && editingLook && <div className="look-sheet" role="dialog" aria-modal="true" aria-labelledby="look-builder-heading" onKeyDown={event => { if (event.key === 'Escape') setEditingLook(false); }}><LookBuilder initial={me.look} name={me.displayName} busy={disabled} sessionId={state.view.sessionId}
      onCancel={() => setEditingLook(false)} onSave={next => { rememberLook(next); command('player.look', { look: next }); setEditingLook(false); }}
      // Unless the host wants players to confirm, every choice is used at once, and the game starting finishes the look.
      confirm={state.settings.confirmLooks} onApply={next => { rememberLook(next); command('player.look', { look: next }); }} finishSignal={state.view.status === 'LOBBY' ? 0 : 1} /></div>}
    {state && <WheelOverlay wheel={state.view.wheel} offset={room.clockOffset} />}
    {state && role === 'display' && <WheelBadge wheel={state.view.wheel} />}
    {state && <BreakOverlay state={state} host={host} disabled={disabled} onContinue={() => command('session.resume')} />}
    {state && role === 'player' && <PhoneDock state={state} challengeTick={room.challengeTick} canSeeScores={canSeeScores} onChangeLook={() => setEditingLook(true)} onReact={room.sendReaction}
      onBreak={vote => { void roomApi(`/api/rooms/${sessionId}/break`, { vote }).catch(() => setError('Your vote did not go through. Try again.')); }}
      scores={<Scoreboard state={state} disabled={disabled} send={command} />} />}
    {state && role === 'player' && <PointsCelebration roundId={stage?.revealed ? stage.id : null} points={ownPoints ? Number(ownPoints) / 1000 : null} label={ownPoints ? formatPoints(ownPoints) : ''} />}
    {state && role === 'display' && canSeeScores && !scoreMoment && state.view.status !== 'LOBBY' && stage?.revealed && <FloatingScores leader={leaderLine(state)}><Scoreboard state={state} disabled={disabled} send={command} compact /></FloatingScores>}
    {state && role !== 'player' && state.settings.reactions && <ReactionsOverlay state={state} store={room.reactions} />}
  </main></RoomSessionContext.Provider></LookContext.Provider>;
}

type StageInput = NonNullable<NonNullable<ReturnType<typeof useRoom>['snapshot']>['view']['stage']>['input'];
/** The answers as the shared screen and host see them: the same colours as the phone tiles, not clickable. */
function OptionsBoard({ input, route = false }: { input: NonNullable<StageInput>; route?: boolean }) {
  const { theme } = useLook();
  const entries = input.kind === 'choice' ? input.options : input.kind === 'order' ? input.items : [];
  if (!entries.length) return null;
  return <ol className={`options-board${input.kind === 'order' ? ' order' : ''}${route ? ' route' : ''}`} style={answerFit(entries.map(entry => entry.label))} aria-label={input.kind === 'order' ? 'Items to put in order' : 'Answers'}>
    {entries.map((entry, index) => { const mark = input.kind === 'order' ? '•' : answerMark(theme, index, entries.length, route); return <li key={entry.key}>{mark !== null && <span className="answer-mark" aria-hidden="true"><Mark text={mark} /></span>}{entry.label}</li>; })}</ol>;
}

/** The host screen inside the test bench (its frame is opened with `&bench=1`). */
const onBench = initial.searchParams.get('bench') === '1' && typeof window !== 'undefined' && window.top !== window.self;
// (`&bench=real`: on the bench with real phones joining too, so the join strip stays.)

/** Slow: the last three round trips took more than 400 ms on average (the connection dot turns orange). */
const slowConnection = (samples: number[]) => { const recent = samples.slice(-3); return recent.length > 0 && recent.reduce((sum, ms) => sum + ms, 0) / recent.length > 400; };

/** Empty seats on the lobby stage, so it reads as "waiting for more": at least 8 seats, then always a few more than joined. */
const emptySeats = (joined: number) => Math.max(8 - joined, joined < 24 ? 4 - (joined % 4) : 0);

/** The quick time button's text: “30 s”, “1 min”, “1:30”. */
function quickTime(seconds: number) { return seconds < 60 ? `${seconds} s` : seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
