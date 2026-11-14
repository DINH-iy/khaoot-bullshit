import { useCallback, useEffect, useRef, useState } from 'react';
import { FEEDBACK_DETAILS_MAX, FEEDBACK_TITLE_MAX, type FeedbackKind, type NewFeedback, type PickedElement } from '@party/contracts';
import { newId, roomApi } from '../network/api.js';
import { FEEDBACK_UI, pageContext } from './describe-element.js';
import { ElementPicker } from './element-picker.js';

const NAME_KEY = 'party-feedback-name';
const remembered = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const remember = (name: string) => { try { localStorage.setItem(NAME_KEY, name); } catch { /* private window: not remembered */ } };

export const KINDS: Record<FeedbackKind, { label: string; title: string; details: string }> = {
  bug: { label: 'Something is broken', title: 'What went wrong?', details: 'What did you do, what did you expect, and what happened instead?' },
  feature: { label: 'Idea or wish', title: 'What would you like?', details: 'How would it work? Why would it make the game better?' },
  minigame: { label: 'Minigame idea', title: 'Name of the minigame', details: 'How do you play it? Alone, 1 against 1, or in teams? How do you win?' },
};
const problems: Record<string, string> = {
  RATE_LIMITED: 'Many reports were sent from here just now. Wait a minute and try again.',
  STORAGE_FULL: 'The inbox is full for now. Tell the organiser directly.',
  INVALID_COMMAND: 'Give it a title of at least 3 characters.',
};

export function FeedbackPanel({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState(''); const [details, setDetails] = useState(''); const [name, setName] = useState(remembered);
  const [elements, setElements] = useState<PickedElement[]>([]);
  const [picking, setPicking] = useState(false); const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false); const [error, setError] = useState('');
  // One id per report: sending again after a lost reply stores it once.
  const [id, setId] = useState(newId);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!picking && !sent) first.current?.focus(); }, [picking, sent]);
  useEffect(() => {
    if (picking) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [picking, onClose]);
  const picked = useCallback((element: PickedElement) => { setElements(list => [...list, element].slice(0, 5)); setPicking(false); }, []);
  const cancel = useCallback(() => setPicking(false), []);

  const send = async (event: React.FormEvent) => {
    event.preventDefault(); setSending(true); setError('');
    const report: NewFeedback = { id, kind, title, details, reporterName: name.trim() || null, context: pageContext(elements) };
    try { await roomApi('/api/feedback', report); remember(name.trim()); setSent(true); }
    catch (cause) { setError(problems[cause instanceof Error ? cause.message : ''] ?? 'It could not be sent. Check the connection and try again.'); }
    finally { setSending(false); }
  };
  const again = () => { setId(newId()); setTitle(''); setDetails(''); setElements([]); setSent(false); };

  if (picking) return <ElementPicker onPick={picked} onCancel={cancel} />;
  return <section className="feedback-panel" role="dialog" aria-labelledby="feedback-heading" {...{ [FEEDBACK_UI]: '' }}>
    <header><h2 id="feedback-heading">Feedback</h2><button type="button" className="feedback-close" aria-label="Close feedback" onClick={onClose}>×</button></header>
    {sent ? <div className="feedback-sent" role="status"><p><strong>Thank you!</strong> Your report is in.</p>
      <div className="feedback-row"><button type="button" onClick={again}>Send another</button><button type="button" className="quiet" onClick={onClose}>Close</button></div></div>
    : <form onSubmit={event => void send(event)}>
      <fieldset className="feedback-kinds"><legend>What is it?</legend>
        {(Object.keys(KINDS) as FeedbackKind[]).map(key => <label key={key} className={kind === key ? 'chosen' : ''}>
          <input type="radio" name="feedback-kind" value={key} checked={kind === key} onChange={() => setKind(key)} />{KINDS[key].label}</label>)}
      </fieldset>
      <label>{KINDS[kind].title}<input ref={first} required minLength={3} maxLength={FEEDBACK_TITLE_MAX} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Tell us more <small>(optional)</small><textarea maxLength={FEEDBACK_DETAILS_MAX} placeholder={KINDS[kind].details} value={details} onChange={event => setDetails(event.target.value)} /></label>
      <div className="feedback-elements">
        <p>Is it about something on this screen? Point at it.</p>
        {elements.length > 0 && <ul>{elements.map((element, index) => <li key={index}>
          <span><strong>{element.label || element.text || element.tag}</strong>{element.source && <code>{element.source}</code>}</span>
          <button type="button" className="quiet" aria-label={`Remove pointed element ${index + 1}`} onClick={() => setElements(list => list.filter((_, at) => at !== index))}>Remove</button></li>)}</ul>}
        {elements.length < 5 && <button type="button" className="quiet" onClick={() => setPicking(true)}>{elements.length ? 'Point at another thing' : 'Point at something'}</button>}
      </div>
      <label>Your name <small>(optional)</small><input maxLength={60} autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" disabled={sending || title.trim().length < 3}>{sending ? 'Sending…' : 'Send'}</button>
      <p className="feedback-note">Sent with it: this page's address (without keys), the screen size and the browser. Nothing you typed into the game.</p>
    </form>}
  </section>;
}
