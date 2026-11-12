import type { RoomSnapshot, SubmissionValue } from '@party/contracts';
import { MediaUpload, type UploadedMedia } from './media-upload.js';

type Input = NonNullable<NonNullable<RoomSnapshot['view']['stage']>['input']>;
export interface Draft { text: string; order: string[]; media?: UploadedMedia | undefined }
export const emptyDraft = (input: Input | null | undefined): Draft => ({ text: '', order: input?.kind === 'order' ? input.items.map(item => item.key) : [] });
export function draftValue(input: Input, draft: Draft): SubmissionValue | null {
  if (input.kind === 'choice') return draft.text ? { kind: 'choice', choiceKey: draft.text } : null;
  if (input.kind === 'text') return draft.text.trim() ? { kind: 'text', text: draft.text } : null;
  if (input.kind === 'order') return draft.order.length === input.items.length ? { kind: 'order', keys: draft.order } : null;
  if (input.kind === 'media') return draft.media ? { kind: 'media', assetId: draft.media.assetId } : null;
  return null;
}

/** The answer control for one round. Which one appears is set per round in the game. */
export function AnswerInput({ sessionId, input, draft, onChange, legend = 'Your private answer' }: { sessionId: string; input: Input; draft: Draft; onChange: (draft: Draft) => void; legend?: string }) {
  if (input.kind === 'choice') {
    const tiles = input.layout === 'tiles';
    return <fieldset className={tiles ? 'tiles' : undefined}><legend>{legend}</legend>{input.options.map((option, index) => <label className={tiles ? 'tile' : 'choice'} key={option.key}>
      <input type="radio" name="answer" value={option.key} checked={draft.text === option.key} onChange={() => onChange({ ...draft, text: option.key })} />
      {tiles && <span className="tile-mark" aria-hidden="true">{String.fromCharCode(65 + index)}</span>}{option.label}</label>)}</fieldset>;
  }
  if (input.kind === 'text') return <label>Your private answer<textarea value={draft.text} onChange={event => onChange({ ...draft, text: event.target.value })} maxLength={input.maxLength} /></label>;
  if (input.kind === 'order') {
    const labels = new Map(input.items.map(item => [item.key, item.label]));
    const move = (index: number, by: -1 | 1) => {
      const order = [...draft.order]; const [key] = order.splice(index, 1); order.splice(index + by, 0, key!); onChange({ ...draft, order });
    };
    // Buttons rather than dragging: works with touch, keyboard and screen readers alike.
    return <fieldset><legend>Your private order, first at the top</legend><ol className="order-list">{draft.order.map((key, index) => <li key={key}>
      <span className="order-label">{labels.get(key)}</span>
      <button type="button" className="order-move" disabled={index === 0} aria-label={`Move ${labels.get(key)} up`} onClick={() => move(index, -1)}>↑</button>
      <button type="button" className="order-move" disabled={index === draft.order.length - 1} aria-label={`Move ${labels.get(key)} down`} onClick={() => move(index, 1)}>↓</button>
    </li>)}</ol><span className="visually-hidden" role="status">{draft.order.map(key => labels.get(key)).join(', ')}</span></fieldset>;
  }
  if (input.kind === 'media') return <MediaUpload sessionId={sessionId} accept={input.accept} value={draft.media} onChange={media => onChange({ ...draft, media })} />;
  return <p>Drawing is not enabled in this checkpoint.</p>;
}
