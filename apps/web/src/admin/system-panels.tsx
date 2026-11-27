import { useEffect, useMemo, useState } from 'react';
import { AdminActionListSchema, AdminHealthSchema, AdminRoomsSchema, AdminStorageSchema, type AdminActionList, type AdminHealth, type AdminRooms, type AdminStorage } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { SIGNED_OUT_TEXT } from '../owner/owner-session.js';
import { FaIcon } from '../presentation/icons.js';

// Admin → Live rooms, Storage and Action log: the owner's view of what the server is doing and what changed.
const explain = (cause: unknown) => cause instanceof Error && cause.message === 'UNAUTHORIZED' ? SIGNED_OUT_TEXT : 'The server could not be reached. Check that it is running and try again.';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const ago = (iso: string) => { const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000); return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`; };
export const bytes = (value: number) => value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(0)} KB` : value < 1024 ** 3 ? `${(value / 1024 ** 2).toFixed(1)} MB` : `${(value / 1024 ** 3).toFixed(2)} GB`;

const KINDS: Record<AdminRooms['rooms'][number]['kind'], string> = { game: 'Game', rehearsal: 'Rehearsal', tryout: 'Minigame tryout', arcade: 'Arcade round' };
const STATUS: Record<AdminRooms['rooms'][number]['status'], string> = { LOBBY: 'Waiting to start', RUNNING: 'Playing', PAUSED: 'Paused', FINISHED: 'Finished' };

/** Every room still open: its game, who is in it, and closing it (its answers and scores stay). */
export function LiveRoomsPanel() {
  const [data, setData] = useState<AdminRooms>(); const [error, setError] = useState(''); const [closing, setClosing] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = () => roomApi<unknown>('/api/host/admin/rooms').then(raw => { setData(AdminRoomsSchema.parse(raw)); setError(''); }).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 15_000); return () => clearInterval(timer); }, []);
  const close = (sessionId: string) => { setBusy(true); void roomApi(`/api/host/admin/rooms/${sessionId}/close`, {}).then(() => { setClosing(null); return load(); }).catch(cause => setError(explain(cause))).finally(() => setBusy(false)); };
  const enter = (sessionId: string) => { setBusy(true); void roomApi(`/api/host/rooms/${sessionId}/enter`, {}).then(() => { location.href = `/?room=${sessionId}`; }).catch(cause => { setError(explain(cause)); setBusy(false); }); };
  return <>
    <p className="admin-intro">Every room that is still open: games you host, rehearsals, the minigame tryout and arcade rounds. Closing a room ends it for everyone, like a finished game; its answers and scores stay. The list refreshes by itself.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!data && !error && <p role="status">Loading rooms…</p>}
    {data && !data.rooms.length && <p className="admin-empty">No open rooms right now.</p>}
    {data && data.rooms.length > 0 && <ol className="admin-list">{data.rooms.map(room => <li key={room.sessionId} className="admin-item">
      <div className="admin-item-head"><span className="admin-kind">{KINDS[room.kind]}</span><h2>{room.title}</h2></div>
      <p className="admin-meta">Room <strong>{room.roomCode ?? '—'}</strong> · {STATUS[room.status]} · {room.players} {room.players === 1 ? 'player' : 'players'} · opened {when(room.openedAt)} · last activity {ago(room.lastActiveAt)}</p>
      <div className="actions">
        {room.yours && room.kind === 'game' && <button type="button" disabled={busy} onClick={() => enter(room.sessionId)}><FaIcon name="tv" /> Open as host</button>}
        {closing === room.sessionId
          ? <><button type="button" className="danger" disabled={busy} onClick={() => close(room.sessionId)}>Yes, close room {room.roomCode}</button><button type="button" onClick={() => setClosing(null)}>Keep it open</button></>
          : <button type="button" className="danger" onClick={() => setClosing(room.sessionId)}><FaIcon name="xmark" /> Close room</button>}
      </div>
    </li>)}</ol>}
  </>;
}

