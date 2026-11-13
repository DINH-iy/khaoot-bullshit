import { useState } from 'react';
import type { RoomSnapshot } from '@party/contracts';
import { MediaView } from './media-upload.js';
import { StoredDrawing } from '../drawing/drawing-view.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Entry = NonNullable<Stage['ballot']>[number];

export function BallotContent({ sessionId, entry, label }: { sessionId: string; entry: Entry; label: string }) {
  return entry.content.kind === 'text' ? <span className="ballot-text">{entry.content.text}</span>
    : entry.content.kind === 'drawing' ? <StoredDrawing sessionId={sessionId} assetIds={[entry.content.assetId]} label={label} /> : <MediaView sessionId={sessionId} media={entry.content} label={label} />;
}

/** The ballot. Players pick one entry that is not their own; host and display only look. */
export function VoteBallot({ state, stage, canVote, disabled, onVote }: { state: RoomSnapshot; stage: Stage; canVote: boolean; disabled: boolean; onVote: (submissionId: string) => void }) {
  const [choice, setChoice] = useState(''); const ballot = stage.ballot ?? [];
  if (!ballot.length) return <p>There is nothing to vote on: nobody answered that round.</p>;
  const entries = ballot.map((entry, index) => ({ entry, name: `Entry ${index + 1}` }));
  if (!canVote) return <ul className="ballot">{entries.map(({ entry, name }) => <li key={entry.submissionId} className="ballot-entry"><span>{name}{entry.own ? ' (yours)' : ''}</span><BallotContent sessionId={state.view.sessionId} entry={entry} label={name} /></li>)}</ul>;
  return <form onSubmit={event => { event.preventDefault(); if (choice) onVote(choice); }}>
    <fieldset><legend>Your private vote</legend><div className="ballot">{entries.map(({ entry, name }) => <div key={entry.submissionId} className="ballot-entry">
      <label className="choice"><input type="radio" name="vote" value={entry.submissionId} disabled={entry.own} checked={choice === entry.submissionId} onChange={() => setChoice(entry.submissionId)} />
        <span>{name}{entry.own ? ' (yours, you cannot vote for it)' : ''}{entry.content.kind === 'text' ? <>: <span className="ballot-text">{entry.content.text}</span></> : null}</span></label>
      {entry.content.kind !== 'text' && <BallotContent sessionId={state.view.sessionId} entry={entry} label={name} />}
    </div>)}</div></fieldset>
    <button disabled={disabled || !choice}>Save vote</button>
  </form>;
}
