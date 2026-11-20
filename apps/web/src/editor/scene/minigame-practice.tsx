import { useEffect, useState, type ReactNode } from 'react';
import {
  ANGLE_TARGETS, BUS_GUESSES, CLAP_END_MS, COIN_SIDES, CUT_TARGETS, MINIGAMES, MINIGAME_COUNTDOWN_MS, ROULETTE_PICKS, ROULETTE_POCKETS, SPEED_RUN_COURSE, SPEED_RUN_FINISH, SPEED_RUN_START, SUITS,
  SAMPLE_GRAPH, graphError, angleError, busGuessRight, circleScore, createDotPattern, emptyDrawing, isRainbow, parseMinigameSettings, raceOptions, rouletteColor, isSharedPrediction,
  type BusGuess, type Drawing, type MinigameKey, type MinigameSettings, type StepSideView,
} from '@party/contracts';
import { DrawingPad } from '../../drawing/drawing-pad.js';
import { DrawingView } from '../../drawing/drawing-view.js';
import { useTexts } from '../../i18n/texts.js';
import { AnimationFrames, ANIMATION_TEXTS, useAnimationWords } from '../../minigames/relay-drawing/animation-relay.js';
import { Countdown, type Result } from '../../minigames/shared/countdown.js';
import { useServerNow } from '../../minigames/shared/clock.js';
import { GraphChart } from '../../minigames/draw-the-graph/graph-chart.js';
import { DotBoard, DotGuessForm } from '../../minigames/count-the-dots/count-dots.js';
import { RouletteReveal } from '../../minigames/red-or-black-roulette/roulette.js';
import { CoinReveal } from '../../minigames/heads-or-tails/coin.js';
import { COIN_TEXTS } from '../../minigames/heads-or-tails/coin.text.js';
import { CONTROL_TEXTS } from '../../minigames/shared/controls.text.js';
import { minigameResult } from '../../minigames/shared/result-label.js';
import { STEP_RENDERERS } from '../../minigames/shared/steps/renderers.js';
import { StepChoices } from '../../minigames/shared/steps/step-game.js';
import { TimedMinigame } from '../../minigames/shared/timed-minigame.js';
import { useText } from '../../presentation/look.js';
import { formatPoints } from '../../room/results.js';
import { formatRemaining } from '../../room/stage-timer.js';
import type { Stage } from '../model.js';
import { PRACTICE_TEXTS } from './scene-practice.text.js';

const random = (count: number) => Math.floor(Math.random() * count);
const ignoreTaps = () => {};
const sample = <T,>(source: readonly T[], count = source.length) => {
  const pool = [...source];
  return Array.from({ length: count }, () => pool.splice(random(pool.length), 1)[0]!);
};

export function MinigamePractice({ game, stage, intro }: { game: MinigameKey; stage: Stage; intro: ReactNode }) {
  const t = useTexts(PRACTICE_TEXTS);
  const settings = parseMinigameSettings(game, stage['settings']) ?? MINIGAMES[game].defaults;
  const [attempt, setAttempt] = useState<number>();
  return <div className="scene-practice">
    {attempt === undefined ? <>{intro}<button type="button" className="primary" onClick={() => setAttempt(Date.now())}>{t('start')}</button></>
      : <>
        {game === 'count-the-dots'
          ? <DotPractice key={attempt} stage={stage} attempt={attempt} settings={settings as MinigameSettings<'count-the-dots'>} />
          : <PracticeAttempt key={attempt} game={game} settings={settings} stage={stage} attempt={attempt} />}
        <button type="button" className="small-button" onClick={() => setAttempt(previous => Math.max(Date.now(), previous! + 1))}>{t('replay')}</button>
      </>}
  </div>;
}

function DotPractice({ stage, attempt, settings }: { stage: Stage; attempt: number; settings: MinigameSettings<'count-the-dots'> }) {
  const text = useText();
  const t = useTexts(CONTROL_TEXTS);
  const [pattern] = useState(() => createDotPattern(random));
  const [guess, setGuess] = useState<number>();
  const now = useServerNow(0, guess === undefined);
  const countdown = typeof stage['countdownSeconds'] === 'number' ? stage['countdownSeconds'] * 1000 : MINIGAME_COUNTDOWN_MS;
  const startsAt = attempt + countdown;
  const guessAt = startsAt + settings.viewSeconds * 1000;
  const deadline = guessAt + (stage.durationMs ?? MINIGAMES['count-the-dots'].defaultSeconds * 1000);
  if (guess !== undefined) return <p role="status">{t('dotTotal', { count: pattern.length })} · {
    minigameResult('count-the-dots', Math.abs(guess - pattern.length), settings, false, { dotGuess: guess })
  }</p>;
  if (now >= deadline) return <p role="status">{text('timer.up')}</p>;
  return <Countdown startsAt={new Date(startsAt).toISOString()} offset={0}>
    {now < guessAt ? <DotBoard pattern={pattern} /> : <>
      <p className="timer" role="timer">{text('timer.left', { time: formatRemaining(deadline - now) })}</p>
      <DotGuessForm disabled={false} onResult={result => setGuess(result.value)} />
    </>}
  </Countdown>;
}