/** What the server keeps and the free disk space; the usual clean-up, run now. */
export function StoragePanel() {
  const [data, setData] = useState<AdminStorage>(); const [error, setError] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => roomApi<unknown>('/api/host/admin/storage').then(raw => { setData(AdminStorageSchema.parse(raw)); setError(''); }).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); }, []);
  const clean = () => { setBusy(true); setNote(''); void roomApi<{ removed: number; partials: number }>('/api/host/admin/storage/clean-up', {})
    .then(result => { setNote(result.removed || result.partials ? `Removed ${result.removed} files${result.partials ? ` and ${result.partials} unfinished uploads` : ''}.` : 'Nothing to clean up right now.'); return load(); })
    .catch(cause => setError(explain(cause))).finally(() => setBusy(false)); };
  const library = data?.library.reduce((sum, row) => sum + row.bytes, 0) ?? 0;
  const used = data?.disk ? 1 - data.disk.free / Math.max(1, data.disk.total) : 0;
  return <>
    <p className="admin-intro">What this server keeps. Players' uploads (photos, drawings, videos) are removed {data?.retentionDays ?? 14} days after their room ends, and unused ones sooner; the clean-up runs every 10 minutes. Removing never touches scores, answers or the media library.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!data && !error && <p role="status">Loading…</p>}
    {data && <>
      {data.disk && <div className="storage-disk"><p><strong>Disk</strong> · {bytes(data.disk.free)} free of {bytes(data.disk.total)}</p>
        <div className={`storage-bar${used > 0.9 ? ' full' : ''}`} role="meter" aria-label="Disk used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)}><span style={{ width: `${Math.round(used * 100)}%` }} /></div></div>}
      <dl className="storage-list">
        <div><dt>Media library</dt><dd>{bytes(library)} · {data.library.map(row => `${row.files} ${row.kind}`).join(', ') || 'empty'}</dd></div>
        <div><dt>Players' uploads</dt><dd>{bytes(data.uploads.bytes)} · {data.uploads.files} files ({data.uploads.cleared} already cleared)</dd></div>
        <div><dt>Feedback attachments</dt><dd>{bytes(data.feedback.bytes)} · {data.feedback.files} files</dd></div>
        <div><dt>Device logs</dt><dd>{data.deviceLogs} (kept 7 days)</dd></div>
        <div><dt>Database</dt><dd>{bytes(data.databaseBytes)}</dd></div>
      </dl>
      <div className="actions"><button type="button" disabled={busy} onClick={clean}><FaIcon name="rotate" /> {busy ? 'Cleaning up…' : 'Clean up now'}</button></div>
      {note && <p role="status" className="admin-meta">{note}</p>}
    </>}
  </>;
}

const ACTIONS: Record<string, string> = {
  'person.added': 'Added a person', 'person.renamed': 'Renamed a person', 'person.editor_on': 'Gave editor rights', 'person.editor_off': 'Took editor rights away', 'person.role': 'Gave a person a role', 'role.added': 'Added a role', 'role.changed': 'Changed a role', 'role.removed': 'Removed a role', 'person.new_key': 'Made a new personal key',
  'person.signed_out': 'Signed a person out', 'person.removed': 'Removed a person', 'game.published': 'Published a game', 'game.removed': 'Removed a game', 'game.shared': 'Shared a game',
  'room.closed': 'Closed a room', 'storage.cleanup': 'Ran the clean-up', 'media.removed': 'Removed from the media library', 'font.removed': 'Removed a font', 'feedback.deleted': 'Deleted feedback',
  'health.retry-updates': 'Retried room updates', 'health.clear-finished-updates': 'Cleared old room updates', 'health.review-problems': 'Reviewed problem reports',
};
/** What the owner and editors changed, newest first. */
export function ActionLogPanel() {
  const [data, setData] = useState<AdminActionList>(); const [error, setError] = useState(''); const [search, setSearch] = useState('');
  useEffect(() => { void roomApi<unknown>('/api/host/admin/actions').then(raw => setData(AdminActionListSchema.parse(raw))).catch(cause => setError(explain(cause))); }, []);
  const query = search.trim().toLowerCase();
  const shown = useMemo(() => (data?.actions ?? []).filter(row => !query || `${row.actor} ${ACTIONS[row.action] ?? row.action} ${row.subject}`.toLowerCase().includes(query)), [data, query]);
  return <>
    <p className="admin-intro">What you and the editors changed: people, games, rooms and clean-ups. Newest first; the latest 300.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!data && !error && <p role="status">Loading…</p>}
    {data && <>
      <div className="admin-filters"><label>Search<input type="search" placeholder="Name, game, action" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
      {!shown.length && <p className="admin-empty">{data.actions.length ? 'Nothing matches.' : 'Nothing has been changed yet.'}</p>}
      <ol className="action-log">{shown.map(row => <li key={row.id}>
        <time dateTime={row.at}>{when(row.at)}</time>
        <span className="action-who">{row.byOwner ? 'You' : row.actor}</span>
        <span className="action-what">{ACTIONS[row.action] ?? row.action}</span>
        <span className="action-subject">{row.subject}</span>
      </li>)}</ol>
    </>}
  </>;
}

