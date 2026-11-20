import { useCallback, useRef } from 'react';
import type { Stroke } from '@party/contracts';
import type { LiveStrokes } from '../../drawing/live-strokes.js';
import { defaultLook, howToPlayKey, isStepMinigame, MINIGAMES, MinigameValueSchema, type MinigameKey, type MinigameSettings, type RoomSnapshot } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { CATALOG_TEXTS } from '../../presentation/catalog.text.js';
import { minigameResult } from './result-label.js';
import { CONTROL_TEXTS } from './controls.text.js';
import { useText } from '../../presentation/look.js';
import { Avatar } from '../../players/avatar.js';
import { formatPoints } from '../../room/results.js';
import { teamName } from '../../room/teams.js';
import type { Result } from './countdown.js';
import { DrawingAnimation, useAnimationWords } from '../relay-drawing/animation-relay.js';
import { RelayDrawing } from '../relay-drawing/relay-drawing.js';
import { StepPhone, StepScreen, type SendMove } from './steps/step-game.js';
import { STEP_RENDERERS } from './steps/renderers.js';
import { DrawingView, StoredDrawing } from '../../drawing/drawing-view.js';
import { useServerNow } from './clock.js';
import { ClapCue } from '../clap-beat/clap-beat.js';
import { TimedMinigame } from './timed-minigame.js';
import { CutTarget } from '../cut-the-line/cut-line.js';
import { AngleTarget } from '../match-the-angle/match-angle.js';
import { chartInk, GraphChart } from '../draw-the-graph/graph-chart.js';
import { GRAPH_TEXTS } from '../draw-the-graph/graph.text.js';
import { DotBoard } from '../count-the-dots/count-dots.js';
import { CoinReveal } from '../heads-or-tails/coin.js';
import { RouletteReveal } from '../red-or-black-roulette/roulette.js';
import { COIN_TEXTS } from '../heads-or-tails/coin.text.js';
import './minigames.css';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Minigame = NonNullable<Stage['minigame']>;
/** Live signals from the room connection (see use-room.ts). */
export interface MinigameLive { strokes: LiveStrokes; sendStroke: (message: { stageRunId: string; turn: number; strokeId: number; stroke: Stroke | null; count: number }) => void; go: { stageRunId: string; goAt: string } | null; progress: { stageRunId: string; counts: { playerId: string; count: number }[] } | null; sendTaps: (stageRunId: string, count: number) => void }

/**
 * A running minigame. Phones get the controls (or their own result once sent);
 * the shared screen and host see how to play, the countdown and GO.
 */
export function MinigameStage({ state, stage, offset, canPlay, disabled, onResult, live, onPart, onMove }: { state: RoomSnapshot; stage: Stage; offset: number; canPlay: boolean; disabled: boolean; onResult: (result: Result) => void; live: MinigameLive; onPart: (turn: number, assetId: string) => void ; onMove: SendMove }) {
  const t = useText(); const minigame = stage.minigame!;
  const c = useTexts(CONTROL_TEXTS);
  const graphText = useTexts(GRAPH_TEXTS);
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
    : <RelayDrawing state={state} stage={stage} offset={offset} canPlay={canPlay} disabled={disabled} onVote={(teamId, value = 0) => send({ value, teamId })} onPart={onPart} live={live} />;
  // A step game (Drive the bus, Lucky doors, Left or right…): the shared step frame with the game's own drawing.
  if (isStepMinigame(minigame.game)) return state.role === 'player' ? <StepPhone state={state} stage={stage} offset={offset} canPlay={canPlay} disabled={disabled} onMove={onMove} />
    : <StepScreen state={state} stage={stage} offset={offset} />;
  if (state.role === 'player') {
    if (own?.success && minigame.game === 'count-the-dots') return <p className="mg-sub" role="status">{c('dotSaved', { guess: own.data.value })}</p>;
    if (own?.success && minigame.graph) return <>
      <GraphChart chart={minigame.graph.chart}
        traces={own.data.graphLine ? [{ id: 'own', line: own.data.graphLine, hue: minigame.graph.hue ?? 210 }] : []} />
      <p className="mg-sub" role="status">{graphText('saved')}</p>
    </>;
    if (own?.success) return <div className={`mg-done${own.data.early ? ' reaction-early' : ''}`} role="status"><p className="mg-big">{own.data.early ? t('minigame.tooSoon') : minigameResult(minigame.game, own.data.value, settings, false, own.data)}</p><p>{t('minigame.played')}</p></div>;
    if (state.view.status === 'PAUSED') return <p className="wait-note" role="status">{t('minigame.paused')}</p>;
    if (!canPlay || !minigame.startsAt) return <p className="wait-note">{t(howToPlayKey(minigame.game))}</p>;
    return <TimedMinigame key={stage.id} game={minigame.game} settings={settings} startsAt={minigame.startsAt} goAt={goAt} cutTarget={minigame.cutTarget} angleTarget={minigame.angleTarget}
      dotGuessAt={minigame.dots?.guessAt} graph={minigame.graph} offset={offset} disabled={disabled} onResult={send} onTaps={sendTaps} />;
  }
  return <ScreenView state={state} minigame={{ ...minigame, goAt }} offset={offset} progress={live.progress?.stageRunId === stage.id ? live.progress.counts : []} />;
}

