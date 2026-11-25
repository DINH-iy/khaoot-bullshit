import type { ReactNode } from 'react';
import { howToPlayKey, type MinigameKey, type MinigameSettings, type RoomSnapshot, type StepSideView, type TeamDecides } from '@party/contracts';
import { translate, useTexts } from '../../../i18n/texts.js';
import { CATALOG_TEXTS } from '../../../presentation/catalog.text.js';
import { minigameResult } from '../result-label.js';
import { CONTROL_TEXTS } from '../controls.text.js';
import { useText } from '../../../presentation/look.js';
import { useServerNow } from '../clock.js';
import { STEP_RENDERERS } from './renderers.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
export type SendMove = (step: number, option: string, decide?: boolean) => void;
/**
 * What a step game draws itself (renderers.tsx); the frame here does the rest: whose turn,
 * the buttons, team votes and their time, captains, and every side on the shared screen.
 */
export interface StepRenderer {
  /** The question of a step, from the side's view (its cards so far…). */
  question(view: unknown, step: number, settings: MinigameSettings): string;
  /** An option's button text. */
  label(option: string, view: unknown, settings: MinigameSettings): ReactNode;
  /** A side's board (its cards, its door…), or nothing. `mine`: on the side's own phone. */
  board?(side: StepSideView, settings: MinigameSettings, mine: boolean): ReactNode;
  /** What is at stake under a step's question (icons, with words for screen readers), from the side's view when there is one. */
  stake?(step: number, settings: MinigameSettings, view?: unknown): ReactNode;
  /** A move besides the option buttons (Galgje: guessing the whole word), under them. */
  extra?(props: { view: unknown; settings: MinigameSettings; disabled: boolean; onChoose: (option: string) => void }): ReactNode;
}

export function StepChoices({ renderer, options, view, settings, disabled, onChoose }: {
  renderer: StepRenderer; options: readonly string[]; view: unknown; settings: MinigameSettings;
  disabled: boolean; onChoose: (option: string) => void;
}) {
  return <div className={`step-options options-${options.length}`}>{options.map(option =>
    <button key={option} type="button" className={`big step-option option-${option}`} disabled={disabled}
      onClick={() => onChoose(option)}>{renderer.label(option, view, settings)}</button>)}</div>;
}

const nameOf = (state: RoomSnapshot, playerId: string | null) => state.players.find(player => player.id === playerId)?.displayName ?? translate(CONTROL_TEXTS, 'someone');

/** Who may tap the move for this side now: anyone, the captain, or (in a vote) everyone who has not voted yet. */
function canMove(state: RoomSnapshot, stage: Stage, side: StepSideView, decides: TeamDecides): 'move' | 'vote' | 'voted' | 'captain' {
  const me = state.selfPlayerId ?? '';
  if (!side.teamId) return 'move';
  if (decides === 'vote') return side.voters.includes(me) ? 'voted' : 'vote';
  const captain = decides === 'captain' ? side.captainId : stage.teams?.answers === 'captain' ? stage.teams.teams.find(team => team.teamId === side.teamId)?.captainId ?? null : null;
  return captain && captain !== me ? 'captain' : 'move';
}

