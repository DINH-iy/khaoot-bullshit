import { useEffect, useMemo, useState } from 'react';
import { FEEDBACK_KINDS, FEEDBACK_STATUSES, FeedbackItemSchema, FeedbackListSchema, type FeedbackItem, type FeedbackUpdate } from '@party/contracts';
import { roomApi } from '../network/api.js';
import { feedbackText, kindLabel, sourcePath, STATUS } from './feedback-text.js';

type StatusFilter = 'open' | 'all' | FeedbackItem['status'];
const OPEN: FeedbackItem['status'][] = ['new', 'planned', 'in_progress'];
const problems: Record<string, string> = {
  UNAUTHORIZED: 'This browser is not signed in as the owner. Start the app with “npm run host”: the host menu it opens signs this browser in, then come back here.',
  AUTH_UNAVAILABLE: 'Owner access is not set up on this server.',
};
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'The server could not be reached. Check that it is running and try again.';
const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };

/** Reports from testers, to triage and hand on for fixing. */
export function FeedbackList() {
  const [items, setItems] = useState<FeedbackItem[]>(); const [error, setError] = useState('');
  const [kind, setKind] = useState<'all' | FeedbackItem['kind']>('all'); const [status, setStatus] = useState<StatusFilter>('open'); const [search, setSearch] = useState('');
  const [copied, setCopied] = useState('');
  const load = () => roomApi<unknown>('/api/host/feedback').then(data => { setItems(FeedbackListSchema.parse(data).items); setError(''); }).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); }, []);
  const shown = useMemo(() => (items ?? []).filter(item => (kind === 'all' || item.kind === kind)
    && (status === 'all' || (status === 'open' ? OPEN.includes(item.status) : item.status === status))
    && (!search.trim() || `${item.title} ${item.details} ${item.reporterName ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [items, kind, status, search]);
  const update = async (id: string, change: FeedbackUpdate) => {
    try { const saved = FeedbackItemSchema.parse(await roomApi(`/api/host/feedback/${id}`, change, 'PUT')); setItems(list => list?.map(item => item.id === id ? saved : item)); }
    catch (cause) { setError(explain(cause)); }
  };
  const remove = async (item: FeedbackItem) => {
    if (!confirm(`Delete “${item.title}” for good?`)) return;
    try { await roomApi(`/api/host/feedback/${item.id}/delete`, {}); setItems(list => list?.filter(entry => entry.id !== item.id)); }
    catch (cause) { setError(explain(cause)); }
  };
  const copied1 = async (key: string, text: string) => { setCopied(await copy(text) ? key : 'failed'); setTimeout(() => setCopied(''), 2000); };
  const counts = (key: FeedbackItem['kind']) => (items ?? []).filter(item => item.kind === key && OPEN.includes(item.status)).length;

  return <>
    <p className="admin-intro">Bug reports, feature requests and minigame ideas from people trying the test version. Add your own with the Feedback tab on the right.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!items && !error && <p role="status">Loading feedback…</p>}
    {items && <>
      <div className="admin-filters">
        <div role="group" aria-label="Kind" className="admin-chips">
          <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>Everything</button>
          {FEEDBACK_KINDS.map(key => <button key={key} type="button" aria-pressed={kind === key} onClick={() => setKind(key)}>{kindLabel(key)} <span>{counts(key)}</span></button>)}
        </div>
        <label>Status<select value={status} onChange={event => setStatus(event.target.value as StatusFilter)}>
          <option value="open">Open (new, planned, in progress)</option><option value="all">All</option>
          {FEEDBACK_STATUSES.map(key => <option key={key} value={key}>{STATUS[key]}</option>)}</select></label>
        <label>Search<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <button type="button" className="quiet" disabled={!shown.length} onClick={() => void copied1('all', shown.map(feedbackText).join('\n\n'))}>{copied === 'all' ? 'Copied' : `Copy ${shown.length} as text`}</button>
        <button type="button" className="quiet" onClick={() => void load()}>Refresh</button>
      </div>
      {copied === 'failed' && <p role="alert" className="error">Copying is blocked in this browser. Select the text instead.</p>}
      {!shown.length && <p className="admin-empty">Nothing here{items.length ? ' with these filters' : ' yet'}.</p>}
      <ol className="admin-list">{shown.map(item => <li key={item.id} className={`admin-item kind-${item.kind}`}>
        <div className="admin-item-head">
          <span className="admin-kind">{kindLabel(item.kind)}</span>
          <h2>{item.title}</h2>
          <select aria-label={`Status of ${item.title}`} value={item.status} onChange={event => void update(item.id, { status: event.target.value as FeedbackItem['status'] })}>
            {FEEDBACK_STATUSES.map(key => <option key={key} value={key}>{STATUS[key]}</option>)}</select>
        </div>
        <p className="admin-meta">{new Date(item.createdAt).toLocaleString()}{item.reporterName && <> · {item.reporterName}</>} · {item.context.screen} · <a href={item.context.page}>{item.context.page}</a> · {item.context.viewport.width}×{item.context.viewport.height}</p>
        {item.details && <p className="admin-details">{item.details}</p>}
        {item.context.elements.length > 0 && <ul className="admin-elements">{item.context.elements.map((element, index) => <li key={index}>
          <strong>{element.label || element.text || `<${element.tag}>`}</strong>
          {element.source ? <code>{sourcePath(element.source)}</code> : <small>No source location (outside the tagged app code)</small>}
          {element.sources.length > 0 && <small>inside {element.sources.map(sourcePath).join(' → ')}</small>}
          <small className="admin-selector">{element.selector}</small></li>)}</ul>}
        <label className="admin-note">Your note<textarea defaultValue={item.ownerNote ?? ''} maxLength={2000} rows={2}
          onBlur={event => { if (event.target.value.trim() !== (item.ownerNote ?? '')) void update(item.id, { ownerNote: event.target.value }); }} /></label>
        <div className="admin-actions">
          <select aria-label={`Kind of ${item.title}`} value={item.kind} onChange={event => void update(item.id, { kind: event.target.value as FeedbackItem['kind'] })}>
            {FEEDBACK_KINDS.map(key => <option key={key} value={key}>{kindLabel(key)}</option>)}</select>
          <button type="button" className="quiet" onClick={() => void copied1(item.id, feedbackText(item))}>{copied === item.id ? 'Copied' : 'Copy as text'}</button>
          <button type="button" className="danger" onClick={() => void remove(item)}>Delete</button>
        </div>
      </li>)}</ol>
    </>}
  </>;
}
