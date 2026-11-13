import { useCallback, useRef } from 'react';
import type { Stroke } from '@party/contracts';
import type { LiveStrokes } from '../drawing/live-strokes.js';
import { defaultLook, formatMinigameResult, MINIGAMES, MinigameValueSchema, type MinigameKey, type MinigameSettings, type RoomSnapshot } from '@party/contracts';
import { useText } from '../presentation/look.js';
import { Avatar } from '../players/avatar.js';
import { formatPoints } from '../network/results.js';
import { teamName } from '../network/teams.js';
import { LuckyDoors, PerfectCircle, ReactionPad, StopClock, TapRace, type Result } from './controllers.js';
import { RelayDrawing } from './relay-drawing.js';
import { DrawingView, StoredDrawing } from '../drawing/drawing-view.js';
import { useServerNow } from './clock.js';
import './minigames.css';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Minigame = NonNullable<Stage['minigame']>;
/** Live signals from the room connection (see use-room.ts). */
export interface MinigameLive { strokes: LiveStrokes; sendStroke: (message: { stageRunId: string; turn: number; strokeId: number; stroke: Stroke | null; count: number }) => void; go: { stageRunId: string; goAt: string } | null; progress: { stageRunId: string; counts: { playerId: string; count: number }[] } | null; sendTaps: (stageRunId: string, count: number) => void }
const CONTROLLERS = { reaction: ReactionPad, 'tap-race': TapRace, 'stop-clock': StopClock, 'lucky-doors': LuckyDoors, 'perfect-circle': PerfectCircle } as const;

/**
 * A running minigame. Phones get the controls (or their own result once sent);
 * the shared screen and host see how to play, the countdown and GO.
 */
export function MinigameStage({ state, stage, offset, canPlay, disabled, onResult, live, onPart }: { state: RoomSnapshot; stage: Stage; offset: number; canPlay: boolean; disabled: boolean; onResult: (result: Result) => void; live: MinigameLive; onPart: (turn: number, assetId: string) => void }) {
  const t = useText(); const minigame = stage.minigame!; const info = MINIGAMES[minigame.game];
  const own = state.view.ownSubmission ? MinigameValueSchema.safeParse(state.view.ownSubmission.value) : null;
  // Stable callbacks: the controllers redraw every frame, and their timers must not restart each time.
  const latest = useRef({ onResult, live }); latest.current = { onResult, live };
  const send = useCallback((result: Result) => latest.current.onResult(result), []);
  const sendTaps = useCallback((count: number) => latest.current.live.sendTaps(stage.id, count), [stage.id]);
  // GO from the snapshot, or sooner from the live announcement of this run.
  const goAt = minigame.goAt ?? (live.go && live.go.stageRunId === stage.id && minigame.startsAt && Date.parse(live.go.goAt) >= Date.parse(minigame.startsAt) ? live.go.goAt : null);
  if (stage.revealed) return null;
  const settings = minigame.settings as MinigameSettings;
  if (minigame.game === 'relay-drawing') return state.view.status === 'PAUSED' ? <p className="wait-note" role="status">{t('minigame.paused')}</p>
    : <RelayDrawing state={state} stage={stage} offset={offset} canPlay={canPlay} disabled={disabled} onVote={teamId => send({ value: 0, teamId })} onPart={onPart} live={live} />;
  if (state.role === 'player') {
    if (own?.success) return <div className="mg-done" role="status"><p className="mg-big">{own.data.early ? t('minigame.tooSoon') : formatMinigameResult(minigame.game, own.data.value, settings)}</p><p>{t('minigame.played')}</p></div>;
    if (state.view.status === 'PAUSED') return <p className="wait-note" role="status">{t('minigame.paused')}</p>;
    if (!canPlay || !minigame.startsAt) return <p className="wait-note">{info.howToPlay}</p>;
    const Controller = CONTROLLERS[minigame.game as keyof typeof CONTROLLERS] as (props: { settings: MinigameSettings; startsAt: string; goAt: string | null; offset: number; disabled: boolean; onResult: (result: Result) => void; onTaps: (count: number) => void }) => React.ReactElement;
    return <div className={`mg-play mg-${minigame.game}`}>
      <p className="mg-how">{info.howToPlay}</p>
      {/* A new start (after a pause) begins a fresh game on the phone. */}
      <Controller key={minigame.startsAt} settings={settings} startsAt={minigame.startsAt} goAt={goAt} offset={offset} disabled={disabled} onResult={send} onTaps={sendTaps} />
    </div>;
  }
  return <ScreenView state={state} minigame={{ ...minigame, goAt }} offset={offset} progress={live.progress?.stageRunId === stage.id ? live.progress.counts : []} />;
}

