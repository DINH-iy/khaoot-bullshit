import { translate } from '../../i18n/texts.js';
import { CLAP_BEATS_MS, DEFAULT_REVEAL_EASING, MINIGAMES, RevealEasingSchema, rouletteColor, type MinigameSettings, type RoomSnapshot } from '@party/contracts';
import type { ReactNode } from 'react';
import { useLanguage } from '../../i18n/language.js';
import { useTexts } from '../../i18n/texts.js';
import { DrawingView, StoredDrawing } from '../../drawing/drawing-view.js';
import { formatPoints } from '../../room/results.js';
import { useText } from '../../presentation/look.js';
import { ClockResult } from '../stop-clock/clock-result.js';
import { ResultFacts, type ResultFact } from './result-facts.js';
import { CutResult } from '../cut-the-line/cut-result.js';
import { AngleComparison } from '../match-the-angle/match-angle.js';
import { DotPhoneResult } from '../count-the-dots/count-dots.js';
import { GraphChart } from '../draw-the-graph/graph-chart.js';
import { CoinReveal } from '../heads-or-tails/coin.js';
import { betSummary, ROULETTE_TEXTS, RouletteReveal } from '../red-or-black-roulette/roulette.js';
import { HANGMAN_TEXTS } from '../hangman/hangman.text.js';
import { WordTiles } from '../hangman/board.js';
import { UndercoverReveal } from '../undercover/undercover.js';
import { DotReveal } from '../count-the-dots/dot-reveal.js';
import { STEP_RENDERERS } from './steps/renderers.js';
import { DrawingAnimation } from '../relay-drawing/animation-relay.js';
import { CONTROL_TEXTS } from './controls.text.js';
import { PHONE_RESULT_TEXTS } from './phone-result.text.js';
import { minigameResult, tenths } from './result-label.js';
import { MinigameResults } from './shared-result.js';
import './phone-result.css';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Reveal = NonNullable<Stage['reveal']>;
type Answer = Extract<Reveal['answer'], { kind: 'minigame' }>;
export function MinigamePhoneResult({ stage, state, answer, reveal, label, offset }: {
  stage: Stage; state: RoomSnapshot; answer: Answer; reveal: Reveal; label: string; offset: number;
}) {
  const t = useTexts(PHONE_RESULT_TEXTS);
  const c = useTexts(CONTROL_TEXTS);
  const roulette = useTexts(ROULETTE_TEXTS);
  const text = useText();
  const language = useLanguage();
  const game = answer.game;
  const settings = (stage.minigame?.settings ?? MINIGAMES[game].defaults) as MinigameSettings;
  const team = stage.teams?.teams.find(candidate => state.selfPlayerId && candidate.memberIds.includes(state.selfPlayerId));
  const teamEntry = team && answer.entries.find(entry => !entry.playerId && entry.teamId === team.teamId);
  // When a captain answers, the team's row holds the answer (the drawn circle, the cut, the bets…) for every member.
  const own = answer.entries.find(entry => entry.playerId !== null && entry.playerId === state.selfPlayerId) ?? (stage.teams?.answers === 'captain' ? teamEntry : undefined);
  const entry = own ?? teamEntry;
  const personalAward = reveal.awards.find(award => award.playerId === state.selfPlayerId);
  const teamAward = team && reveal.teamAwards.find(award => award.teamId === team.teamId);
  // Some team rounds route their points to the team rather than to each member.
  const award = personalAward ?? teamAward;
  const points = award ? formatPoints(award.amountMilli) : undefined;
  const place = teamEntry?.place ?? own?.place;
  const total = Number(award?.amountMilli ?? 0);
  const signed = points && total > 0 ? `+${points}` : points ?? '0';
  const seconds = (ms: number) => `${(ms / 1000).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
  const percentage = (value: number) => `${value.toLocaleString(language, { maximumFractionDigits: 2 })}%`;
  const value = entry?.value;
  // With no screen watching, the phone plays the reveal the screen would have shown (the dots counted up, the coin, the wheel).
  const screenless = !state.screenConnected;
  // …and everyone's standings under this phone's own result, as the screen would show them.
  const everyone = screenless && <MinigameResults state={state} stage={stage} reveal={reveal} answer={answer} offset={offset} standingsOnly />;
  if (answer.dotCount !== undefined) {
    const result = <><DotPhoneResult count={answer.dotCount} guess={own?.dotGuess} points={points} label={text('results.title')} />{everyone}</>;
    return answer.dotReveal ? <DotReveal pattern={answer.dotReveal.pattern} startedAt={answer.dotReveal.startedAt} offset={offset}
      easing={RevealEasingSchema.safeParse(stage.minigame?.settings['revealEasing']).data ?? DEFAULT_REVEAL_EASING}>{result}</DotReveal> : result;
  }

  let facts: ResultFact[] = [];
  let visual: ReactNode;
  let note: string | undefined;
  const reading = value ?? '—';
  switch (game) {
    case 'stop-clock':
      visual = <ClockResult target={(settings as MinigameSettings<'stop-clock'>).targetMs} elapsed={own?.value} />;
      break;
    case 'reaction':
      facts = [[t('reaction'), own?.value == null ? '—' : `${own.value} ms`]];
      if (own?.value === null) note = c('falseStart');
      break;
    case 'tap-race': facts = [[t('taps'), reading]]; break;
    case 'clap-beat': facts = [[t('beats'), value == null ? '—' : `${value} / ${CLAP_BEATS_MS.length}`]]; break;
    case 'speed-run': facts = [[t('finish'), value == null ? '—' : seconds(value)]]; break;
    case 'perfect-circle':
      if (own?.stroke) visual = <div className="mg-personal-circle"><DrawingView drawings={[{ v: 1, strokes: [{ c: 0, w: 14, p: own.stroke }] }]} label={t('roundness')} /></div>;
      facts = [[t('roundness'), own?.value == null ? '—' : percentage(own.value / 10)]];
      break;
    case 'match-the-angle':
      if (stage.minigame?.angleTarget !== undefined) visual = <AngleComparison target={stage.minigame.angleTarget} guess={own?.angle} />;
      facts = [[t('target'), stage.minigame?.angleTarget === undefined ? '—' : `${stage.minigame.angleTarget}°`], [t('angle'), own?.angle === undefined ? '—' : `${tenths(own.angle)}°`]];
      if (own?.value != null) note = c('angleOff', { value: tenths(own.value) });
      break;
    case 'cut-the-line':
      if (stage.minigame?.cutTarget !== undefined) visual = <CutResult target={stage.minigame.cutTarget} cut={own?.cut} />;
      break;
    case 'draw-the-graph':
      if (answer.graph) visual = <div className="mg-personal-graph"><GraphChart chart={answer.graph} answer={answer.graph.hidden} showDifference
        traces={own?.graphLine ? [{ id: 'own', hue: own.graphHue ?? 210, line: own.graphLine }] : []} /></div>;
      facts = [[t('error'), own?.value == null ? '—' : percentage(own.value / 100)]];
      break;
    case 'heads-or-tails':
      if (answer.coin) visual = <CoinReveal coin={answer.coin} animate={screenless} />;
      facts = [[t('pick'), value == null ? '—' : minigameResult(game, value, settings)]];
      break;
    case 'red-or-black-roulette': {
      const color = answer.roulette === undefined ? undefined : rouletteColor(answer.roulette);
      // The spinning wheel names where it landed itself.
      if (screenless && answer.roulette !== undefined) visual = <RouletteReveal pocket={answer.roulette} animate />;
      facts = [...(visual ? [] : [[t('landed'), color ? <span className={`mg-pocket ${color}`}>{answer.roulette} · {roulette(color)}</span> : '—'] satisfies ResultFact]),
        [roulette('yourBets'), own?.bets ? betSummary(own.bets) : '—']];
      break;
    }
    case 'hangman':
      if (answer.word) visual = <div className="hangman-reveal"><p>{translate(HANGMAN_TEXTS, 'theWord')}</p><WordTiles pattern={answer.word} label={`${translate(HANGMAN_TEXTS, 'theWord')}: ${answer.word.toUpperCase()}`} /></div>;
      facts = [[translate(HANGMAN_TEXTS, 'wrongLetters'), value == null ? translate(HANGMAN_TEXTS, 'hanged') : String(value)]];
      break;
    case 'undercover':
      if (answer.undercover) visual = <UndercoverReveal state={state} reveal={answer.undercover} />;
      break;
    case 'lucky-doors': facts = [[t('door'), value == null ? '—' : minigameResult(game, value, settings)]]; break;
    case 'majority': {
      const winner = answer.entries.find(row => row.place === 1)?.value;
      facts = [[t('majority'), winner == null ? t('tie') : minigameResult(game, winner, settings)],
        [t('pick'), value == null ? '—' : minigameResult(game, value, settings)]];
      break;
    }
    case 'bus': {
      const side = stage.minigame?.steps?.sides.find(side => team ? side.teamId === team.teamId : side.playerId === state.selfPlayerId);
      if (side) visual = STEP_RENDERERS.bus?.board?.(side, settings, false);
      facts = [[t('sips'), reading]];
      break;
    }
    case 'relay-drawing': {
      const relay = stage.minigame?.relay?.teams.find(side => side.teamId === team?.teamId);
      const animation = (settings as MinigameSettings<'relay-drawing'>).animation;
      if (relay?.parts.length) {
        const assetIds = relay.parts.map(part => part.assetId);
        visual = <div className="mg-personal-drawing">{animation
          ? <DrawingAnimation sessionId={state.view.sessionId} assetIds={assetIds} label={relay.name} />
          : <StoredDrawing sessionId={state.view.sessionId} assetIds={assetIds} label={relay.name} />}</div>;
      }
      facts = [[t(animation ? 'accuracy' : 'votes'), value == null || !animation ? reading : percentage(value)]];
      break;
    }
  }

  // While the coin or the wheel turns, the outcome below waits for it to land.
  const waits = screenless ? game === 'heads-or-tails' && answer.coin ? 'coin-result-list-animated' : game === 'red-or-black-roulette' && answer.roulette !== undefined ? 'roulette-results-animated' : undefined : undefined;
  const outcome = <>
    {facts.length > 0 && <ResultFacts facts={facts} />}
    {note ? <p className="mg-personal-note">{note}</p> : !entry && <p className="mg-personal-note">{t('noPlay')}</p>}
    <div className="mg-personal-score">
      {place != null && game !== 'heads-or-tails' && game !== 'red-or-black-roulette' && game !== 'majority' && <span>{t(teamEntry ? 'teamPlace' : 'place', { place })}</span>}
      <strong className={total > 0 ? 'earned' : undefined}>{t('points', { points: signed })}</strong>
    </div>
    {everyone}
  </>;
  return <div className="mg-personal-result" role="region" aria-label={label} data-game={game}>
    {visual}
    {waits ? <div className={`mg-personal-outcome ${waits}`}>{outcome}</div> : outcome}
  </div>;
}
