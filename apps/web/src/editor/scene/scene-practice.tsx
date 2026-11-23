import { useEffect, useState } from 'react';
import { emptyDrawing, InputSchema, VotingModeSchema, voteChoices, type SubmissionValue } from '@party/contracts';
import { DrawingPad } from '../../drawing/drawing-pad.js';
import { DrawingView } from '../../drawing/drawing-view.js';
import { useTexts } from '../../i18n/texts.js';
import { Countdown } from '../../minigames/shared/countdown.js';
import { useText } from '../../presentation/look.js';
import { AnswerInput, draftValue, emptyDraft } from '../../room/answer-input.js';
import { formatPoints } from '../../room/results.js';
import { formatRemaining } from '../../room/stage-timer.js';
import { Ballot } from '../../room/vote.js';
import { PLAY_TEXTS } from '../../room/play.text.js';
import { WheelDisc } from '../../room-extras/show-extras.js';
import { DrawBoard } from '../../room/minigame-draw.js';
import { translate } from '../../i18n/texts.js';
import { isDrawScene, type Definition, type Stage } from '../model.js';
import { SETTINGS_TEXTS } from '../shell/settings.text.js';
import { PRACTICE_TEXTS } from './scene-practice.text.js';

type Option = { key: string; label: string };
interface Wheel { key: string; title: string; spinSeconds: number; entries: { label: string }[]; colors?: string[] }
const mediaTypes = { image: 'image/png,image/jpeg,image/webp', gif: 'image/gif', video: 'video/mp4,video/webm,video/quicktime' };

export function ScenePractice({ definition, stage, options }: { definition: Definition; stage: Stage; options: Option[] }) {
  const t = useTexts(PRACTICE_TEXTS);
  const [attempt, setAttempt] = useState<number>();
  const parsed = InputSchema.safeParse(stage.kind === 'route' ? { kind: 'choice', options } : stage['input']);
  const input = parsed.data;
  const translated = input?.kind === 'choice' ? { ...input, options } : input?.kind === 'order' ? { ...input, items: options } : input;
  const wheelKey = (stage['spin'] as { wheel?: string } | undefined)?.wheel;
  const wheel = (definition['wheels'] as Wheel[] | undefined)?.find(entry => entry.key === wheelKey);

  if (wheel?.entries.length) return <WheelPractice wheel={wheel} />;
  if (isDrawScene(stage)) return <DrawPractice options={options} />;
  if (!translated && !['vote', 'teams', 'duel', 'challenge'].includes(stage.kind) && typeof stage.durationMs !== 'number') return null;
  return <div className="scene-practice">
    {attempt === undefined ? <button className="primary" type="button" onClick={() => setAttempt(Date.now())}>{t('start')}</button>
      : <>
        <RoundPractice key={attempt} stage={stage} input={translated} attempt={attempt} />
        <button className="small-button" type="button" onClick={() => setAttempt(previous => Math.max(Date.now(), previous! + 1))}>{t('replay')}</button>
      </>}
  </div>;
}