/** The TV: name, how to play, the countdown and (in a reaction duel) the GO everyone waits for. */
function ScreenView({ state, minigame, offset, progress }: { state: RoomSnapshot; minigame: Minigame; offset: number; progress: { playerId: string; count: number }[] }) {
  const t = useText(); const info = MINIGAMES[minigame.game]; const now = useServerNow(offset, Boolean(minigame.startsAt));
  const left = minigame.startsAt ? Date.parse(minigame.startsAt) - now : null;
  const go = minigame.goAt ? now >= Date.parse(minigame.goAt) : false;
  return <div className={`mg-screen mg-${minigame.game}`}>
    <p className="mg-name">{info.name}</p>
    <p className="mg-how">{info.howToPlay}</p>
    {left !== null && left > 0 ? <p className="mg-big" role="timer" aria-label="Starts in">{Math.ceil(left / 1000)}</p>
      : minigame.game === 'reaction' && minigame.startsAt ? <p className={`mg-big ${go ? 'go' : 'wait'}`}>{go ? t('minigame.go') : t('minigame.wait')}</p>
      : minigame.game === 'tap-race' && minigame.startsAt ? <RaceBars state={state} progress={progress} />
      : minigame.game === 'lucky-doors' ? <p className="mg-sub">{t('minigame.pickDoor')} · {(minigame.settings as MinigameSettings<'lucky-doors'>).doorsMilli.map(formatPoints).join(' · ')}</p> : null}
  </div>;
}

/** Live race: one bar per player, growing with every tap the server sees. */
function RaceBars({ state, progress }: { state: RoomSnapshot; progress: { playerId: string; count: number }[] }) {
  const t = useText(); const most = Math.max(10, ...progress.map(entry => entry.count));
  const rows = [...progress].sort((a, b) => b.count - a.count).slice(0, 12);
  if (!rows.length) return <p className="mg-big">{t('minigame.tap')}</p>;
  return <ol className="mg-race" aria-label="Taps so far">{rows.map(entry => <li key={entry.playerId}>
    <Avatar look={lookOf(state, entry.playerId)} size={32} /><span className="mg-race-name">{nameOf(state, entry.playerId)}</span>
    <span className="mg-race-track" aria-hidden="true"><span style={{ width: `${Math.round(entry.count / most * 100)}%` }} /></span><span className="mg-race-count">{entry.count}</span></li>)}</ol>;
}

const lookOf = (state: RoomSnapshot, playerId: string | null) => state.players.find(player => player.id === playerId)?.look ?? defaultLook(playerId ?? 'former');
const nameOf = (state: RoomSnapshot, playerId: string | null) => state.players.find(player => player.id === playerId)?.displayName ?? 'Former player';

function RelayPictures({ state, relay }: { state: RoomSnapshot; relay: NonNullable<Minigame['relay']> }) {
  return <ul className="drawing-gallery">{relay.teams.map(team => <li key={team.teamId}><StoredDrawing sessionId={state.view.sessionId} assetIds={team.parts.map(part => part.assetId)} label={`Drawing of ${team.name}`} /><span>{team.name}</span></li>)}</ul>;
}

/** After the reveal: the podium, everyone's result, and what was behind each door. */
export function MinigameResults({ state, answer }: { state: RoomSnapshot; answer: Extract<NonNullable<NonNullable<Stage['reveal']>['answer']>, { kind: 'minigame' }> }) {
  const t = useText(); const game = answer.game as MinigameKey;
  const settings = (state.view.stage?.minigame?.settings ?? MINIGAMES[game].defaults) as MinigameSettings;
  const teams = answer.entries.filter(entry => entry.playerId === null); const players = answer.entries.filter(entry => entry.playerId !== null);
  const teamResult = (value: number | null) => value === null ? 'No result' : game === 'relay-drawing' ? formatMinigameResult(game, value, settings) : game === 'tap-race' ? `${value} taps` : game === 'stop-clock' ? `${(value / 1000).toFixed(2)} s off` : `${value} ms`;
  return <div className="mg-results">
    {game === 'relay-drawing' && state.view.stage?.minigame?.relay && <RelayPictures state={state} relay={state.view.stage.minigame.relay} />}
    {answer.doorsMilli && <><h4>{t('minigame.behindDoors')}</h4><ol className="mg-doors revealed">{answer.doorsMilli.map((milli, index) => <li key={index} className="mg-door">{t('minigame.door', { number: index + 1 })}<strong>{formatPoints(milli)}</strong></li>)}</ol></>}
    {teams.length > 0 && <><h4>{t('minigame.places')}</h4><ol className="mg-podium">{teams.map(entry => <li key={entry.teamId} className={entry.place === 1 ? 'first' : undefined}>
      <span className="mg-place">{entry.place ?? '–'}</span><strong>{teamName(state, entry.teamId!)}</strong><span>{teamResult(entry.value)}</span></li>)}</ol></>}
    {players.length > 0 && <><h4>{teams.length ? 'Everyone' : game === 'lucky-doors' ? 'Who chose which door' : t('minigame.places')}</h4><ol className="mg-podium">{players.map(entry => <li key={entry.playerId} className={entry.place === 1 ? 'first' : undefined}>
      <span className="mg-place">{teams.length || game === 'lucky-doors' ? '' : entry.place ?? '–'}</span><Avatar look={lookOf(state, entry.playerId)} size={36} /><strong>{nameOf(state, entry.playerId)}{entry.playerId === state.selfPlayerId ? ' (you)' : ''}</strong>
      {entry.stroke && <span className="mg-circle"><DrawingView drawings={[{ v: 1, strokes: [{ c: 0, w: 14, p: entry.stroke }] }]} label={`Circle by ${nameOf(state, entry.playerId)}`} /></span>}
      <span>{formatMinigameResult(game, entry.value, settings)}</span></li>)}</ol></>}
  </div>;
}