function PracticeAttempt({ game, settings, stage, attempt }: {
  game: MinigameKey; settings: MinigameSettings; stage: Stage; attempt: number;
}) {
  const t = useText();
  const coinText = useTexts(COIN_TEXTS);
  const countdown = typeof stage['countdownSeconds'] === 'number' ? stage['countdownSeconds'] * 1000 : MINIGAME_COUNTDOWN_MS;
  const starts = attempt + countdown;
  const startsAt = new Date(starts).toISOString();
  const [goAt, setGoAt] = useState<string | null>(null);
  const [cutTarget] = useState(() => game === 'cut-the-line' ? CUT_TARGETS[random(CUT_TARGETS.length)] : undefined);
  const [angleTarget] = useState(() => game === 'match-the-angle' ? ANGLE_TARGETS[random(ANGLE_TARGETS.length)] : undefined);
  const [graph] = useState(() => {
    if (game !== 'draw-the-graph') return undefined;
    // Stock practice uses its own example. Live stock targets are chosen on the server.
    const data = (settings as MinigameSettings<'draw-the-graph'>).graph ?? { ...SAMPLE_GRAPH, hidden: [61, 58, 63, 66, 75, 79, 84, 89] };
    const { hidden, ...chart } = data;
    return { chart, data, hue: random(360) };
  });
  const [coin] = useState(() => game === 'heads-or-tails' ? COIN_SIDES[random(COIN_SIDES.length)] : undefined);
  const [pocket] = useState(() => game === 'red-or-black-roulette' ? random(ROULETTE_POCKETS) : undefined);
  const [result, setResult] = useState<Result>();
  const [expired, setExpired] = useState(false);
  const limit = game === 'speed-run' ? 600_000
    : game === 'perfect-circle' ? (settings as MinigameSettings<'perfect-circle'>).seconds * 1000
    : game === 'stop-clock' ? (settings as MinigameSettings<'stop-clock'>).targetMs * 3
    : game === 'reaction' && goAt ? Date.parse(goAt) - starts + 10_000 : Infinity;
  const duration = Math.min(stage.durationMs ?? ((isSharedPrediction(game) || game === 'draw-the-graph') ? MINIGAMES[game].defaultSeconds * 1000 : Infinity), limit);
  useEffect(() => {
    if (result || game !== 'reaction') return;
    const { minWaitMs, maxWaitMs } = settings as MinigameSettings<'reaction'>;
    const go = starts + minWaitMs + random(maxWaitMs - minWaitMs + 1);
    const timer = setTimeout(() => setGoAt(new Date(go).toISOString()), Math.max(0, go - Date.now()));
    return () => clearTimeout(timer);
  // The settings are fixed for this attempt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, starts, result]);
  useEffect(() => {
    if (!Number.isFinite(duration) || game === 'relay-drawing') return;
    const delay = Math.max(duration, game === 'clap-beat' ? CLAP_END_MS + 250 : 0);
    const timer = setTimeout(() => setExpired(true), Math.max(0, starts + delay - Date.now()));
    return () => clearTimeout(timer);
  }, [duration, game, starts]);

  if (result) {
    if (graph && result.graphLine) return <>
      <GraphChart chart={graph.chart} answer={graph.data.hidden} traces={[{ id: 'own', hue: graph.hue, line: result.graphLine }]} />
      <p className="mg-big" role="status">{minigameResult(game, graphError(graph.data, result.graphLine), settings)}</p>
    </>;
    if (pocket !== undefined) return <><RouletteReveal pocket={pocket} animate /><p>{coinText(ROULETTE_PICKS[result.value] === rouletteColor(pocket) ? 'right' : 'wrong')}</p></>;
    if (coin) return <><CoinReveal coin={coin} animate /><p>{coinText(COIN_SIDES[result.value] === coin ? 'right' : 'wrong')}</p></>;
    const { value, stroke } = result;
    const label = cutTarget !== undefined ? minigameResult(game, Math.abs(value - cutTarget), settings, false, { cut: value })
      : angleTarget !== undefined ? minigameResult(game, angleError(value, angleTarget), settings, false, { angle: value })
      : minigameResult(game, stroke ? circleScore(stroke) : value, settings);
    return <p className="mg-big" role="status">{result.early ? t('minigame.tooSoon') : label}</p>;
  }
  if (expired && !STEP_RENDERERS[game]) return <p role="status">{t('timer.up')}</p>;
  if (game === 'relay-drawing') return <Countdown startsAt={startsAt} offset={0}><RelayPractice settings={settings as MinigameSettings<'relay-drawing'>} /></Countdown>;
  if (STEP_RENDERERS[game]) return <Countdown startsAt={startsAt} offset={0}>
    <StepPractice game={game} settings={settings} starts={starts} expired={expired} />
  </Countdown>;
  return <TimedMinigame game={game} settings={settings} startsAt={startsAt} goAt={goAt} cutTarget={cutTarget} angleTarget={angleTarget} graph={graph} offset={0} disabled={false} onResult={setResult} onTaps={ignoreTaps} />;
}

function StepPractice({ game, settings, starts, expired }: { game: MinigameKey; settings: MinigameSettings; starts: number; expired: boolean }) {
  const text = useText();
  const t = useTexts(PRACTICE_TEXTS);
  const renderer = STEP_RENDERERS[game]!;
  const [played, setPlayed] = useState<string[]>([]);
  const [cell, setCell] = useState(SPEED_RUN_START);
  const [finished, setFinished] = useState<number | null>(null);
  const [cards] = useState(() => game === 'bus'
    ? sample(SUITS.flatMap(suit => Array.from({ length: 13 }, (_, index) => ({ rank: index + 2, suit }))), 4) : []);
  const [doors] = useState(() => {
    if (game !== 'lucky-doors') return [];
    const rules = settings as MinigameSettings<'lucky-doors'>;
    return rules.order === 'fixed' ? rules.doorsMilli : sample(rules.doorsMilli);
  });
  const step = played.length;
  const course = (settings as MinigameSettings<'speed-run'>).course ?? SPEED_RUN_COURSE;
  const moves = game === 'speed-run' ? raceOptions(course, cell) : [];
  const options = game === 'bus' ? BUS_GUESSES[step] : game === 'lucky-doors' ? (step === 0 ? doors.map((_, index) => String(index)) : null)
    : game === 'majority' ? (step === 0 ? ['left', 'right'] : null) : (finished === null && step < 64 ? moves.map(move => move.direction) : null);
  const right = game === 'bus' ? played.map((guess, index) => busGuessRight(index, guess as BusGuess, cards)) : [];
  const sips = right.reduce((total, correct, index) => total + (correct ? 0 : (settings as MinigameSettings<'bus'>).sips[index] ?? 0), 0);
  const view = game === 'bus' ? { cards: cards.slice(0, step), guesses: played, right, sips, rainbow: step === 4 && (settings as MinigameSettings<'bus'>).rainbow !== false && isRainbow(cards) }
    : game === 'lucky-doors' ? { picked: step ? Number(played[0]) : null } : game === 'speed-run' ? { cell } : { chosen: step > 0 };
  const value = game === 'bus' ? sips : game === 'speed-run' ? finished : game === 'majority' ? (played[0] === 'left' ? 0 : 1) : Number(played[0]);
  const side: StepSideView = { name: '', playerId: null, teamId: null, captainId: null, voteEndsAt: null, voters: [], votes: [], view,
    step, options: options ? [...options] : null, result: options ? null : value };
  const choose = (option: string) => {
    if (game === 'speed-run') {
      const move = moves.find(candidate => candidate.direction === option);
      if (!move) return;
      setCell(move.cell);
      if (move.cell === SPEED_RUN_FINISH) setFinished(Math.max(0, Date.now() - starts));
    }
    setPlayed([...played, option]);
  };

  return <div className="step-phone">
    {renderer.board?.(side, settings, true)}
    {options && !expired ? <div className="step-question">
      <p className="step-ask">{renderer.question(view, step, settings)}</p>
      {renderer.stake && <p className="step-stake">{renderer.stake(step, settings)}</p>}
      <StepChoices renderer={renderer} options={options} view={view} settings={settings} disabled={false} onChoose={choose} />
    </div> : <p role="status" className="mg-big">{options ? text('timer.up') : game === 'lucky-doors'
      ? t('points', { points: formatPoints(doors[Number(played[0])]!) }) : minigameResult(game, value, settings)}</p>}
  </div>;
}

function RelayPractice({ settings }: { settings: MinigameSettings<'relay-drawing'> }) {
  const t = useTexts(PRACTICE_TEXTS);
  const a = useTexts(ANIMATION_TEXTS);
  const text = useText();
  const words = useAnimationWords();
  const [word] = useState(() => words[random(words.length)]!);
  const [frames, setFrames] = useState<Drawing[]>([]);
  const [drawing, setDrawing] = useState(emptyDrawing);
  const [deadline, setDeadline] = useState(() => Date.now() + settings.secondsPerTurn * 1000);
  const [now, setNow] = useState(Date.now);
  const total = settings.animation ? 3 : 2;
  const done = frames.length >= total;
  const finish = () => {
    setFrames([...frames, drawing]);
    setDrawing(emptyDrawing());
    setDeadline(Date.now() + settings.secondsPerTurn * 1000);
  };
  useEffect(() => {
    if (done) return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [done]);
  useEffect(() => { if (!done && now >= deadline) finish(); });
  if (done) return settings.animation ? <AnimationFrames drawings={frames} label={t('draw')} /> : <DrawingView drawings={frames} label={t('draw')} />;
  return <>
    {settings.animation && <p>{a('draw', { word })}</p>}
    <p>{t('turn', { turn: frames.length + 1, total })} · {text('timer.left', { time: formatRemaining(Math.max(0, deadline - now)) })}</p>
    <DrawingPad key={frames.length} value={drawing} onChange={setDrawing} under={settings.animation ? [] : frames} label={t('draw')} />
    <button type="button" onClick={finish}>{t('nextTurn')}</button>
  </>;
}
