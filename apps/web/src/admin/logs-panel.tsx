import { useEffect, useMemo, useState } from 'react';
import { LogDetailSchema, LogListSchema, type DeviceEvent, type LogDetail, type LogSummary } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { SIGNED_OUT_TEXT } from '../owner/owner-session.js';
import { FaIcon } from '../presentation/icons.js';
import { UNEXPECTED_CODES } from '../diagnostics/device-log.js';
import { logText } from './logs-text.js';

type Filter = 'problems' | 'game_over' | 'all';
const isProblem = (item: LogSummary) => item.source === 'server' || item.reason === 'problem';
const explain = (cause: unknown) => cause instanceof Error && cause.message === 'UNAUTHORIZED' ? SIGNED_OUT_TEXT : 'The server could not be reached. Check that it is running and try again.';
const REASONS: Record<string, string> = { problem: 'Problem', game_over: 'Game over', server_error: 'Server error' };
const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };

/**
 * Admin → Device logs: what devices sent by themselves when something went wrong or a game ended, and the
 * server's own unexpected errors. Kept 7 days.
 */
export function LogsPanel() {
  const [items, setItems] = useState<LogSummary[]>(); const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('problems'); const [search, setSearch] = useState('');
  const load = () => roomApi<unknown>('/api/host/logs').then(data => { setItems(LogListSchema.parse(data).items); setError(''); }).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); }, []);
  const query = search.trim().toLowerCase();
  const shown = useMemo(() => (items ?? []).filter(item => (filter === 'all' || (filter === 'problems' ? isProblem(item) : item.reason === 'game_over'))
    && (!query || `${item.summary} ${item.place ?? ''} ${item.who} ${item.requestId ?? ''} ${item.sessionId ?? ''}`.toLowerCase().includes(query))), [items, filter, query]);
  const count = (key: Filter) => (items ?? []).filter(item => key === 'problems' ? isProblem(item) : key === 'game_over' ? item.reason === 'game_over' : true).length;

  return <>
    <p className="admin-intro">Phones and screens send what happened on them when something goes wrong, and once when a game ends. The server adds its own errors. Players see none of this. Logs are kept for 7 days.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!items && !error && <p role="status">Loading logs…</p>}
    {items && <>
      <div className="admin-filters log-filters">
        <div role="group" aria-label="Show" className="admin-chips">
          {(['problems', 'game_over', 'all'] as const).map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {key === 'problems' ? 'Problems' : key === 'game_over' ? 'Finished games' : 'Everything'} <span>{count(key)}</span></button>)}
        </div>
        <label>Search<input type="search" placeholder="Room code, player, error code" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <button type="button" className="quiet log-action" onClick={() => void load()}><FaIcon name="rotate" /> Refresh</button>
      </div>
      {!shown.length && <p className="admin-empty">{items.length ? 'Nothing with these filters.' : 'Nothing yet. That is good news.'}</p>}
      <ol className="admin-list">{shown.map(item => <LogItem key={item.id} item={item} />)}</ol>
    </>}
  </>;
}

function LogItem({ item }: { item: LogSummary }) {
  const [open, setOpen] = useState(false); const [detail, setDetail] = useState<LogDetail>(); const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (!open || detail) return;
    void roomApi<unknown>(`/api/host/logs/${item.id}`).then(data => setDetail(LogDetailSchema.parse(data))).catch(() => setFailed(true));
  }, [open, detail, item.id]);
  const copyAll = async () => { if (!detail) return; setCopied(await copy(logText(detail)) ? 'Copied' : 'Copying is blocked here'); setTimeout(() => setCopied(''), 2000); };
  const kind = item.source === 'server' ? 'server' : item.reason === 'game_over' ? 'finished' : 'problem';
  return <li className={`admin-item log-item log-${kind}`}>
    <div className="admin-item-head">
      <span className="admin-kind">{REASONS[item.reason] ?? item.reason}</span>
      <h2>{item.summary || '(no summary)'}</h2>
      <button type="button" className="quiet log-action log-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <FaIcon name={open ? 'chevron-up' : 'chevron-down'} /> {open ? 'Hide' : 'Show'}</button>
    </div>
    <p className="admin-meta">{new Date(item.createdAt).toLocaleString()} · {item.who}{item.place && <> · {item.place}</>}{item.requestId && <> · request <code>{item.requestId.slice(0, 8)}</code></>}</p>
    {open && (failed ? <p role="alert" className="error">Could not load this log.</p> : !detail ? <p role="status">Loading…</p> : <>
      {detail.server && <ServerError problem={detail.server} />}
      {detail.stats && <Stats detail={detail} />}
      {detail.related.length > 0 && <section className="log-related" aria-label="Server errors around this time">
        <h3>On the server around this time</h3>
        {detail.related.map(related => <div key={related.id}><p className="admin-meta">{new Date(related.createdAt).toLocaleTimeString()}{related.requestId && <> · request <code>{related.requestId.slice(0, 8)}</code></>}</p><ServerError problem={related.server} /></div>)}
      </section>}
      {detail.events.length > 0 && <Timeline events={detail.events} />}
      <div className="admin-actions">
        <button type="button" className="quiet log-action" onClick={() => void copyAll()}><FaIcon name="copy" /> {copied || 'Copy as text'}</button>
      </div>
    </>)}
  </li>;
}

