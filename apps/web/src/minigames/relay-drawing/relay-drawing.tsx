import { useEffect, useRef, useState } from 'react';
import { ANIMATION_WORDS, emptyDrawing, MinigameValueSchema, type Drawing, type MinigameSettings, type RoomSnapshot, type Stroke } from '@party/contracts';
import { useLiveStrokes, type LiveStrokes } from '../../drawing/live-strokes.js';
import type { MinigameLive } from '../shared/minigame-stage.js';
import { translate, useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import { PagedResultList } from '../../ui/paged-result-list.js';
import { useText } from '../../presentation/look.js';
import { DrawingPad } from '../../drawing/drawing-pad.js';
import { DrawingView, uploadDrawing, useDrawings } from '../../drawing/drawing-view.js';
import { ANIMATION_TEXTS, DrawingAnimation, useAnimationWords } from './animation-relay.js';
import { Countdown } from '../shared/countdown.js';
import { useServerNow } from '../shared/clock.js';
import './relay-drawing.css';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Relay = NonNullable<NonNullable<Stage['minigame']>['relay']>;
type Team = Relay['teams'][number];
const nameOf = (state: RoomSnapshot, playerId: string | undefined) => state.players.find(player => player.id === playerId)?.displayName ?? translate(CONTROL_TEXTS, 'someone');

/** A team's picture so far: its saved turns, plus the strokes of turns still being drawn, as they come in. */
function TeamPicture({ sessionId, stageRunId, team, strokes, label }: { sessionId: string; stageRunId: string; team: Team; strokes: LiveStrokes; label: string }) {
  const parts = useDrawings(sessionId, team.parts.map(part => part.assetId)); useLiveStrokes(strokes);
  const live = strokes.strokes(stageRunId, team.teamId, new Set(team.parts.map(part => part.turn)));
  return <DrawingView drawings={[...parts, ...(live.length ? [{ v: 1 as const, strokes: live }] : [])]} label={label} />;
}

/**
 * Pass the pencil. All teams draw at the same time, one member per team per
 * turn, each adding to their team's picture; then everyone votes for the best
 * picture of another team. Every screen can watch the pictures grow.
 */
export function RelayDrawing({ state, stage, offset, canPlay, disabled, onVote, onPart, live }: {
  state: RoomSnapshot; stage: Stage; offset: number; canPlay: boolean; disabled: boolean; onVote: (teamId: string, word?: number) => void; onPart: (turn: number, assetId: string) => void; live: MinigameLive;
}) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const minigame = stage.minigame!; const relay = minigame.relay; const settings = minigame.settings as MinigameSettings<'relay-drawing'>;
  const a = useTexts(ANIMATION_TEXTS);
  const words = useAnimationWords();
  const now = useServerNow(offset, Boolean(minigame.startsAt));
  if (!relay || !minigame.startsAt) return <p className="wait-note">{t('wait.forming')}</p>;
  const start = Date.parse(minigame.startsAt); const turnMs = settings.secondsPerTurn * 1000; const voteAt = relay.voteAt ? Date.parse(relay.voteAt) : start + relay.turns * turnMs;
  const turn = now >= start && now < voteAt ? Math.floor((now - start) / turnMs) : null; const voting = now >= voteAt;
  const turnLeft = turn === null ? 0 : start + (turn + 1) * turnMs - now;
  const drawerOf = (team: Team, at: number) => team.drawers[at % team.drawers.length];
  const me = state.selfPlayerId; const mine = relay.teams.find(team => team.drawers.includes(me ?? ''));
  const sessionId = state.view.sessionId;

  if (state.role !== 'player') return <div className="mg-relay-screen">
    <p className="mg-sub">{voting ? (settings.animation ? a('guess') : t('minigame.voteBest')) : turn !== null ? c('turnCount', { turn: turn + 1, total: relay.turns, seconds: Math.ceil(turnLeft / 1000) }) : t('minigame.getReady')}</p>
    <ul className="drawing-gallery">{relay.teams.map(team => <li key={team.teamId}>{settings.animation
      ? <DrawingAnimation sessionId={sessionId} assetIds={team.parts.map(part => part.assetId)} label={c('drawingOf', { name: team.name })} />
      : <TeamPicture sessionId={sessionId} stageRunId={stage.id} strokes={live.strokes} team={team} label={c('drawingOf', { name: team.name })} />}
      <span>{team.name}{turn !== null ? ` · ${c('draws', { name: nameOf(state, drawerOf(team, turn)) })}` : ''}</span></li>)}</ul>
  </div>;

  if (now < start) return <Countdown startsAt={minigame.startsAt} offset={offset}>{null}</Countdown>;
  if (!mine || !canPlay) return <p className="wait-note">{t('wait.sitOut')}</p>;
  if (voting && settings.animation) {
    const captain = stage.teams?.teams.find(team => team.teamId === mine.teamId)?.captainId;
    if (stage.teams?.answers === 'captain' && captain !== me) return <p className="wait-note">{t('wait.captain', { captain: nameOf(state, captain ?? undefined), team: mine.name })}</p>;
    const guessLeft = relay.guessUntil ? Math.max(0, Math.ceil((Date.parse(relay.guessUntil) - now) / 1000)) : null;
    return <>{guessLeft !== null && <p>{guessLeft > 0 ? t('timer.left', { time: `${Math.floor(guessLeft / 60)}:${String(guessLeft % 60).padStart(2, '0')}` }) : t('timer.up')}</p>}
      <AnimationGuess state={state} relay={relay} disabled={disabled || guessLeft === 0} onVote={onVote} /></>;
  }
  if (voting) return <RelayVote state={state} relay={relay} mine={mine} disabled={disabled} onVote={onVote} live={live} />;
  const myTurn = turn !== null && drawerOf(mine, turn) === me && !mine.parts.some(part => part.turn === turn);
  const next = Array.from({ length: relay.turns }, (_, at) => at).find(at => turn !== null && at > turn && drawerOf(mine, at) === me);
  return <div className="mg-relay">
    {relay.animation && <p className="mg-sub"><strong>{a('draw', { word: words[relay.animation.prompt]! })}</strong></p>}
    {myTurn ? <MyTurn key={turn} sessionId={sessionId} stageRunId={stage.id} team={mine} animation={Boolean(settings.animation)} turn={turn!} turnLeft={turnLeft} disabled={disabled} onPart={onPart} sendStroke={live.sendStroke} />
      : <><p className="mg-sub">{turn !== null ? t('minigame.theirTurn', { name: nameOf(state, drawerOf(mine, turn)) }) : ''}{next !== undefined ? ` · ${c('nextTurn', { seconds: Math.ceil((start + next * turnMs - now) / 1000) })}` : ''}</p>
        {settings.animation
          ? <DrawingAnimation sessionId={sessionId} assetIds={mine.parts.map(part => part.assetId)} label={c('teamDrawing')} />
          : <TeamPicture sessionId={sessionId} stageRunId={stage.id} strokes={live.strokes} team={mine} label={c('teamDrawing')} />}</>}
  </div>;
}