/** The TV: name, how to play, the countdown and (in a reaction duel) the GO everyone waits for. */
function ScreenView({ state, minigame, offset, progress }: { state: RoomSnapshot; minigame: Minigame; offset: number; progress: { playerId: string; count: number }[] }) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const name = useTexts(CATALOG_TEXTS); const now = useServerNow(offset, Boolean(minigame.startsAt));
  const left = minigame.startsAt ? Date.parse(minigame.startsAt) - now : null;
  const go = minigame.goAt ? now >= Date.parse(minigame.goAt) : false;
  return <div className={`mg-screen mg-${minigame.game}`}>
    <p className="mg-name">{name(minigame.game)}</p>
    <p className="mg-how">{t(howToPlayKey(minigame.game))}</p>
    {/* Paused: no countdown or GO; continuing starts a fresh countdown. */}
    {state.view.status === 'PAUSED' ? <p className="mg-big wait" role="status">{t('minigame.paused')}</p>
      : left !== null && left > 0 ? <p className="mg-big" role="timer" aria-label={c('starts')}>{Math.ceil(left / 1000)}</p>
      : minigame.game === 'reaction' && minigame.startsAt ? <p className={`mg-big ${go ? 'go' : 'wait'}`}>{go ? t('minigame.go') : t('minigame.wait')}</p>
      : minigame.game === 'clap-beat' && left !== null ? <ClapCue elapsed={-left} />
      : minigame.cutTarget !== undefined && left !== null ? <CutTarget target={minigame.cutTarget} />
      : minigame.angleTarget !== undefined && left !== null ? <AngleTarget target={minigame.angleTarget} />
      : minigame.graph && left !== null ? <GraphChart chart={minigame.graph.chart} />
      : minigame.dots && left !== null ? (now < Date.parse(minigame.dots.guessAt)
        ? minigame.dots.pattern && <DotBoard pattern={minigame.dots.pattern} />
        : <p className="mg-sub" role="status">{c('dotGuessNow')}</p>)
      : minigame.game === 'tap-race' && minigame.startsAt ? <RaceBars state={state} progress={progress} />
      : minigame.game === 'lucky-doors' ? <p className="mg-sub">{t('minigame.pickDoor')} · {(minigame.settings as MinigameSettings<'lucky-doors'>).doorsMilli.map(formatPoints).join(' · ')}</p> : null}
  </div>;
}

/** Live race: one bar per player, growing with every tap the server sees. */
function RaceBars({ state, progress }: { state: RoomSnapshot; progress: { playerId: string; count: number }[] }) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const most = Math.max(10, ...progress.map(entry => entry.count));
  const rows = [...progress].sort((a, b) => b.count - a.count).slice(0, 12);
  if (!rows.length) return <p className="mg-big">{t('minigame.tap')}</p>;
  return <ol className="mg-race" aria-label={c('taps')}>{rows.map(entry => <li key={entry.playerId}>
    <Avatar look={lookOf(state, entry.playerId)} size={32} /><span className="mg-race-name">{nameOf(state, entry.playerId)}</span>
    <span className="mg-race-track" aria-hidden="true"><span style={{ width: `${Math.round(entry.count / most * 100)}%` }} /></span><span className="mg-race-count">{entry.count}</span></li>)}</ol>;
}

const lookOf = (state: RoomSnapshot, playerId: string | null) => state.players.find(player => player.id === playerId)?.look ?? defaultLook(playerId ?? 'former');
const nameOf = (state: RoomSnapshot, playerId: string | null) => state.players.find(player => player.id === playerId)?.displayName ?? 'Former player';

function RelayPictures({ state, relay, animation }: { state: RoomSnapshot; relay: NonNullable<Minigame['relay']>; animation: boolean }) {
  const t = useTexts(CONTROL_TEXTS);
  const words = useAnimationWords();
  return <ul className="drawing-gallery">{relay.teams.map(team => <li key={team.teamId}>{animation
    ? <DrawingAnimation sessionId={state.view.sessionId} assetIds={team.parts.map(part => part.assetId)} label={t('drawingOf', { name: team.name })} />
    : <StoredDrawing sessionId={state.view.sessionId} assetIds={team.parts.map(part => part.assetId)} label={t('drawingOf', { name: team.name })} />}<span>{team.name}{team.word === undefined ? '' : ` · ${words[team.word]}`}</span></li>)}</ul>;
}

