import { useEffect, useRef, useState } from 'react';
import { GameCommandSchema, PLAYER_COMMANDS, RoomLookSchema, type TextKey } from '@party/contracts';
import { newId, roomApi } from './api.js';
import { useRoom } from './use-room.js';
import { JoinQr } from './join-qr.js';
import { StageTimer, useRemaining } from './stage-timer.js';
import { AnswerInput, draftValue, emptyDraft } from './answer-input.js';
import { JudgePanel, Scoreboard, StageResults } from './results.js';
import { VoteBallot } from './vote.js';
import { SeatReclaim, SeatRequests } from './seat-reclaim.js';
import { TeamForming, TeamSummary, captainAnswers, ownTeam } from './teams.js';
import { RouteChoice } from './route-choice.js';
import { MinigameStage } from '../minigames/minigame-stage.js';
import { DrawingAnswer } from '../drawing/drawing-answer.js';
import { PhoneDock } from '../room-extras/phone-dock.js';
import { ReactionsOverlay } from '../room-extras/reactions.js';
import { RoomSettings } from '../room-extras/room-settings.js';
import { PointsCelebration } from '../room-extras/celebrate.js';
import { BreakOverlay, FinaleShow, WheelBadge, WheelOverlay } from '../room-extras/show-extras.js';
import { formatPoints } from './results.js';
import { Avatar, RoomSessionContext } from '../players/avatar.js';
import { LookBuilder, rememberLook, savedLook } from '../players/look-builder.js';
import { useMe, type Person } from '../people/use-me.js';
import './room.css';
import { LookContext, themeClass, themeStyle, useBuiltLook, useMoment, useText, type LookInput } from '../presentation/look.js';

const initial = new URL(location.href);
const access = new URLSearchParams(initial.hash.slice(1)).get('access');
if (access) history.replaceState(null, '', `${initial.pathname}${initial.search}`);

/** Joining from a phone: room code and name, plus seat takeover and a way to host instead. */
function JoinScreen({ roomCode, setRoomCode, name, setName, busy, error, onJoin, onReclaim, style, className, title, person, linked, onForget }: {
  roomCode: string; setRoomCode: (value: string) => void; name: string; setName: (value: string) => void; busy: boolean; error: string; onJoin: () => void; onReclaim: () => void;
  style: React.CSSProperties; className: string; title: string | null;
  person: Person | null | undefined; linked: { name: string | null } | null; onForget: () => void;
}) {
  const t = useText();
  return <main className={`room room-join ${className}`} style={style}>
    <section className="join-card" aria-labelledby="join-heading">
      <p className="brand">party<span>.</span></p>
      <h1 id="join-heading">{t('join.title')}</h1>{title && <p className="room-game">{title}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {linked && <p role="status" className={linked.name ? 'person-linked' : 'error'}>{linked.name ? `This phone now plays as ${linked.name}. Join any room and you are ${linked.name}.` : 'This personal link no longer works. Ask the organiser for a new one.'}</p>}
      <form onSubmit={event => { event.preventDefault(); onJoin(); }}>
        <label>{t('join.code')}<input className="code-input" autoComplete="off" autoCapitalize="characters" value={roomCode} onChange={event => setRoomCode(event.target.value)} maxLength={6} required placeholder="ABC123" /></label>
        {person ? <div className="person-badge"><span>Playing as <strong>{person.name}</strong></span><button type="button" className="link-button" onClick={onForget}>Not {person.name}?</button></div>
          : <label>{t('join.name')}<input autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} maxLength={40} required /></label>}
        <button className="primary" disabled={busy} type="submit">{busy ? t('join.joining') : t('join.button')}</button>
      </form>
      <p className="join-links">{t('join.reclaim')} <button type="button" className="link-button" onClick={onReclaim}>{t('join.reclaimButton')}</button></p>
      <p className="join-links"><a href="/?host=1">Host a game instead</a></p>
    </section>
  </main>;
}

