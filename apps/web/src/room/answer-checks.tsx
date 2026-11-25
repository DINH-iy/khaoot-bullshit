import type { RoomSnapshot } from '@party/contracts';
import { translate } from '../i18n/texts.js';
import { PLAY_TEXTS } from './play.text.js';
import { ownTeam, teamName } from './teams.js';

const p = (key: keyof typeof PLAY_TEXTS.en, values?: Record<string, string | number>) => translate(PLAY_TEXTS, key, values);
type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Send = (type: string, extra: Record<string, unknown>) => void;

/**
 * The host checks a revealed quiz or ordering round answer by answer: an answer the round scored wrong can count
 * as correct (a misspelling, a disputed question), a right one as not correct, and either verdict can be undone.
 * The points of that answer, the totals and the end awards follow. Folded: it is only needed now and then.
 */
export function AnswerChecks({ state, stage, disabled, send }: { state: RoomSnapshot; stage: Stage; disabled: boolean; send: Send }) {
  const answers = stage.reveal?.answers; if (!answers?.length) return null;
  const input = stage.input;
  const label = (key: string) => input?.kind === 'choice' ? input.options.find(option => option.key === key)?.label ?? key : input?.kind === 'order' ? input.items.find(item => item.key === key)?.label ?? key : key;
  const who = (answer: typeof answers[number]) => answer.teamId ? teamName(state, answer.teamId) : state.players.find(player => player.id === answer.playerId)?.displayName ?? p('formerPlayer');
  const verdict = (correct: boolean | null, submissionId: string) => send('score.verdict', { submissionId, correct });
  return <details className="results-more answer-checks">
    <summary>{p('checkAnswers', { count: answers.length })}</summary>
    <p className="hint">{p('checkHint')}</p>
    <ul className="plain-list">{answers.map(answer => {
      const name = who(answer); const counts = answer.verdict ?? answer.correct;
      const given = answer.choiceKey ? label(answer.choiceKey) : answer.keys ? answer.keys.map(label).join(' → ') : '—';
      return <li key={answer.submissionId} className={`answer-check ${counts ? 'right' : 'wrong'}`}>
        <span className="answer-check-text"><strong>{name}</strong><span>{given}</span>
          <small>{counts ? '✓' : '✗'} {answer.verdict === null ? p(answer.correct ? 'markedRight' : 'markedWrong') : p(answer.verdict ? 'acceptedByYou' : 'rejectedByYou')}</small></span>
        {answer.verdict !== null
          ? <button type="button" className="small-button" disabled={disabled} aria-label={p('undoVerdictLabel', { name })} onClick={() => verdict(null, answer.submissionId)}>{p('undoVerdict')}</button>
          : answer.correct
            ? <button type="button" className="small-button" disabled={disabled} aria-label={p('notCorrectLabel', { name })} onClick={() => verdict(false, answer.submissionId)}>{p('notCorrect')}</button>
            : <button type="button" className="small-button" disabled={disabled} aria-label={p('countCorrectLabel', { name })} onClick={() => verdict(true, answer.submissionId)}>{p('countCorrect')}</button>}
      </li>;
    })}</ul>
  </details>;
}

/** On a phone: the host overruled your (or your team's) answer. */
export function OwnVerdict({ state, stage }: { state: RoomSnapshot; stage: Stage }) {
  if (state.role !== 'player' || !state.selfPlayerId) return null;
  const team = ownTeam(stage.teams)?.teamId ?? null;
  const own = stage.reveal?.verdicts?.find(entry => entry.playerId === state.selfPlayerId || (team !== null && entry.teamId === team));
  if (!own) return null;
  return <p className={`own-verdict ${own.correct ? 'right' : 'wrong'}`} role="status">{p(own.teamId ? (own.correct ? 'teamAccepted' : 'teamRejected') : own.correct ? 'ownAccepted' : 'ownRejected')}</p>;
}
