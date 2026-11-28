import { SlideAnswers, answerAccent } from '../presentation/slide-answers.js';
import { Countdown } from '../minigames/shared/countdown.js';
import { Loader } from '../ui/loader.js';
import { PoolAimContext } from '../head-to-head/eight-ball/live-aim.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { testSeat } from './test-seat.js';
import { isSharedPrediction, answerMark, cleanRoomCode, formatRoomCode, GameCommandSchema, GameIdSchema, PLAYER_COMMANDS, ROOM_CODE_LENGTH, RoomLookSchema, type TextKey } from '@party/contracts';
import { newId, roomApi } from './api.js';
import { useRoom } from './use-room.js';
import { isUnavailablePageError } from '../navigation.js';
import { BigCode, CopyIcon, JoinLink, JoinQr, publicJoinUrl } from './join-qr.js';
import { StageTimer, useRemaining } from './stage-timer.js';
import { ConnectionMenu, FloatingScores, HostDialog, Popover, RoundBar } from './room-chrome.js';
import { FaIcon } from '../presentation/icons.js';
import { AnswerInput, draftValue, emptyDraft } from './answer-input.js';
import { AnswerChecks } from './answer-checks.js';
import { JudgePanel, leaderLine, Scoreboard, StageResults } from './results.js';
import { VoteBallot } from './vote.js';
import { SeatApprovalSetting, SeatReclaim, SeatRequests } from './seat-reclaim.js';
import { ExpectedPeople, NameRequests, NewKeyCard, PickYourName, SignupSetting, TestBenchSetting } from './room-people.js';
import { TeamForming, TeamSummary, captainAnswers, ownTeam } from './teams.js';
import { RouteChoice } from './route-choice.js';
import { MinigameDraw } from './minigame-draw.js';
import { StageActionSlot } from './stage-action.js';
import { PLAY_TEXTS } from './play.text.js';
import { ExplainPanel } from './explain-panel.js';
import { HOSTED_POOL_TEXTS } from '../head-to-head/eight-ball/hosted.text.js';
import { DuelPanel } from './duel.js';
import { MinigameStage } from '../minigames/shared/minigame-stage.js';
import { isDefaultGraphQuestion } from '../minigames/draw-the-graph/graph-question.js';
import { GRAPH_TEXTS } from '../minigames/draw-the-graph/graph.text.js';
import { DrawingAnswer } from '../drawing/drawing-answer.js';
import { PhoneDock } from '../room-extras/phone-dock.js';
import { SoundPlayer } from '../room-extras/sound-player.js';
import { EventSounds } from '../room-extras/event-sounds.js';
import { TeamCelebrationShow } from './celebration.js';
import { ReactionsOverlay } from '../room-extras/reactions.js';
import { RoomSettings, SideGamesSwitch } from '../room-extras/room-settings.js';
import { PointsCelebration } from '../room-extras/celebrate.js';
import { BreakOverlay, FinaleShow, WheelBadge, WheelOverlay } from '../room-extras/show-extras.js';
import { formatPoints } from './results.js';
import { Avatar, RoomSessionContext } from '../players/avatar.js';
import { LookBuilder, rememberLook, savedLook } from '../players/look-builder.js';
import { useMe, type Person } from '../people/use-me.js';
import { hostMenuHref, useHostAccess } from '../owner/use-host-access.js';
import { OWNER_TEXTS } from '../owner/owner.text.js';
import { KeySignIn } from '../people/key-sign-in.js';
import { JoinOption } from './join-option.js';
import { PatchNotesButton } from '../patch-notes/patch-notes.js';
import { ArcadeLeaderMenu, ArcadeLeaderNext, useArcadeRound } from '../arcade/arcade-round.js';
import './room.css';
import { LookContext, themeClass, useThemeStyle, useBuiltLook, useLook, useMoment, useText, type LookInput } from '../presentation/look.js';
import { useSiteThemeState } from '../presentation/site-look.js';
import { LeaveRoom } from '../room-extras/leave-room.js';
import { PositionedSlideText, SceneTextBoxes, SlideTextLayer, SceneTextContent, sceneTextProps, usesSlideTypography, withoutMarks } from '../presentation/scene-text.js';
import { useScenePlaceAwards } from '../presentation/scene-place-awards.js';
import { SlideImages } from '../presentation/slide-images.js';
import { SceneComposition } from '../presentation/scene-composition.js';
import { MediaHostControls, StageMedia, StageYouTube } from './stage-media.js';
import { MusicPlayer } from './music-player.js';
import { translate, useTexts } from '../i18n/texts.js';
import { COIN_TEXTS } from '../minigames/heads-or-tails/coin.text.js';
import { useLanguage } from '../i18n/language.js';
import { localizeStage } from '../presentation/scene-translations.js';
import { LanguagePicker } from '../i18n/language-picker.js';
import { rich } from '../i18n/rich.js';
import { PHONE_TEXTS } from './phone.text.js';
import { ROOM_TEXTS } from './room.text.js';
// The room's own words in this device's language (the game's texts are `t`, the host's controls `h`).
const r = (key: keyof typeof ROOM_TEXTS.en, values?: Record<string, string | number>) => translate(ROOM_TEXTS, key, values);
import { ROUND_CONTROL_TEXTS } from './round-control.text.js';
import { ROOM_MANAGEMENT_TEXTS } from './room-management.text.js';
import { HostPlayerList } from './host-player-list.js';
import { previewEditorId } from '../navigation.js';
import { HOST_TEXTS } from './host.text.js';
import { answerFit } from './answer-fit.js';
import { Mark } from '../presentation/mark-icons.js';

const first = new URL(location.href);
// A host/display access token arrives once, in the first address; it is taken out of the address at once.
let pendingAccess = new URLSearchParams(first.hash.slice(1)).get('access');
if (pendingAccess) history.replaceState(null, '', `${first.pathname}${first.search}`);

