import { useState } from 'react';
import { voteChoices, type SubmissionValue, type RoomSnapshot } from '@party/contracts';
import { MediaView } from './media-upload.js';
import { translate, useTexts } from '../i18n/texts.js';
import { useText } from '../presentation/look.js';
import { ROUND_CONTROL_TEXTS } from './round-control.text.js';
import { PLAY_TEXTS } from './play.text.js';
const p = (key: keyof typeof PLAY_TEXTS.en, values?: Record<string, string | number>) => translate(PLAY_TEXTS, key, values);
import { StoredDrawing } from '../drawing/drawing-view.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
export function savedVote(state: RoomSnapshot) {
  return state.role === 'player' ? state.view.ownSubmission?.value : undefined;
}

export function SavedVoteBadge() {
  return <span className="saved-vote-badge"><span aria-hidden="true">✓ </span>{p('savedVote')}</span>;
}

type Entry = NonNullable<Stage['ballot']>[number];

export function BallotContent({ sessionId, entry, label }: { sessionId: string; entry: Entry; label: string }) {
  return entry.content.kind === 'text' ? <span className="ballot-text">{entry.content.text}</span>
    : entry.content.kind === 'drawing' ? <StoredDrawing sessionId={sessionId} assetIds={[entry.content.assetId]} label={label} /> : <MediaView sessionId={sessionId} media={entry.content} label={label} />;
}

/** Players can choose or rank eligible entries. The host and display view the ballot. */
export function VoteBallot({ state, stage, canVote, disabled, onVote }: { state: RoomSnapshot; stage: Stage; canVote: boolean; disabled: boolean; onVote: (value: SubmissionValue) => void }) {
  const t = useText();
  const controls = useTexts(ROUND_CONTROL_TEXTS);
  const [choices, setChoices] = useState<string[]>([]); const ballot = stage.ballot ?? [];
  const mode = stage.voteMode ?? 'single';
  const limit = stage.voteLimit ?? 1;
  const toggle = (id: string) => setChoices(previous => mode === 'single' ? [id] : previous.includes(id) ? previous.filter(choice => choice !== id) : [...previous, id].slice(0, limit));
  if (!ballot.length) return <p>{p('nothingBallot')}</p>;
  const entries = ballot.map((entry, index) => ({ entry, name: p('entryN', { number: index + 1 }) }));
  const saved = voteChoices(savedVote(state));
  if (!canVote) return <ul className="ballot">{entries.map(({ entry, name }) => {
    const selected = saved.includes(entry.submissionId);
    return <li key={entry.submissionId} className={`ballot-entry${selected ? ' saved-vote' : ''}`}>
      <span>{name}{entry.own ? ' (yours)' : ''}</span>
      <BallotContent sessionId={state.view.sessionId} entry={entry} label={name} />
      {selected && <SavedVoteBadge />}
    </li>;
  })}</ul>;
  return <form onSubmit={event => { event.preventDefault(); if (choices.length && !disabled) onVote(mode === 'single' ? { kind: 'vote', submissionId: choices[0]! } : { kind: 'vote-list', submissionIds: choices }); }}>
    <fieldset><legend>{t('vote.legend')}</legend>{mode === 'ranked' && <p>{controls('ranking')}</p>}<div className="ballot">{entries.map(({ entry, name }) => <div key={entry.submissionId} className="ballot-entry">
      <label className="choice"><input type={mode === 'single' ? 'radio' : 'checkbox'} name="vote" value={entry.submissionId} disabled={disabled || entry.own || (mode !== 'single' && choices.length >= limit && !choices.includes(entry.submissionId))} checked={choices.includes(entry.submissionId)} onChange={() => toggle(entry.submissionId)} />
        <span>{mode === 'ranked' && choices.includes(entry.submissionId) && <strong>{choices.indexOf(entry.submissionId) + 1}. </strong>}{name}{entry.own ? ' (yours, you cannot vote for it)' : ''}{entry.content.kind === 'text' ? <>: <span className="ballot-text">{entry.content.text}</span></> : null}</span></label>
      {entry.content.kind !== 'text' && <BallotContent sessionId={state.view.sessionId} entry={entry} label={name} />}
    </div>)}</div></fieldset>
    <button disabled={disabled || !choices.length}>{t('vote.submit')}</button>
  </form>;
}