/** This player's turn: draw on top of the team's picture; the strokes are sent when the turn ends (or earlier, when done). */
function MyTurn({ sessionId, stageRunId, team, animation, turn, turnLeft, disabled, onPart, sendStroke }: { sessionId: string; stageRunId: string; team: Team; animation: boolean; turn: number; turnLeft: number; disabled: boolean; onPart: (turn: number, assetId: string) => void; sendStroke: MinigameLive['sendStroke'] }) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const [drawing, setDrawing] = useState(emptyDrawing()); const sent = useRef(false); const [error, setError] = useState('');
  const parts = useDrawings(sessionId, team.parts.map(part => part.assetId));
  const latest = useRef(drawing); latest.current = drawing;
  // Others see the strokes as they are drawn: a growing stroke at most every 100 ms, every finished stroke, and undo.
  const lastSent = useRef(0);
  const progress = (stroke: Stroke, strokeId: number) => { const at = performance.now(); if (at - lastSent.current < 100) return; lastSent.current = at; sendStroke({ stageRunId, turn, strokeId, stroke, count: strokeId + 1 }); };
  const change = (next: Drawing) => {
    const previous = latest.current.strokes.length; setDrawing(next);
    if (next.strokes.length > previous) sendStroke({ stageRunId, turn, strokeId: next.strokes.length - 1, stroke: next.strokes.at(-1)!, count: next.strokes.length });
    else if (next.strokes.length < previous) sendStroke({ stageRunId, turn, strokeId: next.strokes.length, stroke: null, count: next.strokes.length });
  };
  const send = () => {
    if (sent.current) return; sent.current = true;
    void uploadDrawing(sessionId, 'part', latest.current).then(result => onPart(turn, result.assetId)).catch(() => { sent.current = false; setError(c('sendFailed')); });
  };
  // At the end of the turn the strokes go, whatever is drawn (an empty turn is allowed).
  useEffect(() => { if (turnLeft <= 300) send(); });
  return <div className="mg-turn">
    <p className="mg-sub"><strong>{t('minigame.yourTurn')}</strong> · {Math.ceil(turnLeft / 1000)} s</p>
    <DrawingPad value={drawing} onChange={change} onStrokeProgress={progress} under={animation ? [] : parts} disabled={disabled || sent.current} label={c('teamDrawingTurn')} />
    {error && <p role="alert" className="error">{error}</p>}
    <button type="button" className="primary" disabled={disabled || sent.current} onClick={send}>{t('drawing.submit')}</button>
  </div>;
}