const PARTS: Record<string, string> = { server: 'Server', database: 'Database', rooms: 'Rooms and updates', problems: 'Problems', machine: 'This computer' };
const LEVELS: Record<AdminHealth['level'], string> = { ok: 'OK', check: 'Worth a look', problem: 'Problem' };
const SUMMARY: Record<AdminHealth['level'], string> = { ok: 'Everything looks fine.', check: 'Running, but something is worth a look.', problem: 'Something does not work.' };
/** How the server is doing right now: a verdict per part with its numbers. Refreshes by itself. */
export function HealthPanel() {
  const [data, setData] = useState<AdminHealth>(); const [error, setError] = useState('');
  const [actionError, setActionError] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [confirmClear, setConfirmClear] = useState(false);
  const load = () => roomApi<unknown>('/api/host/admin/health').then(raw => { setData(AdminHealthSchema.parse(raw)); setError(''); }).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 15_000); return () => clearInterval(timer); }, []);
  const recover = (action: 'retry-updates' | 'clear-finished-updates' | 'review-problems') => {
    if (!data) return;
    setBusy(true); setNote(''); setActionError('');
    void roomApi<{ affected: number }>('/api/host/admin/health/recover', action === 'review-problems' ? { action, checkedAt: data.checkedAt } : { action })
      .then(({ affected }) => {
        setConfirmClear(false);
        const updates = affected === 1 ? 'update' : 'updates';
        setNote(action === 'retry-updates' ? `Queued ${affected} ${updates} for another try.`
          : action === 'clear-finished-updates' ? `Cleared ${affected} old ${updates}.` : `Marked ${affected} ${affected === 1 ? 'report' : 'reports'} as reviewed.`);
        return load();
      }).catch(cause => setActionError(explain(cause))).finally(() => setBusy(false));
  };
  const recovery = data?.recovery;
  return <>
    <p className="admin-intro">How this server is doing right now. Every part says OK, worth a look, or a problem, with the numbers behind it. Refreshes every 15 seconds. Server errors and device reports are in Device logs.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {actionError && <p role="alert" className="error">{actionError}</p>}
    {note && <p role="status">{note}</p>}
    {!data && !error && <p role="status">Checking…</p>}
    {data && <>
      <p className={`health-summary level-${data.level}`} role="status"><strong>{LEVELS[data.level]}</strong> · {SUMMARY[data.level]} <span className="admin-meta">Checked {when(data.checkedAt)}</span></p>
      <div className="health-parts">{data.parts.map(part => <section key={part.key} className={`health-part level-${part.level}`} aria-labelledby={`health-${part.key}`}>
        <h2 id={`health-${part.key}`}>{PARTS[part.key] ?? part.key} <span className="health-level">{LEVELS[part.level]}</span></h2>
        <dl>{part.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
        {part.key === 'rooms' && <div className="health-actions">
          <div className="actions">
            <a className="link-button" href="/?admin=rooms">View live rooms</a>
            {Boolean(recovery?.retryable) && <button type="button" className="quiet" disabled={busy} onClick={() => recover('retry-updates')}>Retry failed updates</button>}
            {Boolean(recovery?.obsolete) && !confirmClear && <button type="button" className="danger" disabled={busy} onClick={() => setConfirmClear(true)}>Clear old updates</button>}
          </div>
          {confirmClear && <>
            <p>Remove up to 500 undelivered updates over a day old from disconnected, finished rooms? Room history and scores are kept.</p>
            <div className="actions"><button type="button" className="danger" disabled={busy} onClick={() => recover('clear-finished-updates')}>Clear old updates now</button>
              <button type="button" className="quiet" disabled={busy} onClick={() => setConfirmClear(false)}>Cancel</button></div>
          </>}
        </div>}
        {part.key === 'problems' && <div className="health-actions actions">
          <a className="link-button" href="/?admin=logs">Open device logs</a>
          {Boolean(recovery?.unreviewed) && <button type="button" className="quiet" disabled={busy} onClick={() => recover('review-problems')}>Mark reports as reviewed</button>}
        </div>}
      </section>)}</div>
      <div className="actions"><button type="button" className="quiet" onClick={() => void load()}><FaIcon name="rotate" /> Check again</button></div>
    </>}
  </>;
}