/** A step game on a phone: the side's board, the question and its options, and in a team vote the split and the time left. */
export function StepPhone({ state, stage, offset, canPlay, disabled, onMove }: { state: RoomSnapshot; stage: Stage; offset: number; canPlay: boolean; disabled: boolean; onMove: SendMove }) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const minigame = stage.minigame!; const steps = minigame.steps; const game = minigame.game as MinigameKey;
  const renderer = STEP_RENDERERS[game]!; const settings = minigame.settings as MinigameSettings; const me = state.selfPlayerId;
  const side = steps?.sides.find(entry => entry.playerId === me || (entry.teamId !== null && stage.teams?.teams.find(team => team.teamId === entry.teamId)?.memberIds.includes(me ?? '')));
  const starts = minigame.startsAt ? Date.parse(minigame.startsAt) : null;
  // Ticking also for the other sides' vote time when this phone shows them.
  const now = useServerNow(offset, Boolean(side?.voteEndsAt) || (starts !== null && starts > Date.now() + offset - 1000)
    || (!state.screenConnected && Boolean(steps?.sides.some(entry => entry.voteEndsAt))));
  if (state.view.status === 'PAUSED') return <p className="wait-note" role="status">{t('phase.paused')}</p>;
  if (!steps || !side) return <p className="wait-note">{t(howToPlayKey(game))}</p>;
  const board = renderer.board?.(side, settings, true);
  const head = <>{side.teamId && <p className="step-team-title">{side.name}</p>}{board}</>;
  // With no screen watching, the phone also shows how the other sides are doing, as the screen would.
  const others = !state.screenConnected && steps.sides.length > 1
    ? <StepSides state={state} game={game} settings={settings} sides={steps.sides.filter(entry => entry !== side)} now={now} compact /> : null;
  if (!side.options) return <div className={`step-phone step-${game}`}>{head}
    <p className="mg-big" role="status">{side.result !== null ? minigameResult(game, side.result, settings) : game === 'speed-run' ? minigameResult(game, null, settings) : c('saved')}</p><p>{t('minigame.played')}</p>{others}</div>;
  if (!canPlay || !minigame.startsAt) return <div className={`step-phone step-${game}`}>{head}<p className="wait-note">{t(howToPlayKey(game))}</p>{others}</div>;
  // The countdown everyone starts together after (as in every minigame).
  if (starts !== null && now < starts) return <div className={`step-phone step-${game}`}>{head}<p className="mg-big" role="timer" aria-label={c('starts')}>{Math.ceil((starts - now) / 1000)}</p></div>;
  const who = canMove(state, stage, side, steps.decides);
  const left = side.voteEndsAt ? Math.max(0, Math.ceil((Date.parse(side.voteEndsAt) - now) / 1000)) : null;
  const team = stage.teams?.teams.find(entry => entry.teamId === side.teamId);
  const total = team?.memberIds.length ?? 1; const counted = side.votes.reduce((sum, vote) => sum + vote.count, 0);
  return <div className={`step-phone step-${game}`}>{head}
    <div className="step-question">
      <p className="step-ask">{renderer.question(side.view, side.step, settings)}</p>
      {renderer.stake && <div className="step-stake">{renderer.stake(side.step, settings, side.view)}</div>}
      {who === 'captain' ? <p className="wait-note step-icon-line"><span aria-hidden="true">👑</span> {c('captain', { name: nameOf(state, steps.decides === 'captain' ? side.captainId : team?.captainId ?? null) })}</p>
        : <>
          {who === 'vote' && <p className="step-vote-note step-icon-line"><span aria-hidden="true">🗳️</span> {c('teamVote')}{left !== null && <> · <span aria-hidden="true">⏱</span> {c('leftSeconds', { seconds: left })}</>}</p>}
          {who !== 'voted' && <StepChoices renderer={renderer} options={side.options} view={side.view} settings={settings} disabled={disabled}
            onChoose={option => onMove(side.step, option)} />}
          {who !== 'voted' && renderer.extra?.({ view: side.own ?? side.view, settings, disabled, onChoose: option => onMove(side.step, option) })}
          {who === 'voted' && <div className="step-votes" role="status">
            <p className="step-icon-line"><span aria-hidden="true">✓</span> {c('voted', { count: counted, total })}{left !== null && <> · <span aria-hidden="true">⏱</span> {c('leftSeconds', { seconds: left })}</>}</p>
            <ul className="step-split">{[...side.options, ...side.votes.map(vote => vote.option).filter(option => !side.options!.includes(option))].map(option => { const count = side.votes.find(vote => vote.option === option)?.count ?? 0;
              return <li key={option}><span>{renderer.label(option, side.view, settings)}</span><span className="step-bar" aria-hidden="true"><span style={{ width: `${counted ? Math.round(count / counted * 100) : 0}%` }} /></span><strong>{count}</strong></li>; })}</ul>
            <button type="button" className="step-decide" disabled={disabled} onClick={() => onMove(side.step, side.options![0]!, true)}>{c('decide')}</button>
          </div>}
        </>}
    </div>
    {others}
  </div>;
}

/** Each side's board and whether it is choosing, voting or done: on the shared screen, or (compact, without this phone's side) on a phone with no screen. */
function StepSides({ state, game, settings, sides, now, compact = false }: { state: RoomSnapshot; game: MinigameKey; settings: MinigameSettings; sides: StepSideView[]; now: number; compact?: boolean }) {
  const c = useTexts(CONTROL_TEXTS); const renderer = STEP_RENDERERS[game]!;
  const status = (side: StepSideView) => {
    if (!side.options) return side.result !== null ? minigameResult(game, side.result, settings) : game === 'speed-run' ? minigameResult(game, null, settings) : c('done');
    if (side.voteEndsAt) return c('voting', { count: side.voters.length, seconds: Math.max(0, Math.ceil((Date.parse(side.voteEndsAt) - now) / 1000)) });
    if (side.captainId) return c('captainChooses', { name: nameOf(state, side.captainId) });
    return side.step > 0 ? c('step', { number: side.step + 1 }) : c('choosing');
  };
  return <ol className={`step-sides${compact ? ' step-sides-compact' : ''}`} aria-label={c('progress')}>{sides.map(side =>
    <li key={side.teamId ?? side.playerId} className={side.options ? undefined : 'done'}><span className="step-side-name">{side.name}</span>{renderer.board?.(side, settings, false)}<span className="step-status">{status(side)}</span></li>)}</ol>;
}

/** Every side on the shared screen and for the host: its board, and whether it is choosing, voting or done. */
export function StepScreen({ state, stage, offset }: { state: RoomSnapshot; stage: Stage; offset: number }) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const minigame = stage.minigame!; const game = minigame.game as MinigameKey; const name = useTexts(CATALOG_TEXTS);
  const settings = minigame.settings as MinigameSettings; const steps = minigame.steps;
  const start = minigame.startsAt ? Date.parse(minigame.startsAt) : 0;
  const now = useServerNow(offset, Boolean(steps?.sides.some(side => side.voteEndsAt)) || (game === 'speed-run' && start > Date.now() + offset));
  const title = name(game);
  const repeatingTitle = stage.prompt.trim().replace(/[.!?]+$/, '').toLocaleLowerCase() === title.toLocaleLowerCase();
  return <div className={`mg-screen mg-${game}`}>
    {!repeatingTitle && <p className="mg-name">{title}</p>}
    {state.view.status === 'PAUSED' ? <p className="mg-paused" role="status">{t('phase.paused')}</p>
      : game === 'speed-run' && now < start ? <p className="mg-big" role="timer" aria-label={c('starts')}>{Math.ceil((start - now) / 1000)}</p>
      : steps && <StepSides state={state} game={game} settings={settings} sides={steps.sides} now={now} />}
  </div>;
}