function ServerError({ problem }: { problem: NonNullable<LogDetail['server']> }) {
  return <div className="log-server">
    <p><strong>{problem.message}</strong></p>
    <p className="admin-meta">{problem.where} · asked by {problem.actor}</p>
    {problem.stack.length > 0 && <pre>{problem.stack.join('\n')}</pre>}
  </div>;
}

const ms = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`;
function Stats({ detail }: { detail: LogDetail }) {
  const stats = detail.stats!; const device = detail.device;
  const figures: [string, string, string][] = [
    ['Server answers', stats.requests ? ms(stats.requests.median) : '–', stats.requests ? `typical · slowest ${ms(stats.requests.max)} · ${stats.requests.count} in all` : 'none'],
    ['Connection check', stats.heartbeat ? ms(stats.heartbeat.median) : '–', stats.heartbeat ? `typical round trip · slowest ${ms(stats.heartbeat.max)}` : 'not in a room'],
    ['Page busy', stats.longTasks ? String(stats.longTasks.count) : '–', stats.longTasks ? `times · longest ${ms(stats.longTasks.max)}` : 'not measured on this browser'],
    ['Reconnects', String(stats.reconnects), device ? `${device.viewport.width}×${device.viewport.height} · device ${device.id}` : ''],
  ];
  return <>
    <ul className="people-summary log-stats">{figures.map(([label, value, note]) => <li key={label}><span className="people-summary-label">{label}</span><strong>{value}</strong><small>{note}</small></li>)}</ul>
    {device && <p className="admin-meta log-agent">{device.userAgent}</p>}
  </>;
}

const clock = (at: number) => { const time = new Date(at); return `${time.toLocaleTimeString([], { hour12: false })}.${String(Math.floor(time.getMilliseconds() / 100))}`; };
const badCode = (event: DeviceEvent) => event.kind === 'error' || (event.code !== undefined && (UNEXPECTED_CODES.has(event.code) || /^5\d\d$/.test(event.code) || event.code === 'no connection'));
function Timeline({ events }: { events: DeviceEvent[] }) {
  // Scrolls sideways on a narrow screen; focusable so the keyboard can scroll it too.
  return <div className="log-timeline-wrap" tabIndex={0} role="region" aria-label="Device timeline"><table className="log-timeline">
    <caption>What happened on the device, oldest first</caption>
    <thead><tr><th scope="col">Time</th><th scope="col">Kind</th><th scope="col">What</th><th scope="col">Answer</th><th scope="col" className="num">Took</th><th scope="col">Screen</th></tr></thead>
    <tbody>{events.map((event, index) => <tr key={index} className={badCode(event) ? 'log-bad' : undefined}>
      <td>{clock(event.at)}</td><td>{event.kind}</td>
      <td>{event.what}{event.n ? ` ×${event.n}` : ''}</td>
      <td>{event.code ?? ''}{event.requestId && <small> · {event.requestId.slice(0, 8)}</small>}</td>
      <td className="num">{event.ms !== undefined ? ms(event.ms) : ''}</td><td>{event.screen}</td>
    </tr>)}</tbody>
  </table></div>;
}