/** Joining from a phone: room code and name, plus seat takeover and a way to host instead. */
function JoinScreen({ roomCode, setRoomCode, name, setName, busy, error, onJoin, onReclaim, style, className, title, person, linked, onForget, onSignIn, signup, makeAccount, setMakeAccount, expected, onPicked }: {
  roomCode: string; setRoomCode: (value: string) => void; name: string; setName: (value: string) => void; busy: boolean; error: string; onJoin: () => void; onReclaim: () => void;
  style: React.CSSProperties; className: string; title: string | null;
  person: Person | null | undefined; linked: { name: string | null } | null; onForget: () => void; onSignIn: (key: string) => Promise<void>;
  // People in the room: whether a guest may make an account here, and the people the host added (pick your name).
  signup: boolean; makeAccount: boolean; setMakeAccount: (value: boolean) => void; expected: { id: string; name: string }[]; onPicked: (name: string) => void;
}) {
  const t = useText();
  const access = useHostAccess({ enabled: person !== undefined, identity: person ?? null, refreshOnFocus: true });
  const [signingInOwner, setSigningInOwner] = useState(false);
  const [ownerSignInFailed, setOwnerSignInFailed] = useState(false);
  const hostHref = hostMenuHref(access?.role);
  const signInOwner = () => {
    setSigningInOwner(true);
    setOwnerSignInFailed(false);
    void roomApi('/api/host/claim-local', {}).then(() => location.assign('/?host=1')).catch(() => {
      setSigningInOwner(false);
      setOwnerSignInFailed(true);
    });
  };
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
    {/* The phone's own language (the game's standard texts follow it; the author's own texts stay as written). */}
    <LanguagePicker label={translate(PHONE_TEXTS, 'language')} className="join-language" />
    <section className="join-card" aria-labelledby="join-heading">
      <div className="join-brand-row">
        <p className="brand">party<span>.</span></p>
        <PatchNotesButton />
      </div>
      <div className="join-head"><h1 id="join-heading">{t('join.title')}</h1>{title && <p className="room-game">{title}</p>}</div>
      {error && <p role="alert" className="join-error">{error}</p>}
      {linked && <p role="status" className={linked.name ? 'person-linked' : 'join-error'}>{linked.name ? r('linked', { name: linked.name }) : r('linkBroken')}</p>}
      <form className="join-form" noValidate onSubmit={submit}>
        <label>{t('join.code')}
          {/* Shown as ABC-123 and always in capitals; only the six code characters are kept, so it can never get longer than a code. */}
          <input ref={codeRef} className="code-input" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" enterKeyHint="next"
            value={formatRoomCode(roomCode)} maxLength={ROOM_CODE_LENGTH + 1} placeholder="ABC-123" aria-invalid={problems.code ? true : undefined} aria-describedby={problems.code ? 'join-code-problem' : undefined}
            onChange={event => { setRoomCode(cleanRoomCode(event.target.value)); setProblems(({ code: _code, ...rest }) => rest); }} /></label>
        {problems.code && <p id="join-code-problem" className="field-problem" role="alert">{problems.code}</p>}
        {person ? <div className="person-badge"><span>{rich(r('playingAs'), { name: <strong>{person.name}</strong> })}</span><button type="button" className="small-button" onClick={onForget}>{r('notYou', { name: person.name })}</button></div>
          : <><label>{t('join.name')}<input ref={nameRef} autoComplete="nickname" enterKeyHint="go" value={name} maxLength={40} aria-invalid={problems.name ? true : undefined} aria-describedby={problems.name ? 'join-name-problem' : undefined}
            onChange={event => { setName(event.target.value); setProblems(({ name: _name, ...rest }) => rest); }} /></label>
            {problems.name && <p id="join-name-problem" className="field-problem" role="alert">{problems.name}</p>}
            {signup && <label className="choice make-account"><input type="checkbox" checked={makeAccount} onChange={event => setMakeAccount(event.target.checked)} />
              <span>{r('makeAccount')} <small>{r('makeAccountHint')}</small></span></label>}</>}
        <button className="primary big" disabled={busy} type="submit">{busy ? t('join.joining') : t('join.button')}</button>
      </form>
      {person === null && roomCode.length === ROOM_CODE_LENGTH && <PickYourName roomCode={roomCode} people={expected} onSignedIn={onPicked} />}
      {access?.localSignIn && <button type="button" className="join-option join-owner" disabled={signingInOwner} onClick={signInOwner}>
        <JoinOption icon="gear" title={translate(OWNER_TEXTS, 'ownerSignIn')} />
      </button>}
      {ownerSignInFailed && <p role="alert" className="join-error">{translate(OWNER_TEXTS, 'ownerSignInFailed')}</p>}
      {/* Everything else stays folded away, so joining is just the code, a name and one button. */}
      <details className="join-more">
        <summary>{r('moreOptions')}<FaIcon name="chevron-down" /></summary>
        <div className="join-options">
          {person === null && <KeySignIn onSignIn={onSignIn} />}
          <button type="button" className="join-option" onClick={onReclaim}><JoinOption icon="arrow-rotate-left" title={t('join.reclaimButton')} detail={t('join.reclaim')} /></button>
          <a className="join-option" href="/?arcade"><JoinOption icon="play" title={r('arcade')} detail={r('arcadeDetail')} /></a>
          {hostHref && <a className="join-option" href={hostHref}>
            <JoinOption icon={access?.role === 'owner' ? 'tv' : 'gear'} title={r(access?.role === 'owner' ? 'hostInstead' : 'editGames')} />
          </a>}
        </div>
      </details>
    </section>
  </main>;
}