function RelayVote({ state, relay, mine, disabled, onVote, live }: { state: RoomSnapshot; relay: Relay; mine: Team; disabled: boolean; onVote: (teamId: string) => void; live: MinigameLive }) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const [choice, setChoice] = useState('');
  const own = state.view.ownSubmission ? MinigameValueSchema.safeParse(state.view.ownSubmission.value) : null;
  if (own?.success) return <p role="status" className="answer-in">{t('vote.saved')}</p>;
  const others = relay.teams.filter(team => team.teamId !== mine.teamId);
  return <form className="mg-relay-vote" onSubmit={event => { event.preventDefault(); if (choice) onVote(choice); }}>
    <fieldset><legend>{t('minigame.voteBest')}</legend><PagedResultList className="drawing-gallery" pageSize={2} rows={others.map(team => <li key={team.teamId}>
      <label className="choice"><input type="radio" name="relay-vote" value={team.teamId} checked={choice === team.teamId} onChange={() => setChoice(team.teamId)} />{team.name}</label>
      <TeamPicture sessionId={state.view.sessionId} stageRunId={relay ? state.view.stage!.id : ''} strokes={live.strokes} team={team} label={c('drawingOf', { name: team.name })} /></li>)} /></fieldset>
    <button className="primary" disabled={disabled || !choice}>{t('vote.submit')}</button>
  </form>;
}

function AnimationGuess({ state, relay, disabled, onVote }: {
  state: RoomSnapshot; relay: Relay; disabled: boolean; onVote: (teamId: string, word: number) => void;
}) {
  const t = useText();
  const a = useTexts(ANIMATION_TEXTS);
  const words = useAnimationWords();
  const [choice, setChoice] = useState<number>();
  const other = relay.teams.find(team => team.teamId === relay.animation?.targetTeamId);
  if (state.view.ownSubmission) return <p role="status" className="answer-in">{t('vote.saved')}</p>;
  if (!other) return <p className="wait-note">{a('needTeams')}</p>;
  if (!other.parts.length) return <p className="wait-note">{a('waiting')}</p>;
  return <form className="mg-relay-vote" onSubmit={event => { event.preventDefault(); if (choice !== undefined) onVote(other.teamId, choice); }}>
    <DrawingAnimation sessionId={state.view.sessionId} assetIds={other.parts.map(part => part.assetId)} label={other.name} />
    <fieldset><legend>{a('guess')}</legend><PagedResultList className="animation-choices" pageSize={4} rows={ANIMATION_WORDS.map((word, index) =>
      <li key={word}><label className="choice"><input type="radio" name="animation-guess" checked={choice === index} onChange={() => setChoice(index)} />{words[index]}</label></li>)} /></fieldset>
    <button className="primary" disabled={disabled || choice === undefined}>{t('vote.submit')}</button>
  </form>;
}
