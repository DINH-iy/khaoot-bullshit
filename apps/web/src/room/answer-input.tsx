import type { RoomSnapshot, SubmissionValue } from '@party/contracts';
import { MediaUpload, type UploadedMedia } from './media-upload.js';
import { answerFit } from './answer-fit.js';
import { answerMark } from '@party/contracts';
import { useLook } from '../presentation/look.js';
import { translate } from '../i18n/texts.js';
import { PLAY_TEXTS } from './play.text.js';
const p = (key: keyof typeof PLAY_TEXTS.en, values?: Record<string, string | number>) => translate(PLAY_TEXTS, key, values);
import { Mark } from '../presentation/mark-icons.js';

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
export function AnswerInput({ sessionId, input, draft, onChange, legend, route = false }: { sessionId: string; input: Input; draft: Draft; onChange: (draft: Draft) => void; legend?: string; route?: boolean }) {
  const { theme, text: t } = useLook(); legend ??= t('answer.legend');
  if (input.kind === 'choice') {
    // A route vote is a fork in the road: big tiles with arrows, always, so it is clear a direction is being chosen.
    const tiles = route || input.layout === 'tiles';
    return <fieldset className={`${tiles ? 'tiles' : ''}${route ? ' route-tiles' : ''}`.trim() || undefined} style={tiles ? answerFit(input.options.map(option => option.label)) : undefined}><legend>{legend}</legend>{input.options.map((option, index) => <label className={tiles ? 'tile' : 'choice'} key={option.key}>
      <input type="radio" name="answer" value={option.key} checked={draft.text === option.key} onChange={() => onChange({ ...draft, text: option.key })} />
      {tiles && (() => { const mark = answerMark(theme, index, input.options.length, route); return mark === null ? null : <span className={`answer-mark ${route ? 'route-arrow' : 'tile-mark'}`} aria-hidden="true"><Mark text={mark} /></span>; })()}{option.label}</label>)}</fieldset>;
  }
  if (input.kind === 'text') return <><label>{legend}<textarea value={draft.text} onChange={event => onChange({ ...draft, text: event.target.value })} maxLength={input.maxLength} /></label>
    {/* How much room is left, so the limit never comes as a surprise. */}
    <span className={`char-count${draft.text.length >= input.maxLength ? ' full' : ''}`} aria-live={draft.text.length >= input.maxLength * 0.8 ? 'polite' : 'off'}>{draft.text.length} / {input.maxLength}</span></>;
  if (input.kind === 'order') {
    const labels = new Map(input.items.map(item => [item.key, item.label]));
    const move = (index: number, by: -1 | 1) => {
      const order = [...draft.order]; const [key] = order.splice(index, 1); order.splice(index + by, 0, key!); onChange({ ...draft, order });
    };
    // Buttons rather than dragging: works with touch, keyboard and screen readers alike.
    return <fieldset><legend>{p('privateOrder')}</legend><ol className="order-list">{draft.order.map((key, index) => <li key={key}>
      <span className="order-label">{labels.get(key)}</span>
      <button type="button" className="order-move" disabled={index === 0} aria-label={p('moveUp', { item: labels.get(key) ?? key })} onClick={() => move(index, -1)}>↑</button>
      <button type="button" className="order-move" disabled={index === draft.order.length - 1} aria-label={p('moveDown', { item: labels.get(key) ?? key })} onClick={() => move(index, 1)}>↓</button>
    </li>)}</ol><span className="visually-hidden" role="status">{draft.order.map(key => labels.get(key)).join(', ')}</span></fieldset>;
  }
  if (input.kind === 'media') return <MediaUpload sessionId={sessionId} accept={input.accept} value={draft.media} onChange={media => onChange({ ...draft, media })} />;
  return <p>{p('noDrawing')}</p>;
}