export function RoomScreen() {
  const [sessionId, setSessionId] = useState(initial.searchParams.get('room') ?? undefined);
  const [roomCode, setRoomCode] = useState(initial.searchParams.get('code') ?? ''); const [name, setName] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(Boolean(access)); const [ready, setReady] = useState(!access);
  const [draft, setDraft] = useState(emptyDraft(null)); const [editingLook, setEditingLook] = useState(false); const [displayUrl, setDisplayUrl] = useState(''); const [timerSeconds, setTimerSeconds] = useState('30'); const [reclaiming, setReclaiming] = useState(false);
  const room = useRoom(ready ? sessionId : undefined, initial.searchParams.get('display') === '1'); const state = room.snapshot;
  const account = useMe();
  useEffect(() => {
    if (!access || !sessionId) return; let mounted = true;
    void roomApi(`/api/rooms/${sessionId}/claim`, { token: access }).then(() => { if (mounted) setReady(true); }).catch(() => { if (mounted) setError('Host/display access could not be verified. Open a fresh access link.'); }).finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [sessionId]);
  // Each stage starts from its own blank answer (and its own item order).
  useEffect(() => { setDraft(emptyDraft(state?.view.stage?.input)); }, [state?.view.stage?.id]);
  const join = async () => {
    setBusy(true); setError('');
    try {
      const key = `party_join_${roomCode.trim().toUpperCase()}`; let joinId: string | null = null;
      try { joinId = localStorage.getItem(key); } catch { /* Online join can still work. */ }
      if (!joinId) { joinId = newId(); try { localStorage.setItem(key, joinId); } catch { /* optional recovery */ } }
      const look = savedLook();
      // A person joins under their own name (the server decides), with the look they had last time unless this phone has its own.
      const result = await roomApi<{ sessionId: string }>('/api/rooms/join', { roomCode, displayName: account.person?.name ?? name, joinId, ...(look ? { look } : {}) });
      history.replaceState(null, '', `/?room=${result.sessionId}`); setReady(true); setSessionId(result.sessionId);
    } catch (cause) { setError(cause instanceof Error && cause.message === 'ROOM_NOT_AVAILABLE' ? look.text('join.notFound') : cause instanceof Error ? cause.message : 'Joining failed. Please retry.'); } finally { setBusy(false); }
  };
  const command = (type: string, extra: Record<string, unknown> = {}) => {
    if (!state) return; const base = { formatVersion: 1, commandId: newId(), sessionId: state.view.sessionId, type };
    room.send(GameCommandSchema.parse({ ...base, ...((PLAYER_COMMANDS as readonly string[]).includes(type) ? {} : { expectedRevision: state.view.revision }), ...extra }));
  };
  const stage = state?.view.stage; const disabled = room.saving || Boolean(room.pending) || room.connection !== 'Connected';
  const remaining = useRemaining(stage, room.clockOffset); const timeUp = remaining === 0 && stage?.pausedRemainingMs === null;
  // The game's look: from the room once joined, or (on the join screen) the look of the room whose code was entered.
  const [joinLook, setJoinLook] = useState<{ title: string; presentation: LookInput } | null>(null);
  useEffect(() => {
    if (sessionId) return; const code = roomCode.trim().toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(code)) { setJoinLook(null); return; }
    let mounted = true;
    void roomApi(`/api/rooms/look/${code}`).then(data => { if (mounted) setJoinLook(RoomLookSchema.parse(data) as { title: string; presentation: LookInput }); }).catch(() => { if (mounted) setJoinLook(null); });
    return () => { mounted = false; };
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
  if (!sessionId) return <LookContext.Provider value={look}><JoinScreen style={lookStyle} className={lookClass} title={joinLook?.title ?? null} roomCode={roomCode} setRoomCode={setRoomCode} name={name} setName={setName} busy={busy} error={error} onJoin={() => { void join(); }} onReclaim={() => { setError(''); setReclaiming(true); }}
    person={account.person} linked={account.linked} onForget={() => { void account.forget().catch(() => setError('Could not sign this phone out. Try again.')); }} /></LookContext.Provider>;

  const sorted = [...room.samples].sort((a, b) => a - b); const p95 = sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)];
  const seconds = Number(timerSeconds); const validSeconds = Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600;
  // In a team round: nobody answers while teams are being made, players outside a team sit out, and a captain may answer for the team.
  const myTeam = stage ? ownTeam(stage.teams) : undefined;
  // Only while the vote is actually open: a paused room makes nobody a late joiner.
  const routeBlock = stage?.route && !stage.route.canVote && !state?.view.ownSubmission && stage.status === 'ACTIVE' && state?.view.status === 'RUNNING'
    ? stage.route.method === 'host' ? t('wait.hostRoute') : stage.teams && !stage.teams.forming && myTeam && captainAnswers(stage.teams) ? null : t('wait.lateVoter') : null;
  const answerBlock = routeBlock ?? (!stage?.teams ? null : stage.teams.forming ? t('wait.forming')
    : !myTeam ? t('wait.sitOut') : captainAnswers(stage.teams) && myTeam.captainId !== state?.selfPlayerId ? t('wait.captain', { captain: state?.players.find(player => player.id === myTeam.captainId)?.displayName ?? '', team: myTeam.name }) : null);
  const showOnly = stage?.kind === 'info' || stage?.kind === 'scoreboard';
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
    : running && stage?.status === 'ACTIVE' && !stage.teams?.forming && !showOnly ? { label: t('host.close'), run: () => command('stage.close', { stageRunId: stage.id }) }
    : running && stage?.status === 'CLOSED' && !stage.revealed && !showOnly && !stage.revealAfterVote && (stage.kind !== 'route' || stage.route?.decision) ? { label: stage.kind === 'route' ? t('host.announce') : t('host.reveal'), run: () => command('stage.reveal', { stageRunId: stage.id }) }
    : running && stage && (stage.status === 'CLOSED' || (stage.status === 'ACTIVE' && showOnly)) && (stage.kind !== 'route' || stage.route?.decision) ? { label: t('host.next'), run: () => command('stage.advance', { stageRunId: stage.id }) }
    : null;
  // What is happening now, in a word or two, above the round.
  const forming = Boolean(stage?.teams?.forming);
  const phase = !stage || stage.kind === 'info' || stage.kind === 'scoreboard' ? null : state?.view.status === 'PAUSED' ? t('phase.paused') : forming ? t('phase.teams')
    : stage.revealed ? t('phase.results') : stage.status === 'CLOSED' ? t('phase.locked')
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
      <section className="room-connection" aria-labelledby="connection-heading"><h2 id="connection-heading" className="visually-hidden">Connection</h2>
        <p role="status" aria-label="Connection status" className={`conn ${connected ? 'conn-ok' : 'conn-bad'}`}>{busy ? 'Verifying access…' : room.connection}</p>
        <button className="ghost" onClick={room.reconnect} disabled={busy}>Reconnect and sync</button>
        <details className="conn-details"><summary>Details</summary>
          <dl className="metrics"><div><dt>Latest round trip</dt><dd>{room.samples.length ? `${Math.round(room.samples.at(-1)!)} ms` : 'Measuring…'}</dd></div>
            <div><dt>p95 · last {room.samples.length} samples</dt><dd>{p95 === undefined ? 'Measuring…' : `${Math.round(p95)} ms`}</dd></div><div><dt>Reconnects</dt><dd>{room.reconnects}</dd></div><div><dt>Last saved action</dt><dd>{room.confirmMs === null ? '—' : `${room.confirmMs} ms`}</dd></div></dl>
          <p>Round trip includes the connection and the server’s access check.</p></details>
      </section>
    </header>
    {error && <p role="alert" className="error room-toast">{error}</p>}
    {room.message && <p role="status" aria-label="Action status" className="room-toast">{room.message}</p>}
    {room.pending && <div className="room-toast pending" role="region" aria-label="Unconfirmed action"><p role="status">{room.saving ? 'Sending… waiting for the server to confirm.' : 'Your last action is not confirmed yet.'}</p>
      <div className="actions"><button onClick={room.retry} disabled={room.saving}>Check / retry original action</button><button className="ghost" onClick={room.discard}>Discard pending action</button></div></div>}

    {state && <div className="room-grid">
      <div className="room-main">
        {state.view.status === 'LOBBY' && <section className="lobby" aria-labelledby="lobby-heading">
          {role === 'player' ? <><h2 id="lobby-heading">{t('lobby.playerTitle')}</h2><p>{t('lobby.playerText')}</p>
            {me && <div className="my-look"><Avatar look={me.look} size={96} /><button className="ghost" onClick={() => setEditingLook(true)}>{t('players.changeLook')}</button></div>}</>
            : <><h2 id="lobby-heading">{t('lobby.screenTitle')}</h2><div className="lobby-join"><JoinQr origin={location.origin} roomCode={state.roomCode} />
              <div><p>{t('lobby.screenGo', { host: location.host })}</p><p className="big-code">{state.roomCode}</p></div></div>
              {state.players.length > 0 && <ul className="lobby-crowd" aria-label="Players who joined">{state.players.map(player => <li key={player.id}><Avatar look={player.look} size={72} /><span>{player.displayName}</span></li>)}</ul>}</>}
        </section>}
        {stage && <section ref={stageRef} className={`stage-card kind-${stage.kind}`} aria-labelledby="stage-heading">
          {phase && <p className={`phase-pill${forming ? ' teams' : ''}`} role="status">{phase}</p>}
          {stage.info && <p className="stage-banner">{stage.info.title}</p>}
          {/* While teams are picked, the round's question waits: one thing at a time. */}
          <h2 id="stage-heading" className={stage.info ? 'visually-hidden' : undefined}>{forming ? t('phase.teams') : stage.info?.title ?? (stage.scoreboard ? 'Scoreboard' : stage.prompt)}</h2>
          {stage.info && <p className="info-text">{stage.prompt}</p>}
          {forming && role === 'player' && <p className="wait-note">{t('wait.forming')}</p>}
          <TeamForming state={state} stage={stage} disabled={disabled} send={command} />
          <TeamSummary state={state} stage={stage} />
          {!stage.teams?.forming && <div ref={timerRef}><StageTimer stage={stage} remaining={remaining} /></div>}
          {!forming && <><div ref={answersRef} className="answers-slot">{role !== 'player' && stage.input && stage.input.kind !== 'text' && stage.input.kind !== 'media' && !stage.revealed && <OptionsBoard input={stage.input} />}
          {stage.kind === 'vote' && !stage.revealed && <VoteBallot state={state} stage={stage} disabled={disabled || timeUp} canVote={role === 'player' && !answerBlock && !state.view.ownSubmission && stage.status === 'ACTIVE' && running}
            onVote={submissionId => command('submission.submit', { stageRunId: stage.id, value: { kind: 'vote', submissionId } })} />}
          {stage.kind !== 'challenge' && stage.kind !== 'route' && !showOnly && !stage.revealed && <p className="progress-line">{t(stage.kind === 'vote' ? 'progress.voted' : 'progress.answered', { count: stage.submittedCount, total: stage.eligibleCount })}{stage.status === 'CLOSED' ? ` · ${t('progress.locked')}` : ''}</p>}
          {host && stage.kind === 'challenge' && stage.status === 'CLOSED' && !stage.revealed && running && <JudgePanel state={state} stage={stage} disabled={disabled} send={command} />}
          {stage.kind === 'minigame' && <MinigameStage state={state} stage={stage} offset={room.clockOffset} disabled={disabled}
            canPlay={role === 'player' && !answerBlock && stage.status === 'ACTIVE' && running}
            onResult={result => command('submission.submit', { stageRunId: stage.id, value: { kind: 'minigame', ...result } })}
            live={minigameLive} onPart={(turn, assetId) => command('minigame.part', { stageRunId: stage.id, turn, assetId })} />}
          <RouteChoice state={state} stage={stage} disabled={disabled} send={command} />
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
              <AnswerInput sessionId={state.view.sessionId} input={stage.input} draft={draft} onChange={setDraft} legend={stage.kind === 'route' ? t('vote.legend') : t('answer.legend')} />
              <button className="primary" disabled={disabled || !draftValue(stage.input, draft) || timeUp}>{timeUp ? t('timer.up') : stage.kind === 'route' ? t('vote.submit') : t('answer.submit')}</button></form>
            : role === 'player' ? <p className="wait-note">{stage.kind === 'challenge' ? t('wait.challenge') : stage.kind === 'vote' || showOnly ? '' : t('wait.screen')}</p> : null}</div></>}
        </section>}
        {role !== 'display' && <WheelBadge wheel={state.view.wheel} />}
        {state.view.status === 'FINISHED' && <FinaleShow state={state} />}
        {/* Phones keep the scores one tap away (the dock). The shared screen shows them with the results of a round, at scoreboard scenes and at the end: nothing it does not need. */}
        {(role === 'host' || scoreMoment || (role === 'display' && stage?.revealed)) && canSeeScores && <div ref={scoresRef}><Scoreboard state={state} disabled={disabled} send={command} /></div>}
      </div>

      {host && <aside className="room-controls" aria-label="Host controls">
        {primary && <button className="primary big" disabled={disabled} onClick={primary.run}>{primary.label}</button>}
        {nextAlso && <button disabled={disabled} onClick={() => command('stage.advance', { stageRunId: stage!.id })}>{t('host.next')}</button>}
        {running && stage && state.view.wheel.canSpin && <button disabled={disabled} onClick={() => command('wheel.spin', { stageRunId: stage.id })}>{state.view.wheel.spin ? t('wheel.again') : t('wheel.spin')}</button>}
        <div className="actions">
          {running && <button className="ghost" disabled={disabled} onClick={() => command('session.pause')}>{t('host.pause')}</button>}
          {running && <button className="ghost" disabled={disabled} onClick={() => { void roomApi(`/api/rooms/${sessionId}/break`, {}).catch(() => setError('The break could not be started.')); }}>{t('break.icon')} {t('break.vote')}</button>}
          {running && stage?.status === 'CLOSED' && !stage.revealed && !showOnly && !stage.route?.decision && stage.route?.method !== 'host' && <>
            <button className="ghost" disabled={disabled} onClick={() => command('stage.reopen', { stageRunId: stage.id, durationMs: 30_000 })}>Reopen for 30 seconds</button>
            <button className="ghost" disabled={disabled} onClick={() => command('stage.reopen', { stageRunId: stage.id, durationMs: null })}>Reopen without time limit</button></>}
        </div>
        {stage && stage.status === 'ACTIVE' && !stage.teams?.forming && <div className="timer-controls" role="group" aria-label="Time controls">
          <h3>Time</h3>
          {remaining !== null && <><button className="ghost" disabled={disabled} onClick={() => timer({ kind: 'add', ms: 30_000 })}>Add 30 seconds</button>
            <button className="ghost" disabled={disabled} onClick={() => timer({ kind: 'add', ms: 60_000 })}>Add 1 minute</button>
            <button className="ghost" disabled={disabled} onClick={() => timer({ kind: 'clear' })}>Remove time limit</button></>}
          <form className="inline-form" onSubmit={event => { event.preventDefault(); if (validSeconds) timer({ kind: 'set', ms: seconds * 1000 }); }}>
            <label>Time left (seconds)<input type="number" inputMode="numeric" min={1} max={3600} step={1} value={timerSeconds} onChange={event => setTimerSeconds(event.target.value)} /></label>
            <button className="ghost" disabled={disabled || !validSeconds}>Set time</button></form>
        </div>}
        <div className="control-block"><h3>Shared screen</h3>
          <button className="ghost" onClick={() => { void roomApi<{ token: string }>(`/api/rooms/${sessionId}/display`, {}).then(result => setDisplayUrl(`${location.origin}/?room=${sessionId}&display=1#access=${result.token}`)).catch(() => setError('Display access could not be created.')); }}>Create display link</button>
          {displayUrl && <p><a href={displayUrl} target="_blank" rel="noreferrer">Open shared display</a> on the TV or a second screen.</p>}
          {state.view.status !== 'LOBBY' && <JoinQr origin={location.origin} roomCode={state.roomCode} />}
        </div>
        <RoomSettings state={state} sessionId={state.view.sessionId} onError={setError} />
        <SeatRequests state={state} sessionId={state.view.sessionId} onError={setError} />
        <p><a href="/?host=1">Back to the host menu</a></p>
      </aside>}
    </div>}
    {state && me && editingLook && <div className="look-sheet" role="dialog" aria-modal="true" aria-labelledby="look-builder-heading" onKeyDown={event => { if (event.key === 'Escape') setEditingLook(false); }}><LookBuilder initial={me.look} name={me.displayName} busy={disabled} sessionId={state.view.sessionId}
      onCancel={() => setEditingLook(false)} onSave={next => { rememberLook(next); command('player.look', { look: next }); setEditingLook(false); }} /></div>}
    {state && <WheelOverlay wheel={state.view.wheel} offset={room.clockOffset} />}
    {state && role === 'display' && <WheelBadge wheel={state.view.wheel} />}
    {state && <BreakOverlay state={state} host={host} disabled={disabled} onContinue={() => command('session.resume')} />}
    {state && role === 'player' && <PhoneDock state={state} canSeeScores={canSeeScores} onChangeLook={() => setEditingLook(true)} onReact={room.sendReaction}
      onBreak={vote => { void roomApi(`/api/rooms/${sessionId}/break`, { vote }).catch(() => setError('Your vote did not go through. Try again.')); }}
      scores={<Scoreboard state={state} disabled={disabled} send={command} />} />}
    {state && role === 'player' && <PointsCelebration roundId={stage?.revealed ? stage.id : null} points={ownPoints ? Number(ownPoints) / 1000 : null} label={ownPoints ? formatPoints(ownPoints) : ''} />}
    {state && role !== 'player' && state.settings.reactions && <ReactionsOverlay state={state} store={room.reactions} />}
    {state && role === 'host' && <section className="players" aria-labelledby="players-heading"><h2 id="players-heading">{t('players.title', { count: state.players.length })}</h2>
      {me && state.view.status !== 'LOBBY' && <button className="small-button ghost change-look" onClick={() => setEditingLook(true)}>{t('players.changeLook')}</button>}
      <ul ref={playersRef}>{state.players.map(player => <li key={player.id} className={player.connected ? 'online' : 'offline'}><span className="dot" aria-hidden="true" /><Avatar look={player.look} size={28} />{player.displayName}{player.id === state.selfPlayerId ? ' (you)' : ''}<span className="visually-hidden"> · </span><span className="player-state">{player.connected ? 'connected' : 'disconnected'}</span>
        {host && player.look.picture && <button className="small-button ghost" aria-label={`Remove the picture of ${player.displayName}`} onClick={() => command('player.removePicture', { playerId: player.id })}>Remove picture</button>}
        {host && <button className="small-button ghost" aria-label={`Revoke access for ${player.displayName}`} onClick={() => { void roomApi(`/api/rooms/${sessionId}/revoke`, { playerId: player.id }).catch(() => setError('Could not revoke access.')); }}>Revoke access</button>}</li>)}</ul>
    </section>}
  </main></RoomSessionContext.Provider></LookContext.Provider>;
}

type StageInput = NonNullable<NonNullable<ReturnType<typeof useRoom>['snapshot']>['view']['stage']>['input'];
/** The answers as the shared screen and host see them: the same colours as the phone tiles, not clickable. */
function OptionsBoard({ input }: { input: NonNullable<StageInput> }) {
  const entries = input.kind === 'choice' ? input.options : input.kind === 'order' ? input.items : [];
  if (!entries.length) return null;
  return <ol className={`options-board${input.kind === 'order' ? ' order' : ''}`} aria-label={input.kind === 'order' ? 'Items to put in order' : 'Answers'}>
    {entries.map((entry, index) => <li key={entry.key}><span aria-hidden="true">{input.kind === 'order' ? '•' : String.fromCharCode(65 + index)}</span>{entry.label}</li>)}</ol>;
}
