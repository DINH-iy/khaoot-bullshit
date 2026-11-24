import { useCallback, useRef } from 'react';
import type { Stroke } from '@party/contracts';
import type { LiveStrokes } from '../../drawing/live-strokes.js';
import { defaultLook, howToPlayKey, isStepMinigame, MinigameValueSchema, ROULETTE_BET_FLOOR, rouletteBetLimit, type MinigameSettings, type RoomSnapshot } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { CATALOG_TEXTS } from '../../presentation/catalog.text.js';
import { minigameResult } from './result-label.js';
import { CONTROL_TEXTS } from './controls.text.js';
import { useText } from '../../presentation/look.js';
import { Avatar } from '../../players/avatar.js';
import { formatPoints } from '../../room/results.js';
import type { Result } from './countdown.js';
import { RelayDrawing } from '../relay-drawing/relay-drawing.js';
import { StepPhone, StepScreen, type SendMove } from './steps/step-game.js';
import { useServerNow } from './clock.js';
import { ClapCue } from '../clap-beat/clap-beat.js';
import { TimedMinigame } from './timed-minigame.js';
import { CutTarget } from '../cut-the-line/cut-line.js';
import { AngleTarget } from '../match-the-angle/match-angle.js';
import { GraphChart } from '../draw-the-graph/graph-chart.js';
import { GRAPH_TEXTS } from '../draw-the-graph/graph.text.js';
import { DotBoard } from '../count-the-dots/count-dots.js';
import { betSummary, ROULETTE_TEXTS } from '../red-or-black-roulette/roulette.js';
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
  const rouletteText = useTexts(ROULETTE_TEXTS);
  const own = state.view.ownSubmission ? MinigameValueSchema.safeParse(state.view.ownSubmission.value) : null;
  // Stable callbacks: the controllers redraw every frame, and their timers must not restart each time.
  const latest = useRef({ onResult, live }); latest.current = { onResult, live };
  const send = useCallback((result: Result) => latest.current.onResult(result), []);
  const sendTaps = useCallback((count: number) => latest.current.live.sendTaps(stage.id, count), [stage.id]);
  // GO from the snapshot, or sooner from the live announcement of this run.
  const goAt = minigame.goAt ?? (live.go && live.go.stageRunId === stage.id && minigame.startsAt && Date.parse(live.go.goAt) >= Date.parse(minigame.startsAt) ? live.go.goAt : null);
  if (stage.revealed) return null;
  if (stage.status === 'CLOSED' && state.role === 'player') {
    return <p className="mg-paused" role="status">{t('progress.locked')}</p>;
  }
  const settings = minigame.settings as MinigameSettings;
  if (minigame.game === 'relay-drawing') return state.view.status === 'PAUSED' ? <p className="mg-paused" role="status">{t('phase.paused')}</p>
    : <RelayDrawing state={state} stage={stage} offset={offset} canPlay={canPlay} disabled={disabled} onVote={(teamId, value = 0) => send({ value, teamId })} onPart={onPart} live={live} />;
  // A step game (Drive the bus, Lucky doors, Left or right…): the shared step frame with the game's own drawing.
  if (isStepMinigame(minigame.game)) return state.role === 'player' ? <StepPhone state={state} stage={stage} offset={offset} canPlay={canPlay} disabled={disabled} onMove={onMove} />
    : <StepScreen state={state} stage={stage} offset={offset} />;
  if (state.role === 'player') {
    if (own?.success && minigame.game === 'count-the-dots') {
      const [before, after] = c('dotSaved', { guess: '{guess}' }).split('{guess}');
      return <p className="mg-guessed" role="status">{before}<strong>{own.data.value}</strong>{after}</p>;
    }
    if (own?.success && minigame.game === 'cut-the-line') return <p className="mg-sub" role="status">{t('minigame.played')} · {own.data.cut ?? own.data.value}%</p>;
    if (own?.success && minigame.graph) return <>
      <GraphChart chart={minigame.graph.chart} portrait
        traces={own.data.graphLine ? [{ id: 'own', line: own.data.graphLine, hue: minigame.graph.hue ?? 210 }] : []} />
      <p className="mg-sub" role="status">{graphText('saved')}</p>
    </>;
    if (own?.success && own.data.bets) return <div className="mg-done" role="status"><p className="mg-big">{betSummary(own.data.bets)}</p><p>{rouletteText('locked')}</p></div>;
    if (own?.success) return <div className={`mg-done${own.data.early ? ' reaction-early' : ''}`} role="status"><p className="mg-big">{own.data.early ? t('minigame.tooSoon') : minigameResult(minigame.game, own.data.value, settings, false, own.data)}</p><p>{t('minigame.played')}</p></div>;
    if (state.view.status === 'PAUSED') return <p className="mg-paused" role="status">{t('phase.paused')}</p>;
    if (!canPlay || !minigame.startsAt) return <p className="wait-note">{t(howToPlayKey(minigame.game))}</p>;
    // With no screen watching, the phone also shows what the screen would (the dots come along in the view; the race bars here).
    const race = minigame.game === 'tap-race' && !state.screenConnected && live.progress?.stageRunId === stage.id && live.progress.counts.length > 0;
    // Roulette stakes: the score this phone can see, or the round's minimum stake when that is higher (the server checks the same).
    const score = Number(BigInt(state.view.standings.find(row => row.playerId === state.selfPlayerId)?.amountMilli ?? '0') / 1000n);
    const rouletteLimit = minigame.game === 'red-or-black-roulette' ? rouletteBetLimit(score, (settings as MinigameSettings<'red-or-black-roulette'>).betFloor ?? ROULETTE_BET_FLOOR) : undefined;
    return <>
      <TimedMinigame key={stage.id} rouletteLimit={rouletteLimit} game={minigame.game} settings={settings} startsAt={minigame.startsAt} goAt={goAt} cutTarget={minigame.cutTarget} angleTarget={minigame.angleTarget}
        graph={minigame.graph} dots={minigame.dots} offset={offset} disabled={disabled} onResult={send} onTaps={sendTaps} />
      {race && <div className="mg-phone-race"><RaceBars state={state} progress={live.progress!.counts} /></div>}
    </>;
  }
  return <ScreenView state={state} minigame={{ ...minigame, goAt }} offset={offset} progress={live.progress?.stageRunId === stage.id ? live.progress.counts : []} />;
}

/** The TV: name, how to play, the countdown and (in a reaction duel) the GO everyone waits for. */
function ScreenView({ state, minigame, offset, progress }: { state: RoomSnapshot; minigame: Minigame; offset: number; progress: { playerId: string; count: number }[] }) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const name = useTexts(CATALOG_TEXTS); const now = useServerNow(offset, Boolean(minigame.startsAt));
  const left = minigame.startsAt ? Date.parse(minigame.startsAt) - now : null;
  const go = minigame.goAt ? now >= Date.parse(minigame.goAt) : false;
  const paused = state.view.status === 'PAUSED';
  const title = name(minigame.game);
  const repeatingTitle = state.view.stage?.prompt?.trim().replace(/[.!?]+$/, '').toLocaleLowerCase() === title.toLocaleLowerCase();
  return <div className={`mg-screen mg-${minigame.game}`}>
    {!repeatingTitle && minigame.game !== 'draw-the-graph' && minigame.game !== 'heads-or-tails' && minigame.game !== 'count-the-dots' && <p className="mg-name">{title}</p>}
    {/* Paused: no countdown or GO; continuing starts a fresh countdown. */}
    {paused ? <p className="mg-paused" role="status">{t('phase.paused')}</p>
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
