import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { PeopleListSchema, PeopleStatsSchema, PersonKeyViewSchema, type PersonKeyView, type PersonRow, type PersonStats } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { SIGNED_OUT_TEXT } from '../owner/owner-session.js';
import { seenThisWeek } from './people-time.js';
import { initials, LastSeen, PersonPage, type PersonActions } from './person-page.js';
import { Leaderboard } from './leaderboard.js';

const problems: Record<string, string> = {
  UNAUTHORIZED: SIGNED_OUT_TEXT,
  AUTH_UNAVAILABLE: 'Owner access is not set up on this server.',
  NAME_TAKEN: 'Someone already has that name. Pick another.',
  INVALID_COMMAND: 'Give a name of 1 to 40 characters.',
  NOT_FOUND: 'That key cannot be shown. Make a new key for this person to see one.',
};
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'The server could not be reached. Check that it is running and try again.';
/** The personal link is opened on the person's phone; the key after # never reaches the server's logs. */
export const personalLink = (key: string) => `${location.origin}/#person=${key}`;

function KeyCard({ view, fresh, onDone }: { view: PersonKeyView; fresh: boolean; onDone: () => void }) {
  const url = personalLink(view.key); const [copied, setCopied] = useState('');
  const image = useMemo(() => { try { const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make(); return qr.createDataURL(4, 16); } catch { return null; } }, [url]);
  const copy = (what: string, text: string) => { void navigator.clipboard.writeText(text).then(() => setCopied(what)).catch(() => setCopied('')); };
  return <section className="person-link" aria-labelledby="person-link-heading">
    <h2 id="person-link-heading">Personal key for {view.name}</h2>
    <p className="person-key"><code>{view.key}</code></p>
    <p>{fresh ? `Give ${view.name} this key. ` : ''}On the start page, {view.name} taps “Have a personal key? Sign in” and types it (capitals and dashes do not matter), or opens the link below (scan the code). That phone then always joins as {view.name}. Anyone with the key can become {view.name}, so give it only to them. You can look it up here again, or make a new one if it got out.</p>
    {image && <img src={image} alt={`QR code with the personal link for ${view.name}`} width={200} height={200} />}
    <p className="person-url"><code>{url}</code></p>
    <div className="admin-actions">
      <button type="button" className="quiet" onClick={() => copy('key', view.key)}>{copied === 'key' ? 'Key copied' : 'Copy key'}</button>
      <button type="button" className="quiet" onClick={() => copy('link', url)}>{copied === 'link' ? 'Link copied' : 'Copy link'}</button>
      <button type="button" onClick={onDone}>Done</button>
    </div>
  </section>;
}

