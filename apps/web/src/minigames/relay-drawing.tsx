import { useEffect, useRef, useState } from 'react';
import { emptyDrawing, MinigameValueSchema, type Drawing, type MinigameSettings, type RoomSnapshot, type Stroke } from '@party/contracts';
import { useLiveStrokes, type LiveStrokes } from '../drawing/live-strokes.js';
import type { MinigameLive } from './minigame-stage.js';
import { useText } from '../presentation/look.js';
import { DrawingPad } from '../drawing/drawing-pad.js';
import { DrawingView, uploadDrawing, useDrawings } from '../drawing/drawing-view.js';
import { Countdown } from './controllers.js';
import { useServerNow } from './clock.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Relay = NonNullable<NonNullable<Stage['minigame']>['relay']>;
type Team = Relay['teams'][number];
const nameOf = (state: RoomSnapshot, playerId: string | undefined) => state.players.find(player => player.id === playerId)?.displayName ?? 'Someone';

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
  state: RoomSnapshot; stage: Stage; offset: number; canPlay: boolean; disabled: boolean; onVote: (teamId: string) => void; onPart: (turn: number, assetId: string) => void; live: MinigameLive;
}) {
  const t = useText(); const minigame = stage.minigame!; const relay = minigame.relay; const settings = minigame.settings as MinigameSettings<'relay-drawing'>;
  const now = useServerNow(offset, Boolean(minigame.startsAt));
  if (!relay || !minigame.startsAt) return <p className="wait-note">{t('wait.forming')}</p>;
  const start = Date.parse(minigame.startsAt); const turnMs = settings.secondsPerTurn * 1000; const voteAt = relay.voteAt ? Date.parse(relay.voteAt) : start + relay.turns * turnMs;
  const turn = now >= start && now < voteAt ? Math.floor((now - start) / turnMs) : null; const voting = now >= voteAt;
  const turnLeft = turn === null ? 0 : start + (turn + 1) * turnMs - now;
  const drawerOf = (team: Team, at: number) => team.drawers[at % team.drawers.length];
  const me = state.selfPlayerId; const mine = relay.teams.find(team => team.drawers.includes(me ?? ''));
  const sessionId = state.view.sessionId;

  if (state.role !== 'player') return <div className="mg-relay-screen">
    <p className="mg-sub">{voting ? t('minigame.voteBest') : turn !== null ? `Turn ${turn + 1} of ${relay.turns} · ${Math.ceil(turnLeft / 1000)} s` : t('minigame.getReady')}</p>
    <ul className="drawing-gallery">{relay.teams.map(team => <li key={team.teamId}><TeamPicture sessionId={sessionId} stageRunId={stage.id} strokes={live.strokes} team={team} label={`Drawing of ${team.name}`} />
      <span>{team.name}{turn !== null ? ` · ${nameOf(state, drawerOf(team, turn))} draws` : ''}</span></li>)}</ul>
  </div>;

  if (now < start) return <Countdown startsAt={minigame.startsAt} offset={offset}>{null}</Countdown>;
  if (!mine || !canPlay) return <p className="wait-note">{t('wait.sitOut')}</p>;
  if (voting) return <RelayVote state={state} relay={relay} mine={mine} disabled={disabled} onVote={onVote} live={live} />;
  const myTurn = turn !== null && drawerOf(mine, turn) === me && !mine.parts.some(part => part.turn === turn);
  const next = Array.from({ length: relay.turns }, (_, at) => at).find(at => turn !== null && at > turn && drawerOf(mine, at) === me);
  return <div className="mg-relay">
    {myTurn ? <MyTurn key={turn} sessionId={sessionId} stageRunId={stage.id} team={mine} turn={turn!} turnLeft={turnLeft} disabled={disabled} onPart={onPart} sendStroke={live.sendStroke} />
      : <><p className="mg-sub">{turn !== null ? t('minigame.theirTurn', { name: nameOf(state, drawerOf(mine, turn)) }) : ''}{next !== undefined ? ` · your turn in ${Math.ceil((start + next * turnMs - now) / 1000)} s` : ''}</p>
        <TeamPicture sessionId={sessionId} stageRunId={stage.id} strokes={live.strokes} team={mine} label={`Your team's drawing`} /></>}
  </div>;
}

/** This player's turn: draw on top of the team's picture; the strokes are sent when the turn ends (or earlier, when done). */
function MyTurn({ sessionId, stageRunId, team, turn, turnLeft, disabled, onPart, sendStroke }: { sessionId: string; stageRunId: string; team: Team; turn: number; turnLeft: number; disabled: boolean; onPart: (turn: number, assetId: string) => void; sendStroke: MinigameLive['sendStroke'] }) {
  const t = useText(); const [drawing, setDrawing] = useState(emptyDrawing()); const sent = useRef(false); const [error, setError] = useState('');
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
    void uploadDrawing(sessionId, 'part', latest.current).then(result => onPart(turn, result.assetId)).catch(() => { sent.current = false; setError('Sending failed. Trying again…'); });
  };
  // At the end of the turn the strokes go, whatever is drawn (an empty turn is allowed).
  useEffect(() => { if (turnLeft <= 300) send(); });
  return <div className="mg-turn">
    <p className="mg-sub"><strong>{t('minigame.yourTurn')}</strong> · {Math.ceil(turnLeft / 1000)} s</p>
    <DrawingPad value={drawing} onChange={change} onStrokeProgress={progress} under={parts} disabled={disabled || sent.current} label="Your team's drawing, your turn" bringIntoView />
    {error && <p role="alert" className="error">{error}</p>}
    <button type="button" className="primary" disabled={disabled || sent.current} onClick={send}>{t('drawing.submit')}</button>
  </div>;
}

function RelayVote({ state, relay, mine, disabled, onVote, live }: { state: RoomSnapshot; relay: Relay; mine: Team; disabled: boolean; onVote: (teamId: string) => void; live: MinigameLive }) {
  const t = useText(); const [choice, setChoice] = useState('');
  const own = state.view.ownSubmission ? MinigameValueSchema.safeParse(state.view.ownSubmission.value) : null;
  if (own?.success) return <p role="status" className="answer-in">{t('vote.saved')}</p>;
  const others = relay.teams.filter(team => team.teamId !== mine.teamId);
  return <form className="mg-relay-vote" onSubmit={event => { event.preventDefault(); if (choice) onVote(choice); }}>
    <fieldset><legend>{t('minigame.voteBest')}</legend><ul className="drawing-gallery">{others.map(team => <li key={team.teamId}>
      <label className="choice"><input type="radio" name="relay-vote" value={team.teamId} checked={choice === team.teamId} onChange={() => setChoice(team.teamId)} />{team.name}</label>
      <TeamPicture sessionId={state.view.sessionId} stageRunId={relay ? state.view.stage!.id : ''} strokes={live.strokes} team={team} label={`Drawing of ${team.name}`} /></li>)}</ul></fieldset>
    <button className="primary" disabled={disabled || !choice}>{t('vote.submit')}</button>
  </form>;
}
