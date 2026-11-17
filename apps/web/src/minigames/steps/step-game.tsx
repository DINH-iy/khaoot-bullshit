import type { ReactNode } from 'react';
import { formatMinigameResult, MINIGAMES, type MinigameKey, type MinigameSettings, type RoomSnapshot, type StepSideView, type TeamDecides } from '@party/contracts';
import { useText } from '../../presentation/look.js';
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
  /** A line under a step's question (what is at stake). */
  stake?(step: number, settings: MinigameSettings): string | null;
}

const nameOf = (state: RoomSnapshot, playerId: string | null) => state.players.find(player => player.id === playerId)?.displayName ?? 'someone';

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
  const t = useText(); const minigame = stage.minigame!; const steps = minigame.steps; const game = minigame.game as MinigameKey;
  const renderer = STEP_RENDERERS[game]!; const settings = minigame.settings as MinigameSettings; const me = state.selfPlayerId;
  const side = steps?.sides.find(entry => entry.playerId === me || (entry.teamId !== null && stage.teams?.teams.find(team => team.teamId === entry.teamId)?.memberIds.includes(me ?? '')));
  const starts = minigame.startsAt ? Date.parse(minigame.startsAt) : null;
  const now = useServerNow(offset, Boolean(side?.voteEndsAt) || (starts !== null && starts > Date.now() + offset - 1000));
  if (state.view.status === 'PAUSED') return <p className="wait-note" role="status">{t('minigame.paused')}</p>;
  if (!steps || !side) return <p className="wait-note">{MINIGAMES[game].howToPlay}</p>;
  const board = renderer.board?.(side, settings, true);
  const head = <>{side.teamId && <p className="step-team-title">{side.name}</p>}{board}</>;
  if (!side.options) return <div className="step-phone">{head}
    <p className="mg-big" role="status">{side.result !== null ? formatMinigameResult(game, side.result, settings) : 'Your choice is in.'}</p><p>{t('minigame.played')}</p></div>;
  if (!canPlay || !minigame.startsAt) return <div className="step-phone">{head}<p className="wait-note">{MINIGAMES[game].howToPlay}</p></div>;
  // The countdown everyone starts together after (as in every minigame).
  if (starts !== null && now < starts) return <div className="step-phone">{head}<p className="mg-big" role="timer" aria-label="Starts in">{Math.ceil((starts - now) / 1000)}</p></div>;
  const who = canMove(state, stage, side, steps.decides);
  const left = side.voteEndsAt ? Math.max(0, Math.ceil((Date.parse(side.voteEndsAt) - now) / 1000)) : null;
  const team = stage.teams?.teams.find(entry => entry.teamId === side.teamId);
  const total = team?.memberIds.length ?? 1; const counted = side.votes.reduce((sum, vote) => sum + vote.count, 0);
  return <div className="step-phone">{head}
    <div className="step-question">
      <p className="step-ask">{renderer.question(side.view, side.step, settings)}</p>
      {renderer.stake?.(side.step, settings) && <p className="step-stake">{renderer.stake(side.step, settings)}</p>}
      {who === 'captain' ? <p className="wait-note">Your captain, {nameOf(state, steps.decides === 'captain' ? side.captainId : team?.captainId ?? null)}, decides. Talk it over together.</p>
        : <>
          {who === 'vote' && <p className="step-vote-note">Vote for your team’s choice{left !== null ? ` · ${left} s left` : ''}. Who does not vote is not counted.</p>}
          {who !== 'voted' && <div className={`step-options options-${side.options.length}`}>{side.options.map(option =>
            <button key={option} type="button" className={`big step-option option-${option}`} disabled={disabled} onClick={() => onMove(side.step, option)}>{renderer.label(option, side.view, settings)}</button>)}</div>}
          {who === 'voted' && <div className="step-votes" role="status">
            <p>Your vote is in · {counted} of {total} voted{left !== null ? ` · ${left} s left` : ''}</p>
            <ul className="step-split">{side.options.map(option => { const count = side.votes.find(vote => vote.option === option)?.count ?? 0;
              return <li key={option}><span>{renderer.label(option, side.view, settings)}</span><span className="step-bar" aria-hidden="true"><span style={{ width: `${counted ? Math.round(count / counted * 100) : 0}%` }} /></span><strong>{count}</strong></li>; })}</ul>
            <button type="button" className="step-decide" disabled={disabled} onClick={() => onMove(side.step, side.options![0]!, true)}>Decide now with these votes</button>
          </div>}
        </>}
    </div>
  </div>;
}

/** Every side on the shared screen and for the host: its board, and whether it is choosing, voting or done. */
export function StepScreen({ state, stage, offset }: { state: RoomSnapshot; stage: Stage; offset: number }) {
  const t = useText(); const minigame = stage.minigame!; const game = minigame.game as MinigameKey; const info = MINIGAMES[game];
  const renderer = STEP_RENDERERS[game]!; const settings = minigame.settings as MinigameSettings; const steps = minigame.steps;
  const now = useServerNow(offset, Boolean(steps?.sides.some(side => side.voteEndsAt)));
  const status = (side: StepSideView) => {
    if (!side.options) return side.result !== null ? formatMinigameResult(game, side.result, settings) : 'Done';
    if (side.voteEndsAt) return `Voting · ${side.voters.length} voted · ${Math.max(0, Math.ceil((Date.parse(side.voteEndsAt) - now) / 1000))} s`;
    if (side.captainId) return `Captain ${nameOf(state, side.captainId)} decides`;
    return side.step > 0 ? `Step ${side.step + 1}` : 'Choosing';
  };
  return <div className={`mg-screen mg-${game}`}>
    <p className="mg-name">{info.name}</p>
    <p className="mg-how">{info.howToPlay}</p>
    {state.view.status === 'PAUSED' ? <p className="mg-big wait" role="status">{t('minigame.paused')}</p>
      : steps && <ol className="step-sides" aria-label="Everyone’s progress">{steps.sides.map(side =>
        <li key={side.teamId ?? side.playerId} className={side.options ? undefined : 'done'}><span className="step-side-name">{side.name}</span>{renderer.board?.(side, settings, false)}<span className="step-status">{status(side)}</span></li>)}</ol>}
  </div>;
}
