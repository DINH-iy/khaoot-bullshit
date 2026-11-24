import { useId, useState } from 'react';
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
  return <Ballot sessionId={state.view.sessionId} ballot={stage.ballot ?? []} mode={stage.voteMode ?? 'single'} limit={stage.voteLimit ?? 1}
    saved={voteChoices(savedVote(state))} canVote={canVote} disabled={disabled} onVote={onVote} />;
}

export function Ballot({ sessionId, ballot, mode, limit, saved, canVote, disabled, onVote }: {
  sessionId: string; ballot: Entry[]; mode: NonNullable<Stage['voteMode']>; limit: number; saved: readonly string[];
  canVote: boolean; disabled: boolean; onVote: (value: SubmissionValue) => void;
}) {
  const t = useText();
  const controls = useTexts(ROUND_CONTROL_TEXTS);
  const [choices, setChoices] = useState<string[]>([]);
  const toggle = (id: string) => setChoices(previous => mode === 'single' ? [id] : previous.includes(id) ? previous.filter(choice => choice !== id) : [...previous, id].slice(0, limit));
  const ids = useId();
  if (!ballot.length) return <p>{p('nothingBallot')}</p>;
  const entries = ballot.map((entry, index) => ({ entry, name: p('entryN', { number: index + 1 }) }));
  // Pictures and drawings sit side by side as tiles; text answers are compact rows.
  const layout = `ballot ballot-${ballot.some(entry => entry.content.kind !== 'text') ? 'tiles' : 'rows'}`;
  if (!canVote) return <ul className={layout}>{entries.map(({ entry, name }) => {
    const selected = saved.includes(entry.submissionId);
    return <li key={entry.submissionId} className={`ballot-entry${selected ? ' saved-vote' : ''}${entry.own ? ' own-entry' : ''}`}>
      <span className="ballot-name">{name}{entry.own ? ' (yours)' : ''}</span>
      <BallotContent sessionId={sessionId} entry={entry} label={name} />
      {selected && <SavedVoteBadge />}
    </li>;
  })}</ul>;
  return <form className="ballot-form" onSubmit={event => { event.preventDefault(); if (choices.length && !disabled) onVote(mode === 'single' ? { kind: 'vote', submissionId: choices[0]! } : { kind: 'vote-list', submissionIds: choices }); }}>
    <fieldset className="ballot-fieldset"><legend className="ballot-legend">{t('vote.legend')}</legend>{mode === 'ranked' && <p className="ballot-hint">{controls('ranking')}</p>}<div className={layout}>{entries.map(({ entry, name }, index) => {
      const chosen = choices.indexOf(entry.submissionId);
      const nameId = `${ids}-${index}`; const textId = `${nameId}-text`; const rankId = `${nameId}-rank`;
      // Ranked: the place in the order is part of the choice's name ("1. Entry 2: …"), not only the number on the mark.
      const ranked = mode === 'ranked' && chosen >= 0;
      // The whole card is the choice; the radio or checkbox lies over the round mark, which shows ✓ (or the rank).
      return <label key={entry.submissionId} className={`ballot-entry ballot-option${chosen >= 0 ? ' chosen' : ''}${entry.own ? ' own-entry' : ''}`}>
        <span className="ballot-mark" aria-hidden="true">{chosen >= 0 ? mode === 'ranked' ? chosen + 1 : '✓' : null}</span>
        <input type={mode === 'single' ? 'radio' : 'checkbox'} name="vote" value={entry.submissionId} aria-labelledby={`${ranked ? `${rankId} ` : ''}${entry.content.kind === 'text' ? `${nameId} ${textId}` : nameId}`}
          disabled={disabled || entry.own || (mode !== 'single' && choices.length >= limit && chosen < 0)} checked={chosen >= 0} onChange={() => toggle(entry.submissionId)} />
        {ranked && <span className="visually-hidden" id={rankId}>{chosen + 1}.</span>}
        <span className="ballot-name" id={nameId}>{name}{entry.own ? ' (yours)' : ''}</span>
        {entry.content.kind === 'text' ? <span className="ballot-text" id={textId}>{entry.content.text}</span> : <BallotContent sessionId={sessionId} entry={entry} label={name} />}
      </label>;
    })}</div></fieldset>
    <button className="ballot-submit" disabled={disabled || !choices.length}>{t('vote.submit')}</button>
  </form>;
}