function RoundPractice({ stage, input, attempt }: { stage: Stage; input: typeof InputSchema['_output'] | undefined; attempt: number }) {
  const t = useTexts(PRACTICE_TEXTS);
  const text = useText();
  const [draft, setDraft] = useState(() => {
    const initial = emptyDraft(input);
    for (let index = initial.order.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [initial.order[index], initial.order[other]] = [initial.order[other]!, initial.order[index]!];
    }
    return initial;
  });
  const [drawing, setDrawing] = useState(emptyDrawing);
  const [file, setFile] = useState<File>();
  const [url, setUrl] = useState<string>();
  const [answer, setAnswer] = useState<SubmissionValue>();
  const [result, setResult] = useState<string>();
  const [remaining, setRemaining] = useState<number | null>(stage.durationMs ?? null);
  const drawingStart = input?.kind === 'drawing' ? input.start : undefined;
  const countdown = input?.kind === 'drawing' ? Number(stage['countdownSeconds'] ?? 0) * 1000 : 0;
  const startsAt = countdown ? new Date(attempt + countdown).toISOString() : undefined;
  useEffect(() => {
    if (!file) { setUrl(undefined); return; }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  useEffect(() => {
    const duration = stage.durationMs;
    if (duration == null || result !== undefined || answer) return;
    const end = attempt + countdown + duration;
    const id = setInterval(() => {
      const left = Math.min(duration, Math.max(0, end - Date.now()));
      setRemaining(left);
      if (!left) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [attempt, countdown, stage.durationMs, result, answer]);

  const expired = remaining === 0;
  const value = input ? draftValue(input, draft) : null;
  const scoring = stage['scoring'] as { kind?: string; correctChoiceKey?: string; correctOrder?: string[]; awardMilli?: string } | undefined;
  const submit = () => {
    if (value?.kind === 'choice' && stage.kind === 'route') {
      setResult(input?.kind === 'choice' ? input.options.find(option => option.key === value.choiceKey)?.label ?? t('saved') : t('saved'));
      return;
    }
    const correct = scoring?.kind === 'correct-choice' && value?.kind === 'choice' ? value.choiceKey === scoring.correctChoiceKey
      : scoring?.kind === 'correct-order' && value?.kind === 'order' ? value.keys.every((key, index) => key === scoring.correctOrder?.[index]) : undefined;
    setResult(correct === undefined ? t('saved') : correct && scoring?.awardMilli
      ? `${t('correct')} · ${t('points', { points: formatPoints(scoring.awardMilli) })}` : t(correct ? 'correct' : 'incorrect'));
  };

  return <Countdown startsAt={startsAt} offset={0}>
    {remaining !== null && result === undefined && !answer && <p className="timer" role="timer">
      {expired ? text('timer.up') : text('timer.left', { time: formatRemaining(remaining) })}
    </p>}
    {stage.kind === 'vote' ? <>
      <p className="hint">{t('sampleVote')}</p>
      <Ballot sessionId="" ballot={[1, 2, 3, 4].map(number => ({ submissionId: String(number), own: number === 4,
        content: { kind: 'text', text: t('sampleAnswer', { number }) } }))}
        mode={VotingModeSchema.safeParse(stage['voteMode']).data ?? 'single'} limit={Number(stage['voteLimit'] ?? 3)}
        saved={voteChoices(answer)} canVote={!answer} disabled={expired} onVote={setAnswer} />
    </> : input && !result ? <form onSubmit={event => { event.preventDefault(); if (!expired && (value || file || drawing.strokes.length)) submit(); }}>
      <fieldset className="practice-input" disabled={expired}>
        {input.kind === 'drawing' ? <DrawingPad value={drawing} onChange={setDrawing} under={drawingStart ? [drawingStart] : []}
          maxStrokes={input.maxStrokes} blind={input.blind ?? false} disabled={expired} label={t('draw')} />
          : input.kind === 'media' ? <><label>{t('chooseFile')}<input type="file" accept={input.accept.map(kind => mediaTypes[kind]).join(',')}
            onChange={event => setFile(event.target.files?.[0])} /></label>
            {url && (file?.type.startsWith('video/') ? <video className="media" src={url} controls playsInline />
              : <img className="media" src={url} alt={file?.name ?? ''} />)}</>
            : <AnswerInput sessionId="" input={input} draft={draft} onChange={setDraft} route={stage.kind === 'route'} />}
        <button type="submit" disabled={!value && !file && !drawing.strokes.length}>{t('submit')}</button>
      </fieldset>
    </form> : stage.kind === 'teams' ? <SampleTeams stage={stage} />
      : stage.kind === 'duel' ? <SampleDuel stage={stage} expired={expired} />
      : stage.kind === 'challenge' && !result && <ChallengePractice stage={stage} onAward={setResult} />}
    {result && <p role="status" className="mg-sub">{result}</p>}
    {result && input?.kind === 'drawing' && <DrawingView drawings={drawingStart ? [drawingStart, drawing] : [drawing]} label={t('draw')} />}
  </Countdown>;
}

function WheelPractice({ wheel }: { wheel: Wheel }) {
  const t = useTexts(SETTINGS_TEXTS);
  const [spin, setSpin] = useState<{ id: string; index: number; done: boolean }>();
  useEffect(() => {
    if (!spin || spin.done) return;
    const timer = setTimeout(() => setSpin({ ...spin, done: true }), wheel.spinSeconds * 1000);
    return () => clearTimeout(timer);
  }, [spin, wheel.spinSeconds]);
  const turning = spin !== undefined && !spin.done;
  return <div className="scene-practice practice-wheel">
    <WheelDisc entries={wheel.entries.map(entry => entry.label)} index={spin?.index ?? 0} seconds={wheel.spinSeconds}
      spinKey={spin?.id ?? 'still'} colors={wheel.colors} still={!spin} />
    <button type="button" disabled={turning} onClick={() => setSpin({ id: String(Date.now()),
      index: Math.floor(Math.random() * wheel.entries.length), done: matchMedia('(prefers-reduced-motion: reduce)').matches })}>
      {t(spin?.done ? 'spinAgain' : 'spin')}</button>
    {spin?.done && <p role="status">{wheel.entries[spin.index]?.label}</p>}
  </div>;
}

function ChallengePractice({ stage, onAward }: { stage: Stage; onAward: (result: string) => void }) {
  const t = useTexts(PRACTICE_TEXTS);
  const p = useTexts(PLAY_TEXTS);
  const name = t('player', { number: 1 });
  const maximum = Number(stage['maxAwardMilli'] ?? 10000) / 1000;
  const [points, setPoints] = useState('0');
  return <form onSubmit={event => { event.preventDefault(); onAward(`${name} · ${t('points', { points })}`); }}>
    <label>{p('pointsFor', { name })}<input type="number" min={0} max={maximum} step="any" required value={points}
      onChange={event => setPoints(event.target.value)} /></label>
    <button type="submit">{p('award')}</button>
  </form>;
}

function SampleDuel({ stage, expired }: { stage: Stage; expired: boolean }) {
  const t = useTexts(PRACTICE_TEXTS);
  const p = useTexts(PLAY_TEXTS);
  const text = useText();
  const [bet, setBet] = useState<string>();
  const [winner, setWinner] = useState<string>();
  const players = [1, 2].map(number => t('player', { number }));
  return <div className="duel">
    <p>{text('duel.vs', { a: players[0]!, b: players[1]! })}</p>
    {!bet && !expired && !winner && <fieldset><legend>{text('duel.bet')}</legend>{players.map(name =>
      <button key={name} type="button" onClick={() => setBet(name)}>{name}</button>)}</fieldset>}
    {bet && <p>{text('duel.youBet', { name: bet })}</p>}
    {!winner && (bet || expired) && <div className="actions">{players.map(name =>
      <button key={name} type="button" onClick={() => setWinner(name)}>{p('wins', { name })}</button>)}</div>}
    {winner && <p role="status">{text('duel.won', { name: winner })}{bet && ` ${bet === winner
      ? text('duel.betRight', { points: formatPoints(String(stage['betMilli'] ?? '0')) }) : text('duel.betWrong')}`}</p>}
  </div>;
}

function SampleTeams({ stage }: { stage: Stage }) {
  const t = useTexts(PRACTICE_TEXTS);
  const form = stage['form'] as { names?: string[]; split?: { teams?: number; sizes?: number[] } } | undefined;
  const total = Math.max(2, Math.min(12, form?.split?.teams ?? form?.split?.sizes?.length ?? 2));
  const [players, setPlayers] = useState(() => Array.from({ length: Math.max(4, total) }, (_, index) => index % total));
  const names = Array.from({ length: total }, (_, index) => form?.names?.[index] || t('team', { number: index + 1 }));
  return <fieldset><legend>{t('teams')}</legend>
    <ul className="order-list">{players.map((slot, index) => <li key={index}><strong>{t('player', { number: index + 1 })}</strong>
      <span>{names[slot]}</span><button type="button" onClick={() => setPlayers(current => current.map((team, at) => at === index ? (team + 1) % total : team))}>
        {t('moveTo', { team: names[(slot + 1) % total]! })}</button></li>)}</ul>
  </fieldset>;
}

/** Trying a minigame draw: the same cards and shuffle as in the room, drawn here at random, as often as you like. */
function DrawPractice({ options }: { options: Option[] }) {
  const [draw, setDraw] = useState<{ index: number; at: number; seed: string } | null>(null);
  const play = (key: keyof typeof PLAY_TEXTS.en) => translate(PLAY_TEXTS, key);
  return <div className="scene-practice">
    <DrawBoard key={draw?.seed ?? 'waiting'} options={options} drawn={draw?.index ?? null} at={draw?.at ?? null} seed={draw?.seed ?? ''} waiting={play('drawWho')} />
    <button className="primary" type="button" onClick={() => setDraw({ index: Math.floor(Math.random() * options.length), at: Date.now(), seed: String(Math.random()) })}>{play('drawNow')}</button>
  </div>;
}