/** People: accounts for regular players (and editors), so they always join as themselves and keep their chips. */
export function PeoplePanel() {
  const [people, setPeople] = useState<PersonRow[]>(); const [error, setError] = useState(''); const [name, setName] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [shown, setShown] = useState<{ view: PersonKeyView; fresh: boolean }>(); const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const found = useMemo(() => people?.filter(person => matches(person.name, search)), [people, search]);
  // One person's own page (?admin=people&person=…): the browser's back button returns to the list.
  // The list or the leaderboard (?admin=people&tab=leaderboard), each in the browser's history too.
  const read = () => { const query = new URLSearchParams(location.search); return { person: query.get('person'), leaderboard: query.get('tab') === 'leaderboard' }; };
  const [place, setPlace] = useState(read); const personId = place.person;
  useEffect(() => { const moved = () => setPlace(read()); window.addEventListener('popstate', moved); return () => window.removeEventListener('popstate', moved); }, []);
  const go = (next: { person: string | null; leaderboard: boolean }) => {
    history.pushState(null, '', next.person ? `?admin=people&person=${next.person}` : next.leaderboard ? '?admin=people&tab=leaderboard' : '?admin=people');
    setPlace(next); setShown(undefined); window.scrollTo(0, 0);
  };
  const openPerson = (id: string | null) => go({ person: id, leaderboard: false });
  const [stats, setStats] = useState<PersonStats[]>();
  const load = () => Promise.all([
    roomApi<unknown>('/api/host/people').then(data => { setPeople(PeopleListSchema.parse(data).people); setError(''); }),
    roomApi<unknown>('/api/host/people/stats').then(data => setStats(PeopleStatsSchema.parse(data).stats)),
  ]).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); }, []);
  const run = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); try { await work(); await load(); } catch (cause) { setError(explain(cause)); } finally { setBusy(false); } };
  const show = (data: unknown, fresh: boolean) => setShown({ view: PersonKeyViewSchema.parse(data), fresh });
  const add = (event: React.FormEvent) => { event.preventDefault(); void run(async () => { show(await roomApi('/api/host/people', { name, canEdit }), true); setName(''); setCanEdit(false); }); };
  const actions: PersonActions = {
    rename: person => { const next = prompt(`New name for ${person.name}`, person.name)?.trim(); if (next && next !== person.name) void run(() => roomApi(`/api/host/people/${person.id}`, { name: next }, 'PUT')); },
    viewKey: person => { void run(async () => show(await roomApi(`/api/host/people/${person.id}/key`), false)); },
    newKey: person => { if (confirm(`Make a new key for ${person.name}? The old key and link stop working; phones already signed in stay signed in.`)) void run(async () => show(await roomApi(`/api/host/people/${person.id}/key`, {}), true)); },
    setEditor: (person, next) => {
      if (next ? confirm(`Let ${person.name} edit games? They can make, change, publish, rehearse and remove games. They cannot host rooms or open this admin menu.`) : true)
        void run(() => roomApi(`/api/host/people/${person.id}/editor`, { canEdit: next }));
    },
    signOut: person => { if (confirm(`Sign out all of ${person.name}’s phones? They join as guests until they sign in with their key again.`)) void run(() => roomApi(`/api/host/people/${person.id}/sign-out`, {})); },
    remove: person => { if (confirm(`Remove ${person.name}? Their phones are signed out, their key stops working and the name is free again. Past games and chips stay in the history.`)) void run(async () => { await roomApi(`/api/host/people/${person.id}/remove`, {}); openPerson(null); }); },
  };
  const keyCard = shown && <KeyCard view={shown.view} fresh={shown.fresh} onDone={() => setShown(undefined)} />;

  if (personId) {
    const person = people?.find(candidate => candidate.id === personId);
    return <>
      <p className="person-back"><a href="?admin=people" onClick={event => { event.preventDefault(); openPerson(null); }}>‹ All people</a></p>
      {error && <p role="alert" className="error">{error}</p>}
      {keyCard}
      {!people && !error && <p role="status">Loading…</p>}
      {people && !person && <p className="admin-empty">This person is not in the list (any more).</p>}
      {person && !shown && <PersonPage person={person} busy={busy} actions={actions} stats={stats?.find(row => row.personId === person.id)} all={stats ?? []} onOpen={openPerson} />}
    </>;
  }
  const tabs = <div className="people-tabs" role="tablist" aria-label="People">
    <button type="button" role="tab" aria-selected={!place.leaderboard} onClick={() => go({ person: null, leaderboard: false })}>People</button>
    <button type="button" role="tab" aria-selected={place.leaderboard} onClick={() => go({ person: null, leaderboard: true })}>Leaderboard</button></div>;
  if (place.leaderboard) return <>{tabs}
    {error && <p role="alert" className="error">{error}</p>}
    {people && stats ? <Leaderboard people={people} stats={stats} onOpen={openPerson} /> : !error && <p role="status">Loading the leaderboard…</p>}
  </>;
  return <>{tabs}
    <p className="admin-intro">Make an account for each regular player. Each gets a personal key: typed once on a phone (or opened as a link), that phone then always joins as them, with their look and their chips across games. Editors can also make and change games, but never host or see this menu. Players without an account still join as guests. Click a name for everything about that person.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {people && people.length > 0 && <PeopleSummary people={people} />}
    {keyCard || <form className="person-add" onSubmit={add} aria-labelledby="person-add-heading">
      <h2 id="person-add-heading">Add a person</h2>
      <label className="person-add-name">Name<input value={name} maxLength={40} required onChange={event => setName(event.target.value)} /></label>
      <label className="person-check"><input type="checkbox" checked={canEdit} onChange={event => setCanEdit(event.target.checked)} />Can edit games</label>
      <button type="submit" className="primary" disabled={busy || !name.trim()}>Add person</button>
    </form>}
    {!people && !error && <p role="status">Loading people…</p>}
    {people && !people.length && <p className="admin-empty">No people yet.</p>}
    {people && people.length > 0 && <div className="people-search"><label><span className="visually-hidden">Search people</span>
      <input type="search" placeholder="Search a person…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <span role="status">{search.trim() ? `${found!.length} of ${people.length}` : ''}</span></div>}
    {found && people!.length > 0 && !found.length && <p className="admin-empty">Nobody is called “{search.trim()}”.</p>}
    {found && found.length > 0 && <div className="people-table-wrap"><table className="people-table">
      <thead><tr><th scope="col">Name</th><th scope="col">Editor</th><th scope="col" className="num">Phones</th><th scope="col">Last seen</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
      <tbody>{found.map(person => <tr key={person.id}>
        <th scope="row"><a className="person-name" href={`?admin=people&person=${person.id}`} onClick={event => { event.preventDefault(); openPerson(person.id); }}>
          <span className={`person-initials${person.canEdit ? ' editor' : ''}`} aria-hidden="true">{initials(person.name)}</span><span className="person-name-text">{person.name}</span></a></th>
        <td className="wide-only"><label className="person-switch"><input type="checkbox" role="switch" checked={person.canEdit} disabled={busy} onChange={event => actions.setEditor(person, event.target.checked)} /><span className="visually-hidden">{person.name} can edit games</span><span aria-hidden="true">{person.canEdit ? 'Yes' : 'No'}</span></label></td>
        <td className="num wide-only">{person.devices}</td>
        <td className="person-seen"><LastSeen at={person.lastSeenAt} /><span className="person-chevron" aria-hidden="true">›</span></td>
        <td className="wide-only"><div className="person-actions">
          <button type="button" className="quiet" disabled={busy || !person.hasKey} onClick={() => actions.viewKey(person)} aria-label={`Show key of ${person.name}`} title={person.hasKey ? undefined : 'Made before keys could be shown again: make a new key'}>Show key</button>
          <button type="button" className="quiet" onClick={() => openPerson(person.id)} aria-label={`Open ${person.name}`}>Open ›</button>
        </div></td>
      </tr>)}</tbody>
    </table></div>}
  </>;
}

/** Ignores capitals and accents: "anouk" finds "Anoúk". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const matches = (name: string, search: string) => fold(name).includes(fold(search.trim()));

/** The numbers at a glance, above the list. */
function PeopleSummary({ people }: { people: PersonRow[] }) {
  const tiles: [string, string, string?][] = [
    ['People', String(people.length), `${people.filter(person => person.canEdit).length} can edit games`],
    ['Seen this week', String(people.filter(person => seenThisWeek(person.lastSeenAt)).length), `${people.filter(person => !person.lastSeenAt).length} never signed in`],
    ['Phones signed in', String(people.reduce((sum, person) => sum + person.devices, 0))],
  ];
  return <ul className="people-summary" aria-label="People at a glance">{tiles.map(([label, value, note]) =>
    <li key={label}><span className="people-summary-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</li>)}</ul>;
}