export function RoomScreen() {
  // The address when this screen opened: the arcade switches rooms without reloading the page (navigation.ts).
  const [{ initial, access }] = useState(() => { const taken = pendingAccess; pendingAccess = null; return { initial: new URL(location.href), access: taken }; });
  const [sessionId, setSessionId] = useState(() => GameIdSchema.safeParse(initial.searchParams.get('room')).data);
  const [roomCode, setRoomCode] = useState(cleanRoomCode(initial.searchParams.get('code') ?? '')); const [name, setName] = useState('');
  const [error, setError] = useState(''); const [closedMessage, setClosedMessage] = useState(''); const [busy, setBusy] = useState(Boolean(access)); const [ready, setReady] = useState(!access);
  const [claimDenied, setClaimDenied] = useState(false);
  const [draft, setDraft] = useState(emptyDraft(null)); const [editingLook, setEditingLook] = useState(false); const [displayUrl, setDisplayUrl] = useState(''); const [timerSeconds, setTimerSeconds] = useState('30'); const [reclaiming, setReclaiming] = useState(false);
  const room = useRoom(ready ? sessionId : undefined, initial.searchParams.get('display') === '1'); const language = useLanguage();
  const snapshot = room.snapshot;
  const hostAccess = useHostAccess({ enabled: snapshot?.role === 'host', refreshOnFocus: true });
  const hostHref = hostMenuHref(hostAccess?.role);
  const state = useMemo(() => {
    if (!snapshot?.view.stage) return snapshot;
    const stage = localizeStage(snapshot.view.stage, language);
    return stage === snapshot.view.stage ? snapshot : { ...snapshot, view: { ...snapshot.view, stage } };
  }, [snapshot, language]);
  const account = useMe();
  // An arcade round: keeps this phone in its lobby and goes back there when the round ends.
  useArcadeRound(state);
  useEffect(() => {
    if (!access || !sessionId) return; let mounted = true;
    void roomApi(`/api/rooms/${sessionId}/claim`, { token: access }).then(() => { if (mounted) setReady(true); }).catch(cause => {
      if (!mounted) return;
      if (isUnavailablePageError(cause)) setClaimDenied(true);
      else setError(r('accessFailed'));
    }).finally(() => { if (mounted) setBusy(false); });
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
    void follow.then(next => { if (mounted) moveTo(next); }).catch(() => { if (mounted) setError(r('moved')); });
    return () => { mounted = false; };
  }, [nextRoom, sessionId, myRole]);
  const roomRoot = useRef<HTMLElement>(null);
  const leaveClosedRoom = () => {
    const target = initial.searchParams.has('bench') ? window.top : window;
    (target ?? window).location.replace('/');
  };
  const roomUnavailable = claimDenied || room.denied || (state?.view.sessionId === sessionId && state?.roomClosed === true);
  useEffect(() => { if (roomUnavailable) leaveClosedRoom(); }, [roomUnavailable]);
  // The host panel's one open sheet (settings, invite, players, back to lobby), or none.
  const [sheet, setSheet] = useState<'settings' | 'invite' | 'players' | 'lobby' | null>(null);
  const backToLobby = () => {
    if (!sessionId) return; setSheet(null);
    void roomApi<{ sessionId: string }>(`/api/host/rooms/${sessionId}/restart`, { sessionId: newId(), commandId: newId() }).then(result => moveTo(result.sessionId))
      .catch(() => setError(h('lobbyFailed')));
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
      const admission = { roomCode, displayName: displayName ?? account.person?.name ?? name, ...(look ? { look } : {}) };
      const result = await roomApi<{ sessionId: string }>('/api/rooms/join', { ...admission, joinId }).catch(cause => {
        // A host kick revokes the previous credential. An explicit join starts with a fresh one.
        if (!(cause instanceof Error) || !['UNAUTHORIZED', 'CREDENTIAL_EXPIRED'].includes(cause.message)) throw cause;
        const next = newId();
        try { localStorage.setItem(key, next); } catch { /* optional recovery */ }
        return roomApi<{ sessionId: string }>('/api/rooms/join', { ...admission, joinId: next });
      });
      history.replaceState(null, '', `/?room=${result.sessionId}`); setReady(true); setSessionId(result.sessionId); setNewKey(null);
    } catch (cause) { setError(cause instanceof Error && cause.message === 'ROOM_NOT_AVAILABLE' ? look.text('join.notFound') : cause instanceof Error && cause.message === 'NAME_TAKEN' ? r('nameTaken') : cause instanceof Error && cause.message === 'SEAT_DENIED' ? management('banDenied') : r('joinFailed')); } finally { setBusy(false); }
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
  const graphText = useTexts(GRAPH_TEXTS);
  const poolText = useTexts(HOSTED_POOL_TEXTS); const playText = useTexts(PLAY_TEXTS);
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);
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
  const [roomLook, setRoomLook] = useState<{ code: string; look: typeof RoomLookSchema['_output'] | null }>();
  const firstCode = useRef(/^[A-Z2-9]{6}$/.test(roomCode) ? roomCode : null);
  const joinLook = roomLook?.code === roomCode ? roomLook.look : null;
  useEffect(() => {
    if (sessionId || !/^[A-Z2-9]{6}$/.test(roomCode)) return;
    const code = roomCode;
    let mounted = true;
    const fetchLook = () => { void roomApi(`/api/rooms/look/${code}`).then(data => {
      if (mounted) { firstCode.current = null; setRoomLook({ code, look: RoomLookSchema.safeParse(data).data ?? null }); }
    }).catch(() => {
      if (mounted) { firstCode.current = null; setRoomLook(previous => previous?.code === code ? previous : { code, look: null }); }
    }); };
    // Looked at again now and then: the host may add people (or allow accounts) while someone waits on this screen.
    fetchLook(); const again = setInterval(fetchLook, 10_000);
    return () => { mounted = false; clearInterval(again); };
  }, [roomCode, sessionId]);
  // Before a room is known, the join screen wears the site's look (Admin → Join screen); a room code typed in
  // shows that room's game look, and in the room the game's look applies.
  // The arcade wears the site's look too: an arcade round's own look (its texts) goes on top of it.
  const siteLook = useSiteThemeState();
  const siteTheme = siteLook?.theme; const presentation = state?.view.presentation; const inArcade = Boolean(state?.arcade);
  const lookInput = useMemo<LookInput | undefined>(() => {
    if (presentation) return inArcade && siteTheme ? { ...presentation, themes: [siteTheme, ...(presentation.themes ?? [])] } : presentation;
    return joinLook?.presentation ?? (siteTheme ? { themes: [siteTheme] } : undefined);
  }, [presentation, inArcade, siteTheme, joinLook]);
  const look = useBuiltLook(lookInput); const t = look.text;
  // The host's own controls follow the language chosen in this browser; players' words stay the game's texts (t).
  const fromEditor = previewEditorId(initial.search);
  const h = useTexts(HOST_TEXTS); const management = useTexts(ROOM_MANAGEMENT_TEXTS); const rounds = useTexts(ROUND_CONTROL_TEXTS);
  const lookStyle = useThemeStyle(look.theme); const lookClass = themeClass(look.theme);
  // Animation moments.
  const stageRef = useRef<HTMLElement>(null); const answersRef = useRef<HTMLDivElement>(null); const savedRef = useRef<HTMLParagraphElement>(null);
  const timerRef = useRef<HTMLDivElement>(null); const resultsRef = useRef<HTMLDivElement>(null); const scoresRef = useRef<HTMLDivElement>(null); const playersRef = useRef<HTMLUListElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const teamMomentRef = useRef<HTMLDivElement>(null);
  const explanationRef = useRef<HTMLDivElement>(null);
  const ballotRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const duelRef = useRef<HTMLDivElement>(null);
  const finaleRef = useRef<HTMLDivElement>(null);
  const choosingTeams = Boolean(stage?.teams?.forming);
  const explainingScene = !choosingTeams && Boolean(stage?.explain);
  const placeText = useScenePlaceAwards(stage?.boxPlaceAwards);
  const showingScene = !choosingTeams && !explainingScene;
  useMoment(mediaRef, 'mediaEnter', showingScene && (stage?.media || stage?.youtube) ? stage.id : null, {}, look);
  useMoment(teamMomentRef, 'teamsEnter', stage?.teams ? `${stage.id}:${choosingTeams}` : null, {}, look);
  useMoment(explanationRef, 'explanationEnter', explainingScene ? stage?.id : null, {}, look);
  useMoment(ballotRef, 'voteEnter', showingScene && stage?.kind === 'vote' && !stage.revealed ? stage.id : null, { staggerChildren: true }, look);
  useMoment(miniRef, 'minigameEnter', showingScene && stage?.kind === 'minigame' && !stage.revealed ? stage.id : null, {}, look);
  useMoment(routeRef, 'routeEnter', showingScene && stage?.kind === 'route' ? stage.id : null, {}, look);
  useMoment(duelRef, 'duelEnter', showingScene && stage?.kind === 'duel' && stage.status === 'CLOSED' ? stage.id : null, {}, look);
  useMoment(finaleRef, 'finaleEnter', state?.view.status === 'FINISHED' ? state.view.sessionId : null, {}, look);
  useMoment(stageRef, stage?.kind === 'info' ? 'cutscene' : 'sceneEnter', stage?.id, {}, look);
  useMoment(answersRef, 'answersEnter', stage?.status === 'ACTIVE' && stage.input ? stage.id : null, { staggerChildren: true }, look);
  useMoment(savedRef, 'answerSaved', state?.view.ownSubmission?.id, {}, look);
  useMoment(timerRef, 'timerEnding', remaining !== null && remaining > 0 && remaining <= 5000 && stage?.pausedRemainingMs === null ? `${stage?.id}:ending` : null, {}, look);
  useMoment(resultsRef, 'reveal', stage?.revealed ? stage.id : null, { staggerChildren: true }, look);
  useMoment(scoresRef, 'scoreboard', stage?.scoreboard ? stage.id : state?.view.status === 'FINISHED' ? 'finished' : null, { staggerChildren: true }, look);
  useMoment(playersRef, 'lobbyJoin', state?.view.status === 'LOBBY' && state.players.length ? state.players.length : null, {}, look);

  const waitingForRoomLook = firstCode.current === roomCode && roomLook?.code !== roomCode;
  if (roomUnavailable) return null;
  if (sessionId && !state && !error && !room.message) return <Loader full className="join-startup" label={r('connecting')} />;
  if (!sessionId && (waitingForRoomLook || (!joinLook && !siteLook))) return <Loader full className="join-startup" label={r('connecting')} />;
  if (!sessionId && reclaiming) return <main className={`room room-join ${lookClass}`} style={lookStyle}><h1 className="visually-hidden">{r('joinGame')}</h1><div className="join-card"><SeatReclaim roomCode={roomCode.trim().toUpperCase()} onCancel={() => setReclaiming(false)} onJoined={id => { history.replaceState(null, '', `/?room=${id}`); setReady(true); setSessionId(id); }} /></div></main>;
  if (!sessionId && newKey) return <main className={`room room-join ${lookClass}`} style={lookStyle}><h1 className="visually-hidden">{r('yourCode')}</h1><div className="join-card"><NewKeyCard name={newKey.name} personalKey={newKey.key} busy={busy} onContinue={() => { void join(newKey.name); }} />{error && <p role="alert" className="join-error">{error}</p>}</div></main>;
  if (!sessionId) return <LookContext.Provider value={look}><JoinScreen style={lookStyle} className={lookClass} title={joinLook?.title ?? null} roomCode={roomCode} setRoomCode={setRoomCode} name={name} setName={setName} busy={busy} error={error} onJoin={() => { void join(); }} onReclaim={() => { setError(''); setReclaiming(true); }}
    person={account.person} linked={account.linked} onForget={() => { void account.forget().catch(() => setError(r('signOutFailed'))); }} onSignIn={account.signIn}
    signup={Boolean(joinLook?.signup)} makeAccount={makeAccount} setMakeAccount={setMakeAccount} expected={joinLook?.expected ?? []} onPicked={picked => { void account.refresh().then(() => join(picked)); }} /></LookContext.Provider>;

  const sorted = [...room.samples].sort((a, b) => a - b); const p95 = sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)];
  const seconds = Number(timerSeconds); const validSeconds = Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600;
  // In a team round: nobody answers while teams are being made, players outside a team sit out, and a captain may answer for the team.
  const myTeam = stage ? ownTeam(stage.teams) : undefined;
  // Only while the vote is actually open: a paused room makes nobody a late joiner.
  const routeBlock = stage?.route && !stage.route.canVote && !state?.view.ownSubmission && stage.status === 'ACTIVE' && state?.view.status === 'RUNNING'
    ? stage.route.method === 'draw' ? null : stage.route.method === 'host' ? t('wait.hostRoute') : stage.teams && !stage.teams.forming && myTeam && captainAnswers(stage.teams) ? null : t('wait.lateVoter') : null;
  const answerBlock = routeBlock ?? (!stage?.teams ? null : stage.teams.forming ? t('wait.forming')
    : !myTeam ? t('wait.sitOut') : captainAnswers(stage.teams) && myTeam.captainId !== state?.selfPlayerId ? t('wait.captain', { captain: state?.players.find(player => player.id === myTeam.captainId)?.displayName ?? '', team: myTeam.name }) : null);
  // Scenes that ask nothing: info, scoreboard, and a Pick teams scene once its teams are confirmed.
  const showOnly = stage?.kind === 'info' || stage?.kind === 'scoreboard' || (stage?.kind === 'teams' && !stage.teams?.forming);
  const timer = (change: Record<string, unknown>) => { if (stage) command('stage.timer', { stageRunId: stage.id, change }); };
  const role = state?.role ?? (initial.searchParams.get('display') === '1' ? 'display' : 'player');
  const host = role === 'host'; const running = state?.view.status === 'RUNNING';
  const changeAutoReveal = (seconds: number | null) => {
    void roomApi(`/api/rooms/${sessionId}/settings`, { autoRevealSeconds: seconds }).catch(() => setError(h('settingFailed')));
  };
  const connected = room.connection === 'Connected';
  const me = state?.players.find(player => player.id === state.selfPlayerId);
  const poolAim = { store: room.poolAims, send: room.sendPoolAim };
  const minigameLive = { go: room.go, progress: room.progress, sendTaps: room.sendTaps, strokes: room.liveStrokes, sendStroke: room.sendStroke };
  const saved = t((stage?.kind === 'vote' || stage?.kind === 'route' ? (captainAnswers(stage?.teams ?? null) ? 'vote.savedTeam' : 'vote.saved') : captainAnswers(stage?.teams ?? null) ? 'answer.savedTeam' : 'answer.saved') as TextKey);

  // The one big button the host needs right now, plus the less frequent ones.
  const poolDuel = stage?.duel?.contest.kind === 'game' && stage.duel.contest.game === 'eight-ball';
  const primary = !state ? null : state.view.status === 'LOBBY' ? (state.tryout ? null : { label: t('host.start'), run: () => command('session.start') })
    : state.view.status === 'PAUSED' ? { label: t('host.resume'), run: () => command('session.resume') }
    // While teams are picked, confirming them is the host's next step (possible once anyone is in a team).
    : running && stage?.status === 'ACTIVE' && stage.teams?.forming ? { label: t('host.startTeams'), run: () => command('teams.confirm', { stageRunId: stage.id }), blocked: stage.teams.teams.every(team => team.memberIds.length === 0) }
    // A scene that explains itself first: the host starts it once everyone has read it.
    : running && stage?.status === 'ACTIVE' && stage.explain ? { label: t('explain.start'), run: () => command('stage.explained', { stageRunId: stage.id }) }
    : running && stage?.status === 'ACTIVE' && !stage.teams?.forming && !showOnly && !(stage.kind === 'duel' && !stage.duel?.duelistIds) ? { label: poolDuel ? poolText('closeVotes') : stage.route?.method === 'draw' ? playText('drawNow') : t('host.close'), run: () => command('stage.close', { stageRunId: stage.id }) }
    : running && stage?.status === 'CLOSED' && !stage.revealed && !showOnly && !stage.revealAfterVote && stage.kind !== 'duel' && (stage.kind !== 'route' || stage.route?.decision) ? { label: stage.kind === 'route' ? t('host.announce') : stage.minigame?.game === 'heads-or-tails' ? translate(COIN_TEXTS, 'flipNow') : t('host.reveal'), run: () => command('stage.reveal', { stageRunId: stage.id }) }
    : !state.tryout && running && stage && (stage.status === 'CLOSED' || (stage.status === 'ACTIVE' && showOnly)) && (stage.kind !== 'route' || stage.route?.decision) && (stage.kind !== 'duel' || stage.duel?.winnerId || (poolDuel && stage.revealed)) ? { label: t('host.next'), run: () => command('stage.advance', { stageRunId: stage.id }) }
    : null;
  // What is happening now, in a word or two, above the round.
  const forming = Boolean(stage?.teams?.forming);
  const stageHeading = stage && (forming ? t('phase.teams') : stage.info?.title ?? (stage.scoreboard && !stage.promptStyle ? r('scoreboard')
    : stage.minigame?.graph && !stage.promptStyle && isDefaultGraphQuestion(stage.prompt)
      ? graphText(state.tryout || stage.minigame.graph.chart.yLabel === 'Books lent (thousands)' ? 'sampleQuestion' : 'trendQuestion')
      : stage.prompt));
  const headingStyle = stageHeading === stage?.prompt ? stage?.promptStyle : withoutMarks(stage?.promptStyle);
  const titlePlacement = showingScene && stage?.info ? stage.titlePlacement : undefined;
  const promptPlacement = showingScene ? stage?.promptPlacement : undefined;
  const positionedHeading = Boolean(titlePlacement || (!stage?.info && promptPlacement));
  // Teams are made first; then the explanation; then the round itself.
  const explaining = !forming && Boolean(stage?.explain);
  const phase = !stage || showOnly ? null : state?.view.status === 'PAUSED' ? t('phase.paused') : forming ? t('phase.teams') : explaining ? t('explain.title')
    : stage.route?.method === 'draw' ? playText('drawPhase') : stage.revealed ? t('phase.results') : stage.kind === 'duel' ? (stage.status === 'CLOSED' ? t('phase.duelOn') : t('phase.duel')) : stage.status === 'CLOSED' ? t('phase.locked')
    : stage.kind === 'challenge' ? t('phase.challenge') : stage.kind === 'minigame' ? t('phase.minigame') : stage.kind === 'route' ? t('phase.route') : stage.kind === 'vote' ? t('phase.vote')
    : stage.eligibleCount > 0 && stage.submittedCount >= stage.eligibleCount ? t('phase.allIn') : t('phase.answer');
  // Scores: the host always; phones and the shared screen when the host allows it, and always at a scoreboard scene and the end.
  const scoreMoment = state?.view.status === 'FINISHED' || (stage?.kind === 'scoreboard' && stage.status === 'ACTIVE');
  const canSeeScores = Boolean(state && (host || state.settings.showScores || scoreMoment));
  const scoreBubbles = scoreMoment && canSeeScores && (state?.view.status === 'FINISHED' || stage?.scoreboard?.show !== 'teams');
  const ownPoints = role === 'player' && stage?.revealed && state ? stage.reveal?.awards.find(award => award.playerId === state.selfPlayerId)?.amountMilli ?? null : null;
  const nextAlso = !state?.tryout && running && stage && stage.status === 'CLOSED' && primary?.label !== t('host.next') && (!poolDuel || stage.revealed) && (stage.kind !== 'route' || stage.route?.decision);

  if (role === 'display' && state && poolDuel && stage?.status === 'CLOSED' && stage.duel?.contest.kind === 'game' &&
      stage.duel.contest.view && state.view.status !== 'FINISHED') {
    return <LookContext.Provider value={look}><PoolAimContext.Provider value={poolAim}><main ref={roomRoot} className={`room room-display pool-tv ${lookClass}`} style={lookStyle}>
      <DuelPanel key={stage.id} state={state} stage={stage} disabled send={command} />
      <div className="pool-tv-clock"><StageTimer stage={stage} remaining={remaining} /></div>
    </main></PoolAimContext.Provider></LookContext.Provider>;
  }

  // A player in a team: the page's top stripe is the team's colour (this round's team, else the game's).
  const myTeamColor = role === 'player' && state ? (stage?.teams?.teams.find(team => team.index === stage.teams!.ownTeamIndex)?.color
    ?? state.view.teamStandings.find(team => team.memberIds.includes(state.selfPlayerId ?? ''))?.color) : undefined;
  return <LookContext.Provider value={look}><PoolAimContext.Provider value={poolAim}><RoomSessionContext.Provider value={sessionId ?? null}><StageActionSlot.Provider value={actionSlot}><main ref={roomRoot} className={`room room-${role}${state?.view.status === 'LOBBY' ? ' in-lobby' : ''}${myTeamColor ? ' in-team' : ''} ${lookClass}`} style={myTeamColor ? { ...lookStyle, '--my-team': myTeamColor } as React.CSSProperties : lookStyle}>
    <header className="room-bar session-bar">
      <h1 className="visually-hidden">{state ? r(role === 'host' ? 'hostScreen' : role === 'display' ? 'sharedScreen' : 'yourPhone', { title: state.view.title }) : r('partyRoom')}</h1>
      <p className="brand">party<span>.</span></p>
      <div>
        <p className="room-game">{state?.view.title ?? r('connecting')}{state ? ` · ${t(state.view.status === 'LOBBY' ? 'status.waiting' : state.view.status === 'PAUSED' ? 'status.paused' : state.view.status === 'FINISHED' ? 'status.finished' : 'status.playing')}` : ''}</p>
        {state && <h2 id="room-heading" className="room-code">Room {state.roomCode}</h2>}
      </div>
      <ConnectionMenu status={room.connection} ok={connected} slow={slowConnection(room.samples)} busy={busy} saving={room.saving} onReconnect={room.reconnect} details={<details className="conn-details"><summary>{r('details')}</summary>
        <dl className="metrics"><div><dt>{r('latest')}</dt><dd>{room.samples.length ? `${Math.round(room.samples.at(-1)!)} ms` : r('measuring')}</dd></div>
          <div><dt>{r('p95', { count: room.samples.length })}</dt><dd>{p95 === undefined ? r('measuring') : `${Math.round(p95)} ms`}</dd></div><div><dt>{r('reconnects')}</dt><dd>{room.reconnects}</dd></div><div><dt>{r('lastSaved')}</dt><dd>{room.confirmMs === null ? '—' : `${room.confirmMs} ms`}</dd></div></dl>
        <p>{r('roundTripNote')}</p></details>} />
    </header>
    {state?.hostPhone && role === 'player' && state.view.status !== 'FINISHED' && <div className="host-phone-controls">
      <Popover label={rounds('controls')} text={rounds('controls')} closeOnAction>
        {primary && !forming && <button type="button" className="primary" disabled={disabled} onClick={primary.run}>{primary.label}</button>}
        {running && <button type="button" disabled={disabled} onClick={() => command('session.pause')}>{t('host.pause')}</button>}
        <label className="choice"><input type="checkbox" checked={state.settings.autoRevealSeconds != null} disabled={disabled}
          onChange={event => changeAutoReveal(event.target.checked ? 0 : null)} />{rounds('autoReveal')}</label>
        {state.settings.autoRevealSeconds != null && <label>{rounds('delay')}<input type="number" min={0} max={120} disabled={disabled}
          key={state.settings.autoRevealSeconds} defaultValue={state.settings.autoRevealSeconds} onBlur={event => {
            const seconds = event.currentTarget.valueAsNumber;
            if (!Number.isInteger(seconds) || seconds < 0 || seconds > 120) event.currentTarget.value = String(state.settings.autoRevealSeconds);
            else if (seconds !== state.settings.autoRevealSeconds) changeAutoReveal(seconds);
          }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>}
      </Popover>
    </div>}
    {stage && state && <RoundBar state={state} stage={stage} phase={phase} remaining={remaining} timerRef={timerRef} tools={state.arcade?.leader && role === 'player' && state.view.status !== 'FINISHED' ? <ArcadeLeaderMenu state={state} disabled={disabled} /> : undefined} />}
    {/* Messages float over the page instead of pushing it down. An action still being sent only shows the spinner above;
        the retry choice appears once it is really stuck (sending stopped without a confirmation). */}
    <div className="room-toasts">
      {error && <p role="alert" className="error room-toast">{error}</p>}
      {room.message && room.message !== closedMessage && <div className="room-toast"><p role="status" aria-label={r('actionStatus')}>{room.message}</p>
        <button type="button" className="toast-close" aria-label={r('closeMessage')} onClick={() => setClosedMessage(room.message)}>×</button></div>}
      {room.pending && !room.saving && <div className="room-toast pending" role="region" aria-label={r('unconfirmed')}><p role="status">{r('notConfirmedYet')}</p>
        <div className="actions"><button onClick={room.retry}>{r('retry')}</button><button className="ghost" onClick={room.discard}>{r('discard')}</button></div></div>}
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
                    {role !== 'display' && <CopyIcon text={publicJoinUrl(location.origin, state.roomCode)} label={h('copyJoinLink')} icon="link" />}</div>
                  <p className="lobby-go">{t('lobby.screenGo', { host: location.host })}</p><BigCode roomCode={state.roomCode} copy={role !== 'display'} /></div>
                <JoinQr origin={location.origin} roomCode={state.roomCode} link={false} />
              </div>}
              <div className="lobby-stage">
                <p className="lobby-count" aria-label={`${state.players.length} ${state.players.length === 1 ? 'player' : 'players'} joined`}><FaIcon name="users" /> {state.players.length}</p>
                <ul ref={playersRef} className="lobby-seats" aria-label={r('playersJoined')}>
                  {state.players.map(player => <li key={player.id} className="seat taken"><Avatar look={player.look} size={88} /><span>{player.displayName}</span></li>)}
                  {Array.from({ length: emptySeats(state.players.length) }, (_, index) => <li key={`empty-${index}`} className="seat empty" aria-hidden="true"><span className="seat-ring"><FaIcon name="user-plus" /></span></li>)}
                </ul>
              </div></>}
        </section>}
        {stage && <section ref={stageRef} className={`stage-card kind-${stage.kind}${stage.minigame?.graph ? ' round-graph' : stage.minigame?.dots ? ' round-dots' : ''}`} aria-labelledby="stage-heading">
          {showingScene && <SlideImages images={stage.slideImages} />}
          {showingScene && <SlideTextLayer boxes={stage.textBoxes} placeText={placeText}>
            {titlePlacement && stage.info && <PositionedSlideText position={titlePlacement} text={stage.info.title} format={stage.titleStyle}
              size="heading" rotation={titlePlacement.rotation ?? 0} as="h2" id="stage-heading" />}
            {promptPlacement && <PositionedSlideText position={promptPlacement} text={stage.info ? stage.prompt : stageHeading ?? ''}
              format={stage.info ? stage.promptStyle : headingStyle} rotation={promptPlacement.rotation ?? 0}
              {...(stage.info ? {} : { as: 'h2' as const, id: 'stage-heading' })} />}
          </SlideTextLayer>}
          {showingScene && role !== 'player' && !stage.revealed && stage.input?.kind === 'choice' &&
            <SlideAnswers options={stage.input.options} theme={look.theme} label={r('answers')} />}
          <SceneComposition layout={stage.mediaLayout} media={showingScene && (stage.youtube || stage.media) ? <div ref={mediaRef}>
            {stage.youtube ? <StageYouTube key={stage.id} clip={stage.youtube} role={role} displayConnected={Boolean(state.displayConnected)} label={stage.info?.title ?? stage.prompt} paused={state.view.status === 'PAUSED' || state.view.status === 'FINISHED'}
                control={room.mediaControl?.stageRunId === stage.id ? room.mediaControl : null} />
              : stage.media ? <StageMedia key={stage.id} media={stage.media} role={role} displayConnected={Boolean(state.displayConnected)} label={stage.info?.title ?? stage.prompt} paused={state.view.status === 'PAUSED' || state.view.status === 'FINISHED'}
                control={room.mediaControl?.stageRunId === stage.id ? room.mediaControl : null} /> : null}
            {/* The host runs the shared screen's video, song or clip from here. */}
            {role === 'host' && state.displayConnected && (stage.youtube || (stage.media && stage.media.kind !== 'image')) && state.view.status === 'RUNNING'
              && <MediaHostControls onControl={action => room.sendMediaControl(stage.id, action)} />
            }
          </div> : null}>
            {stage.info && !titlePlacement && <p {...sceneTextProps(stage.titleStyle, 'heading')}><SceneTextContent text={stage.info.title} format={stage.titleStyle} /></p>}
            {/* While teams are picked, the round's question waits: one thing at a time. */}
            {/* The title, with the round's main action (such as Send) next to it when the round puts one there. */}
            <div className="stage-heading-row">{!positionedHeading && <h2 id="stage-heading" {...(stage.info ? { className: 'visually-hidden' }
              : !forming && (headingStyle || usesSlideTypography(stage.kind)) ? sceneTextProps(headingStyle) : {})}>
              <SceneTextContent text={stageHeading ?? ''} format={headingStyle} />
            </h2>}<div ref={setActionSlot} className="stage-action-slot" /></div>
            {stage.info && !promptPlacement && <p {...sceneTextProps(stage.promptStyle)}><SceneTextContent text={stage.prompt} format={stage.promptStyle} /></p>}
            {showingScene && <SceneTextBoxes boxes={stage.textBoxes} placeText={placeText} phoneColumns={stage.textBoxPhoneColumns} />}
          </SceneComposition>
          {forming && role === 'player' && <p className="wait-note">{t('wait.forming')}</p>}
          {stage.teams && <div ref={teamMomentRef}>
            <TeamForming state={state} stage={stage} disabled={disabled} send={command} />
            <TeamSummary state={state} stage={stage} />
          </div>}
          {explaining && <div ref={explanationRef}><ExplainPanel state={state} stage={stage} disabled={disabled} send={command} /></div>}
          {!forming && !explaining && <><div ref={answersRef} className="answers-slot">{role !== 'player' && stage.input && stage.input.kind !== 'text' && stage.input.kind !== 'media' && !stage.revealed && <OptionsBoard input={stage.input} route={stage.kind === 'route'} />}
          {stage.kind === 'vote' && !stage.revealed && <div ref={ballotRef}><VoteBallot key={stage.id} state={state} stage={stage} disabled={disabled || timeUp} canVote={role === 'player' && !answerBlock && !state.view.ownSubmission && stage.status === 'ACTIVE' && running}
            onVote={value => command('submission.submit', { stageRunId: stage.id, value })} /></div>}
          {/* Phones see the count in the top bar (x/y); the host and the shared screen keep the line. */}
          {stage.kind !== 'challenge' && stage.kind !== 'route' && stage.kind !== 'duel' && role !== 'player' && !showOnly && !stage.revealed && <p className="progress-line">{t(stage.kind === 'vote' ? 'progress.voted' : 'progress.answered', { count: stage.submittedCount, total: stage.eligibleCount })}{stage.status === 'CLOSED' ? ` · ${t('progress.locked')}` : ''}</p>}
          {host && stage.kind === 'challenge' && stage.status === 'CLOSED' && !stage.revealed && running && <JudgePanel state={state} stage={stage} disabled={disabled} send={command} />}
          {stage.countdownUntil && role !== 'player' && <Countdown startsAt={stage.countdownUntil} offset={room.clockOffset}>{null}</Countdown>}
          {stage.kind === 'minigame' && !stage.revealed && <div ref={miniRef}><MinigameStage state={state} stage={stage} offset={room.clockOffset}
            disabled={disabled || (timeUp && (stage.minigame?.game === 'cut-the-line' || stage.minigame?.game === 'match-the-angle'
              || stage.minigame?.game === 'count-the-dots' || stage.minigame?.game === 'draw-the-graph' || isSharedPrediction(stage.minigame?.game ?? '')))}
            canPlay={role === 'player' && !answerBlock && stage.status === 'ACTIVE' && running}
            onResult={result => command('submission.submit', { stageRunId: stage.id, value: { kind: 'minigame', ...result } })}
            live={minigameLive} onPart={(turn, assetId) => command('minigame.part', { stageRunId: stage.id, turn, assetId })}
            onMove={(step, option, decide) => command('minigame.move', { stageRunId: stage.id, step, option, ...(decide ? { decide: true } : {}) })}
            onUndercover={(action, round, extra) => command('undercover.act', { stageRunId: stage.id, action, round, ...extra })} /></div>}
          {stage.kind === 'route' && <div ref={routeRef}>{stage.route?.method === 'draw' ? <MinigameDraw state={state} stage={stage} offset={room.clockOffset} disabled={disabled} send={command} />
            : <RouteChoice state={state} stage={stage} disabled={disabled} send={command} />}</div>}
          {stage.kind === 'duel' && <div ref={duelRef}><DuelPanel key={stage.id} state={state} stage={stage} disabled={disabled || (poolDuel && stage.status === 'CLOSED' && timeUp && Boolean(stage.deadlineAt))} send={command} /></div>}
          {stage.kind !== 'route' && stage.revealed && (!poolDuel || ((role !== 'player' || !state.screenConnected) && stage.duel?.pick !== 'teams' && stage.reveal?.awards.length)) && <div ref={resultsRef}><StageResults state={state} stage={stage} offset={room.clockOffset} onNext={() => command('stage.nextResult', { stageRunId: stage.id })}
            onGraphPlayback={action => command('stage.graphPlayback', { stageRunId: stage.id, action })} disabled={disabled} /></div>}
          {/* A writing, upload or drawing round with host points: the host gives them under the shown answers. */}
          {/* A revealed quiz or ordering round: the host can overrule it on one answer. */}
          {host && stage.revealed && <AnswerChecks state={state} stage={stage} disabled={disabled} send={command} />}
          {host && stage.kind === 'collect' && stage.challenge && stage.revealed && running && <JudgePanel state={state} stage={stage} disabled={disabled} send={command} />}
          {stage.status === 'CLOSED' && !stage.revealed && stage.revealAfterVote && <p>{r('shownWithoutNames')}</p>}
          {stage.kind === 'minigame' ? (role === 'player' && answerBlock && stage.status === 'ACTIVE' ? <p className="wait-note">{answerBlock}</p> : null)
            : role === 'player' && state.view.ownSubmission ? <p ref={savedRef} role="status" className="answer-in">{saved}</p>
            : role === 'player' && answerBlock && stage.status === 'ACTIVE' ? <p className="wait-note">{answerBlock}</p>
            : role === 'player' && stage.input?.kind === 'drawing' && stage.status === 'ACTIVE' && running ? <Countdown startsAt={stage.countdownUntil} offset={room.clockOffset}><DrawingAnswer sessionId={state.view.sessionId} stageRunId={stage.id} input={stage.input} disabled={disabled} timeUp={timeUp}
              onSubmit={assetId => command('submission.submit', { stageRunId: stage.id, value: { kind: 'drawing', assetId } })} /></Countdown>
            : role === 'player' && stage.input && stage.status === 'ACTIVE' && running ? <form className="answer-form" onSubmit={event => {
              event.preventDefault(); const value = stage.input && draftValue(stage.input, draft); if (value) command('submission.submit', { stageRunId: stage.id, value });
            }}>
              <AnswerInput sessionId={state.view.sessionId} input={stage.input} draft={draft} onChange={setDraft} legend={stage.kind === 'route' ? t('vote.legend') : t('answer.legend')} route={stage.kind === 'route'} />
              <button className="primary" disabled={disabled || !draftValue(stage.input, draft) || timeUp}>{timeUp ? t('timer.up') : stage.kind === 'route' ? t('vote.submit') : t('answer.submit')}</button></form>
            : role === 'player' && !poolDuel ? <p className="wait-note">{stage.kind === 'challenge' ? t('wait.challenge') : stage.kind === 'vote' || showOnly || (stage.kind === 'duel' && !state.screenConnected) ? '' : t('wait.screen')}</p> : null}</div></>}
        </section>}
        {role !== 'display' && <WheelBadge wheel={state.view.wheel} />}
        {state.view.status === 'FINISHED' && <div ref={finaleRef}><FinaleShow state={state} /></div>}
        {/* Phones keep the scores one tap away (the dock). The shared screen shows them with the results of a round, at scoreboard scenes and at the end: nothing it does not need. */}
        {scoreMoment && canSeeScores && <div ref={scoresRef}><Scoreboard state={state} disabled={disabled} send={command}
          reactions={scoreBubbles && role !== 'player' && state.settings.reactions ? room.reactions : undefined} /></div>}
        {state.view.status === 'FINISHED' && role === 'player' && !state.arcade && <div className="actions"><LeaveRoom /></div>}
      </div>

      {host && <aside className="room-controls" aria-label={h('hostControls')}>
        {primary && <button className="primary big" disabled={disabled || ('blocked' in primary && primary.blocked)} onClick={primary.run}>{primary.label}</button>}
        {!state.tryout && poolDuel && running && stage?.status === 'CLOSED' && !stage.revealed &&
          <button type="button" className="ghost small-button" disabled={disabled} onClick={() => {
            if (confirm(poolText('confirmSkip'))) command('stage.advance', { stageRunId: stage.id });
          }}>{poolText('skip')}</button>}
        {nextAlso && <button disabled={disabled} onClick={() => command('stage.advance', { stageRunId: stage!.id })}>{t('host.next')}</button>}
        {running && stage && state.view.wheel.canSpin && <button disabled={disabled} onClick={() => command('wheel.spin', { stageRunId: stage.id })}>{state.view.wheel.spin ? t('wheel.again') : t('wheel.spin')}</button>}
        {/* The round's tools in one row of icons (names on hover and for screen readers). */}
        <div className="host-toolbar" role="toolbar" aria-label={h('roundTools')}>
          {running && <button type="button" className="icon-tool" aria-label={t('host.pause')} title={t('host.pause')} disabled={disabled} onClick={() => command('session.pause')}><FaIcon name="pause" /></button>}
          {running && <button type="button" className="icon-tool" aria-label={t('break.vote')} title={t('break.vote')} disabled={disabled} onClick={() => { void roomApi(`/api/rooms/${sessionId}/break`, {}).catch(() => setError(h('breakFailed'))); }}><FaIcon name="smoking" /></button>}
          {stage && stage.status === 'ACTIVE' && !stage.teams?.forming && <>
            {remaining !== null && <button type="button" className="icon-tool text" title={h('addSeconds', { seconds: state.settings.quickTimeSeconds })} disabled={disabled} onClick={() => timer({ kind: 'add', ms: state.settings.quickTimeSeconds * 1000 })}>+{quickTime(state.settings.quickTimeSeconds)}<span className="visually-hidden">{h('addSecondsHidden', { seconds: state.settings.quickTimeSeconds })}</span></button>}
            <Popover label={h('setTheTime')} icon="stopwatch" className="icon-tool">
              {remaining !== null && <div className="actions"><button type="button" className="ghost small-button" disabled={disabled} onClick={() => timer({ kind: 'add', ms: 60_000 })}>+1 min</button>
                <button type="button" className="ghost small-button" disabled={disabled} onClick={() => timer({ kind: 'clear' })}><FaIcon name="infinity" /> {h('removeLimit')}</button></div>}
              <form className="inline-form time-set" onSubmit={event => { event.preventDefault(); if (validSeconds) timer({ kind: 'set', ms: seconds * 1000 }); }}>
                <label>{h('timeLeft')}<input type="number" inputMode="numeric" min={1} max={3600} step={1} value={timerSeconds} onChange={event => setTimerSeconds(event.target.value)} /></label>
                <button className="ghost small-button" disabled={disabled || !validSeconds}>{h('setTime')}</button></form>
            </Popover></>}
          {running && stage?.status === 'CLOSED' && !stage.revealed && !poolDuel && !showOnly && !stage.route?.decision && stage.route?.method !== 'host' && <Popover label={h('reopenAnswers')} icon="arrow-rotate-left" className="icon-tool">
            <button className="ghost" disabled={disabled} onClick={() => command('stage.reopen', { stageRunId: stage.id, durationMs: 30_000 })}>{h('reopen30')}</button>
            <button className="ghost" disabled={disabled} onClick={() => command('stage.reopen', { stageRunId: stage.id, durationMs: null })}>{h('reopenNoLimit')}</button></Popover>}
        </div>
        {stage?.hostNotes && <details className="host-notes" key={stage.id} open>
          <summary>{h('hostNotes')} <FaIcon name="chevron-down" /></summary>
          <p tabIndex={0}>{stage.hostNotes}</p>
        </details>}
        <SeatRequests state={state} sessionId={state.view.sessionId} onError={setError} />
        <NameRequests state={state} sessionId={state.view.sessionId} onError={setError} />
        {/* Everything less frequent behind four icons; one sheet at a time, under the icons. */}
        <div className="host-tabs" role="group" aria-label={h('more')}>
          {([['settings', 'gear', h('roomSettings')], ['invite', 'tv', h('sharedAndInvite')], ['players', 'users', h('playersCount', { count: state.players.length })], ['lobby', 'arrow-rotate-left', h('backToLobby')]] as const).map(([key, icon, label]) =>
            (key !== 'lobby' || (!state.tryout && hostAccess?.role === 'owner')) && (state.view.status !== 'LOBBY' || (key !== 'lobby' && key !== 'players')) && <button key={key} type="button" className="icon-tool" aria-label={key === 'players' ? undefined : label} title={label} aria-expanded={sheet === key} onClick={() => setSheet(sheet === key ? null : key)}><FaIcon name={icon} />{key === 'players' && <><span className="visually-hidden">{h('playersHidden')}</span><span className="tool-count">{state.players.length}</span></>}</button>)}
        </div>
        {sheet === 'settings' && <HostDialog portal={roomRoot.current} title={h('roomSettings')} icon="gear" onClose={() => setSheet(null)}><div className="settings-layout">
          <div className="settings-col"><h3>{h('phonesWaiting')}</h3><SideGamesSwitch state={state} sessionId={state.view.sessionId} onError={setError} />
            <h3>{h('joining')}</h3><SeatApprovalSetting state={state} sessionId={state.view.sessionId} onError={setError} /><SignupSetting state={state} sessionId={state.view.sessionId} onError={setError} /><TestBenchSetting state={state} sessionId={state.view.sessionId} onError={setError} />
            {hostHref && <p className="control-back"><a className="link-button" href={hostHref}>
              {hostAccess?.role === 'owner' ? h('backToHostMenu') : r('editGames')}
            </a></p>}
            {state.view.status !== 'FINISHED' && <button type="button" className="danger" disabled={disabled || busy} onClick={() => {
              if (!confirm(management('closeAsk'))) return;
              setBusy(true);
              void roomApi(`/api/rooms/${sessionId}/close`, {}).then(leaveClosedRoom).catch(() => setError(management('closeFailed'))).finally(() => setBusy(false));
            }}>{management('closeRoom')}</button>}</div>
          <RoomSettings state={state} sessionId={state.view.sessionId} onError={setError} /></div></HostDialog>}
        {sheet === 'invite' && <HostDialog portal={roomRoot.current} title={h('sharedAndInvite')} icon="tv" size="compact" onClose={() => setSheet(null)}>
          <div className="invite-join"><JoinQr origin={location.origin} roomCode={state.roomCode} link={false} />
            <div className="invite-code"><h3>{h('invitePlayers')}</h3><BigCode roomCode={state.roomCode} copy /><JoinLink url={publicJoinUrl(location.origin, state.roomCode)} copy /></div></div>
          {/* Testing alone: the host screen with phones next to it, each its own player (virtual phones; real ones can join too). */}
          <div className="invite-display"><FaIcon name="users" /><p><strong>{h('testWithPhones')}</strong> {h('testWithPhonesText')}</p>
            <a className="invite-bench invite-action" href={`/?bench=${sessionId}${fromEditor ? `&fromEditor=${fromEditor}` : ''}`} target="_blank" rel="noreferrer">{h('openTestBench')}</a></div>
          <div className="invite-display"><FaIcon name="tv" /><p><strong>{h('sharedScreen')}</strong> {h('sharedScreenText')}</p>
            {displayUrl ? <span className="invite-display-open"><a className="invite-action" href={displayUrl} target="_blank" rel="noreferrer">{h('openDisplay')}</a><CopyIcon text={displayUrl} label={h('copyDisplayLink')} icon="link" /></span>
              : <button className="ghost" onClick={() => { void roomApi<{ token: string }>(`/api/rooms/${sessionId}/display`, {}).then(result => setDisplayUrl(`${location.origin}/?room=${sessionId}&display=1#access=${result.token}`)).catch(() => setError(h('displayFailed'))); }}>{h('createDisplayLink')}</button>}</div>
        </HostDialog>}
        {state.view.status === 'LOBBY' && <section className="host-sheet players" aria-labelledby="players-heading"><h2 id="players-heading">{t('players.title', { count: state.players.length })}</h2>
          <HostPlayerList state={state} disabled={disabled} send={command} onError={setError} />
          <ExpectedPeople state={state} sessionId={state.view.sessionId} onError={setError} /></section>}
        {sheet === 'players' && state.view.status !== 'LOBBY' && <HostDialog portal={roomRoot.current} title={t('players.title', { count: state.players.length })} icon="users" onClose={() => setSheet(null)}><section className="host-sheet players in-dialog" aria-label={h('players')}>
          {me && <button className="small-button ghost change-look" onClick={() => setEditingLook(true)}>{t('players.changeLook')}</button>}
          <HostPlayerList state={state} disabled={disabled} send={command} onError={setError} listRef={playersRef} />
          <ExpectedPeople state={state} sessionId={state.view.sessionId} onError={setError} /></section></HostDialog>}
        {sheet === 'lobby' && hostAccess?.role === 'owner' && <div className="host-sheet reset-confirm" role="group" aria-label={h('backToLobby')}>
          <p>{h('lobbyAsk')}</p>
          <div className="actions"><button className="danger" onClick={backToLobby}>{h('yesBackToLobby')}</button><button className="ghost" onClick={() => setSheet(null)}>{h('cancel')}</button></div></div>}
        {/* The scores, small and foldable, at the bottom of the panel (big only at a scoreboard scene and the end). */}
        {!scoreMoment && state.view.status !== 'LOBBY' && <FloatingScores docked leader={leaderLine(state)}><Scoreboard state={state} disabled={disabled} send={command} compact /></FloatingScores>}
        <div className="host-leave"><LeaveRoom host hostMenu={hostHref} /></div>
      </aside>}
    </div>}
    {state && me && editingLook && <div className="look-sheet" role="dialog" aria-modal="true" aria-labelledby="look-builder-heading" onKeyDown={event => { if (event.key === 'Escape') setEditingLook(false); }}><LookBuilder initial={me.look} name={me.displayName} busy={disabled} sessionId={state.view.sessionId}
      onCancel={() => setEditingLook(false)} onSave={next => { rememberLook(next); command('player.look', { look: next }); setEditingLook(false); }}
      // Unless the host wants players to confirm, every choice is used at once, and the game starting finishes the look.
      confirm={state.settings.confirmLooks} onApply={next => { rememberLook(next); command('player.look', { look: next }); }} finishSignal={state.view.status === 'LOBBY' ? 0 : 1} /></div>}
    {state && <WheelOverlay wheel={state.view.wheel} offset={room.clockOffset} />}
    {state && role === 'display' && <WheelBadge wheel={state.view.wheel} />}
    {/* The music plays where sound plays: the shared screen, or the host's screen without one. */}
    {state?.view.music && state.settings.music && (role === 'display' || (role === 'host' && !state.displayConnected)) && <MusicPlayer music={state.view.music} volume={state.settings.musicVolume / 100} />}
    {state && <BreakOverlay state={state} host={host} disabled={disabled} onContinue={() => command('session.resume')} />}
    {state && role === 'player' && <PhoneDock key={`${state.view.sessionId}:${state.selfPlayerId}`} state={state} challengeTick={room.challengeTick} canSeeScores={canSeeScores} onChangeLook={() => setEditingLook(true)} onReact={room.sendReaction} onSound={room.sendSound} soundUntil={room.soundUntil} offset={room.clockOffset}
      onBreak={vote => { void roomApi(`/api/rooms/${sessionId}/break`, { vote }).catch(() => setError(r('voteFailed'))); }}
      scores={<Scoreboard state={state} disabled={disabled} send={command} />} />}
    {state && role === 'player' && <PointsCelebration customizable={state.view.phoneEffects === true} roundId={stage?.revealed ? stage.id : null} points={ownPoints ? Number(ownPoints) / 1000 : null} label={ownPoints ? formatPoints(ownPoints) : ''} />}
    {state && role === 'display' && canSeeScores && !scoreMoment && state.view.status !== 'LOBBY' && stage?.revealed && <FloatingScores leader={leaderLine(state)}><Scoreboard state={state} disabled={disabled} send={command} compact /></FloatingScores>}
    {state && role !== 'player' && state.settings.reactions && !scoreBubbles && <ReactionsOverlay state={state} store={room.reactions} />}
    {/* The soundboard plays where the room's sound plays: the shared screen, or the host's screen without one. */}
    {state && (role === 'display' || (role === 'host' && !state.displayConnected)) && <SoundPlayer state={state} event={room.soundEvent} />}
    {state && (role === 'display' || (role === 'host' && !state.displayConnected)) && <EventSounds state={state} offset={room.clockOffset} />}
    {/* A winning team's celebration: with its sound where the room's sound plays, and on that team's phones. */}
    {state && <TeamCelebrationShow state={state} playsSound={role === 'display' || (role === 'host' && !state.displayConnected)} />}
  </main></StageActionSlot.Provider></RoomSessionContext.Provider></PoolAimContext.Provider></LookContext.Provider>;
}