/** After the reveal: the podium, everyone's result, and what was behind each door. */
export function MinigameResults({ state, answer }: { state: RoomSnapshot; answer: Extract<NonNullable<NonNullable<Stage['reveal']>['answer']>, { kind: 'minigame' }> }) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const game = answer.game as MinigameKey;
  const coinText = useTexts(COIN_TEXTS);
  const graphText = useTexts(GRAPH_TEXTS);
  const animateCoin = Boolean(answer.coin) && state.role !== 'player';
  const animateRoulette = answer.roulette !== undefined && (state.role === 'display' || (state.role === 'host' && !state.displayConnected));
  const prediction = Boolean(answer.coin) || answer.roulette !== undefined;
  const settings = (state.view.stage?.minigame?.settings ?? MINIGAMES[game].defaults) as MinigameSettings;
  const cutTarget = state.view.stage?.minigame?.cutTarget;
  const angleTarget = state.view.stage?.minigame?.angleTarget;
  const teams = answer.entries.filter(entry => entry.playerId === null); const players = answer.entries.filter(entry => entry.playerId !== null);
  return <div className="mg-results">
    {answer.coin && <CoinReveal key={state.view.stage?.id} coin={answer.coin} animate={animateCoin} />}
    {answer.roulette !== undefined && <RouletteReveal key={state.view.stage?.id} pocket={answer.roulette} animate={animateRoulette} />}
    {cutTarget !== undefined && <CutTarget target={cutTarget} />}
    {angleTarget !== undefined && <AngleTarget target={angleTarget} />}
    {answer.graph && state.role !== 'player' && <>
      <GraphChart chart={answer.graph} answer={answer.graph.hidden} traces={players.flatMap(entry =>
        entry.playerId && entry.graphHue !== undefined && entry.graphLine ? [{
          id: entry.playerId, line: entry.graphLine, hue: entry.graphHue, name: nameOf(state, entry.playerId), winner: entry.place === 1,
        }] : [])} />
      <p className="graph-reveal-key">{graphText('actual')}</p>
    </>}
    {answer.dotCount !== undefined && <p className="mg-big mg-dot-total">{c('dotTotal', { count: answer.dotCount })}</p>}
    {game === 'relay-drawing' && state.view.stage?.minigame?.relay && <RelayPictures state={state} relay={state.view.stage.minigame.relay} animation={Boolean((settings as MinigameSettings<'relay-drawing'>).animation)} />}
    {isStepMinigame(game) && state.view.stage?.minigame?.steps && game !== 'lucky-doors' && <StepScreenBoards stage={state.view.stage} />}
    {answer.doorsMilli && <><h4>{t('minigame.behindDoors')}</h4><ol className="mg-doors revealed">{answer.doorsMilli.map((milli, index) => <li key={index} className="mg-door">{t('minigame.door', { number: index + 1 })}<strong>{formatPoints(milli)}</strong></li>)}</ol></>}
    {teams.length > 0 && <><h4>{t('minigame.places')}</h4><ol className="mg-podium">{teams.map(entry => <li key={entry.teamId} className={entry.place === 1 ? 'first' : undefined}>
      <span className="mg-place">{entry.place ?? '–'}</span><strong>{teamName(state, entry.teamId!)}</strong><span>{minigameResult(game, entry.value, settings, true)}</span></li>)}</ol></>}
    {players.length > 0 && <section className={animateCoin ? 'coin-result-list-animated' : animateRoulette ? 'roulette-results-animated' : undefined}>
      <h4>{prediction ? coinText('picks') : teams.length ? c('everyone') : game === 'lucky-doors' ? c('whoChose') : t('minigame.places')}</h4><ol className="mg-podium">{players.map(entry => <li key={entry.playerId} className={entry.place === 1 ? 'first' : undefined}>
      <span className="mg-place">{prediction ? <><span aria-hidden="true">{entry.place === 1 ? '✓' : '×'}</span><span className="visually-hidden">{coinText(entry.place === 1 ? 'right' : 'wrong')}</span></>
        : teams.length || game === 'lucky-doors' ? '' : entry.place ?? '–'}</span><Avatar look={lookOf(state, entry.playerId)} size={36} /><strong>{entry.graphHue !== undefined && <span className="graph-swatch" aria-hidden="true" style={{ background: chartInk(entry.graphHue) }} />}
      {nameOf(state, entry.playerId)}{entry.playerId === state.selfPlayerId ? ` ${c('you')}` : ''}</strong>
      {entry.stroke && <span className="mg-circle"><DrawingView drawings={[{ v: 1, strokes: [{ c: 0, w: 14, p: entry.stroke }] }]} label={c('circleBy', { name: nameOf(state, entry.playerId) })} /></span>}
      <span>{minigameResult(game, entry.value, settings, false, entry)}</span></li>)}</ol></section>}
  </div>;
}

/** After the reveal of a step game: every side's board (its cards…), as the shared screen showed it. */
function StepScreenBoards({ stage }: { stage: Stage }) {
  const minigame = stage.minigame!; const renderer = STEP_RENDERERS[minigame.game as MinigameKey]; const settings = minigame.settings as MinigameSettings;
  if (!renderer?.board || minigame.game === 'majority') return null;
  return <ol className="step-sides">{minigame.steps!.sides.map(side => <li key={side.teamId ?? side.playerId}><span className="step-side-name">{side.name}</span>{renderer.board!(side, settings, false)}</li>)}</ol>;
}