type StageInput = NonNullable<NonNullable<ReturnType<typeof useRoom>['snapshot']>['view']['stage']>['input'];
/** The answers as the shared screen and host see them: the same colours as the phone tiles, not clickable. */
function OptionsBoard({ input, route = false }: { input: NonNullable<StageInput>; route?: boolean }) {
  const { theme } = useLook();
  const entries = input.kind === 'choice' ? input.options : input.kind === 'order' ? input.items : [];
  const hasPlacement = input.kind === 'choice' && input.options.some(option => option.placement);
  if (!entries.length || (input.kind === 'choice' && input.options.every(option => option.placement))) return null;
  return <ol className={`options-board${input.kind === 'order' ? ' order' : ''}${route ? ' route' : ''}${hasPlacement ? ' with-positioned-answers' : ''}`}
    data-list={input.kind === 'choice' && input.layout === 'list' || undefined} style={answerFit(entries.map(entry => entry.label))} aria-label={r(input.kind === 'order' ? 'itemsOrder' : 'answers')}>
    {entries.map((entry, index) => {
      const placed = input.kind === 'choice' && Boolean(input.options[index]?.placement);
      const mark = input.kind === 'order' ? '•' : answerMark(theme, index, entries.length, route);
      return <li key={entry.key} aria-hidden={placed || undefined} className={placed ? 'answer-slot-placeholder' : undefined} data-authored-answer={hasPlacement || undefined}
        style={hasPlacement ? { '--positioned-answer-color': answerAccent(index) } as React.CSSProperties : undefined}>
        {mark !== null && <span className="answer-mark" aria-hidden="true"><Mark text={mark} /></span>}{entry.label}
      </li>;
    })}</ol>;
}

/** The host screen inside the test bench (its frame is opened with `&bench=1`). */
const onBench = first.searchParams.get('bench') === '1' && typeof window !== 'undefined' && window.top !== window.self;
// (`&bench=real`: on the bench with real phones joining too, so the join strip stays.)

/** Slow: the last three round trips took more than 400 ms on average (the connection dot turns orange). */
const slowConnection = (samples: number[]) => { const recent = samples.slice(-3); return recent.length > 0 && recent.reduce((sum, ms) => sum + ms, 0) / recent.length > 400; };

/** Empty seats on the lobby stage, so it reads as "waiting for more": at least 8 seats, then always a few more than joined. */
const emptySeats = (joined: number) => Math.max(8 - joined, joined < 24 ? 4 - (joined % 4) : 0);

/** The quick time button's text: “30 s”, “1 min”, “1:30”. */
function quickTime(seconds: number) { return seconds < 60 ? `${seconds} s` : seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
