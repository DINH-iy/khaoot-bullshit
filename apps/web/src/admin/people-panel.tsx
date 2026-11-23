import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { PeopleSummarySchema, PersonKeyViewSchema, PersonRowSchema, PersonStandingSchema, type PeopleSummary as Summary, type PersonKeyView, type PersonRow, type PersonStanding } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { SIGNED_OUT_TEXT } from '../owner/owner-session.js';
import { replaceWithHome } from '../navigation.js';
import { usePeoplePage } from '../people/use-people-page.js';
import { PeoplePager } from '../people/people-pager.js';
import { initials, LastSeen, PersonPage, type PersonActions } from './person-page.js';
import { Leaderboard } from './leaderboard.js';
import { GroupsPanel } from './groups-panel.js';

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

function KeyCard({ view, onDone }: { view: PersonKeyView; onDone: () => void }) {
  const url = personalLink(view.key); const [copied, setCopied] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const image = useMemo(() => { try { const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make(); return qr.createDataURL(4, 16); } catch { return null; } }, [url]);
  const copy = (what: string, value: string) => { void navigator.clipboard.writeText(value).then(() => setCopied(what)).catch(() => setCopied('')); };
  return <dialog ref={dialog} className="person-link" aria-labelledby="person-link-heading"
    onCancel={event => { event.preventDefault(); onDone(); }}
    onClick={event => { if (event.target === event.currentTarget) onDone(); }}>
    <div className="person-link-body">
      <h2 id="person-link-heading">Personal key for {view.name}</h2>
      <div className="person-link-content">
        <div>
          <p className="person-key"><code>{view.key}</code></p>
          <p className="person-hint">Enter the key under Sign in or scan the QR code. Share it only with {view.name}.</p>
        </div>
        {image && <img src={image} alt={`Sign-in QR code for ${view.name}`} width={120} height={120} />}
      </div>
      <details className="person-url"><summary>Sign-in link</summary><code>{url}</code></details>
      <div className="admin-actions">
        <button type="button" className="quiet" onClick={() => copy('key', view.key)}>{copied === 'key' ? 'Key copied' : 'Copy key'}</button>
        <button type="button" className="quiet" onClick={() => copy('link', url)}>{copied === 'link' ? 'Link copied' : 'Copy link'}</button>
        <button type="button" className="primary" onClick={onDone}>Done</button>
      </div>
    </div>
  </dialog>;
}

/** People: accounts for regular players (and editors), so they always join as themselves and keep their chips. */
export function PeoplePanel() {
  const paging = usePeoplePage({ withKeys: true }); const { data, search, setSearch, query } = paging;
  const [summary, setSummary] = useState<Summary>(); const [error, setError] = useState(''); const [name, setName] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [shown, setShown] = useState<PersonKeyView>(); const [busy, setBusy] = useState(false);
  // One person's own page (?admin=people&person=…): the browser's back button returns to the list.
  // The list, the leaderboard (?admin=people&tab=leaderboard) or the groups (&tab=groups), each in the browser's history too.
  type Tab = 'people' | 'leaderboard' | 'groups';
  const read = () => { const query = new URLSearchParams(location.search); const tab = query.get('tab'); return { person: query.get('person'), tab: (tab === 'leaderboard' || tab === 'groups' ? tab : 'people') as Tab }; };
  const [place, setPlace] = useState(read); const personId = place.person;
  useEffect(() => { const moved = () => setPlace(read()); window.addEventListener('popstate', moved); return () => window.removeEventListener('popstate', moved); }, []);
  const go = (next: { person: string | null; tab: Tab }) => {
    history.pushState(null, '', next.person ? `?admin=people&person=${next.person}` : next.tab !== 'people' ? `?admin=people&tab=${next.tab}` : '?admin=people');
    setPlace(next); setShown(undefined); window.scrollTo(0, 0);
  };
  const openPerson = (id: string | null) => go({ person: id, tab: 'people' });
  // The person page reloads itself after each change (see PersonView); the list and the numbers reload here.
  const [changes, setChanges] = useState(0);
  const loadSummary = () => roomApi<unknown>('/api/host/people/summary').then(result => { setSummary(PeopleSummarySchema.parse(result)); setError(''); }).catch(cause => setError(explain(cause)));
  useEffect(() => { void loadSummary(); }, [changes]);
  useEffect(() => { if (paging.failed) setError(explain(undefined)); }, [paging.failed]);
  const run = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); try { await work(); paging.reload(); setChanges(count => count + 1); } catch (cause) { setError(explain(cause)); } finally { setBusy(false); } };
  const show = (data: unknown) => setShown(PersonKeyViewSchema.parse(data));
  const add = (event: React.FormEvent) => { event.preventDefault(); void run(async () => { show(await roomApi('/api/host/people', { name, canEdit })); setName(''); setCanEdit(false); }); };
  const actions: PersonActions = {
    rename: person => { const next = prompt(`New name for ${person.name}`, person.name)?.trim(); if (next && next !== person.name) void run(() => roomApi(`/api/host/people/${person.id}`, { name: next }, 'PUT')); },
    viewKey: person => {
      if (person.key) show({ id: person.id, name: person.name, key: person.key });
      else void run(async () => show(await roomApi(`/api/host/people/${person.id}/key`)));
    },
    newKey: person => { if (confirm(`Make a new key for ${person.name}? The old key and link stop working; phones already signed in stay signed in.`)) void run(async () => show(await roomApi(`/api/host/people/${person.id}/key`, {}))); },
    setEditor: (person, next) => {
      if (next ? confirm(`Let ${person.name} edit games? They can make, change, publish, rehearse and remove games. They cannot host rooms or open this admin menu.`) : true)
        void run(() => roomApi(`/api/host/people/${person.id}/editor`, { canEdit: next }));
    },
    signOut: person => { if (confirm(`Sign out all of ${person.name}’s phones? They join as guests until they sign in with their key again.`)) void run(() => roomApi(`/api/host/people/${person.id}/sign-out`, {})); },
    remove: person => { if (confirm(`Remove ${person.name}? Their phones are signed out, their key stops working and the name is free again. Past games and chips stay in the history.`)) void run(async () => { await roomApi(`/api/host/people/${person.id}/remove`, {}); openPerson(null); }); },
  };
  const keyCard = shown && <KeyCard view={shown} onDone={() => setShown(undefined)} />;

  if (personId) return <>
    <p className="person-back"><a href="?admin=people" onClick={event => { event.preventDefault(); openPerson(null); }}>‹ All people</a></p>
    {error && <p role="alert" className="error">{error}</p>}
    {keyCard}
    <PersonView key={personId} id={personId} changes={changes} busy={busy} actions={actions} onOpen={openPerson} />
  </>;
  const tabs = <div className="people-tabs" role="tablist" aria-label="People">
    <button type="button" role="tab" aria-selected={place.tab === 'people'} onClick={() => go({ person: null, tab: 'people' })}>People</button>
    <button type="button" role="tab" aria-selected={place.tab === 'groups'} onClick={() => go({ person: null, tab: 'groups' })}>Groups</button>
    <button type="button" role="tab" aria-selected={place.tab === 'leaderboard'} onClick={() => go({ person: null, tab: 'leaderboard' })}>Leaderboard</button></div>;
  if (place.tab === 'groups') return <>{tabs}<GroupsPanel /></>;
  if (place.tab === 'leaderboard') return <>{tabs}<Leaderboard onOpen={openPerson} /></>;
  const people = data?.people;
  return <>{tabs}
    <p className="admin-intro">Make an account for each regular player. Each gets a personal key: typed once on a phone (or opened as a link), that phone then always joins as them, with their look and their chips across games. Editors can also make and change games, but never host or see this menu. Players without an account still join as guests. Click a name for everything about that person.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {summary && summary.people > 0 && <PeopleSummary summary={summary} />}
    {keyCard}
    <form className="person-add" onSubmit={add} aria-labelledby="person-add-heading">
      <h2 id="person-add-heading">Add a person</h2>
      <label className="person-add-name">Name<input value={name} maxLength={40} required onChange={event => setName(event.target.value)} /></label>
      <label className="person-check"><input type="checkbox" checked={canEdit} onChange={event => setCanEdit(event.target.checked)} />Can edit games</label>
      <button type="submit" className="primary" disabled={busy || !name.trim()}>Add person</button>
    </form>
    {!data && !error && <p role="status">Loading people…</p>}
    {summary?.people === 0 && <p className="admin-empty">No people yet.</p>}
    {!!summary?.people && <div className="people-search"><label><span className="visually-hidden">Search people</span>
      <input type="search" placeholder="Search a person…" maxLength={40} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <span role="status">{query && data ? `${data.total.toLocaleString()} found` : ''}</span></div>}
    {query && data && !data.total && <p className="admin-empty">Nobody is called “{query}”.</p>}
    {people && people.length > 0 && <div className="people-table-wrap"><table className="people-table">
      <thead><tr><th scope="col">Name</th><th scope="col">Editor</th><th scope="col" className="num">Phones</th><th scope="col">Last seen</th><th scope="col">Personal key</th></tr></thead>
      <tbody>{people.map(person => <tr key={person.id}>
        <th scope="row"><a className="person-name" href={`?admin=people&person=${person.id}`} onClick={event => { event.preventDefault(); openPerson(person.id); }}>
          <span className={`person-initials${person.canEdit ? ' is-editor' : ''}`} aria-hidden="true">{initials(person.name)}</span><span className="person-name-text">{person.name}</span></a></th>
        <td className="wide-only"><label className="person-switch"><input type="checkbox" role="switch" checked={person.canEdit} disabled={busy} onChange={event => actions.setEditor(person, event.target.checked)} /><span className="visually-hidden">{person.name} can edit games</span><span aria-hidden="true">{person.canEdit ? 'Yes' : 'No'}</span></label></td>
        <td className="num wide-only">{person.devices}</td>
        <td className="person-seen"><LastSeen at={person.lastSeenAt} /></td>
        <td className="person-key-cell">{person.key
          ? <button type="button" className="person-key-chip" onClick={() => actions.viewKey(person)} aria-label={`Share key for ${person.name}`}><code>{person.key}</code></button>
          : person.hasKey && person.key === undefined
            ? <button type="button" className="quiet" onClick={() => actions.viewKey(person)}>Show key</button>
            : <span className="person-hint">Renew key in profile</span>}
        </td>
      </tr>)}</tbody>
    </table></div>}
    <PeoplePager paging={paging} />
  </>;
}

/** One person's page: the person and their standing are loaded for it, and again after each change. */
function PersonView({ id, changes, busy, actions, onOpen }: { id: string; changes: number; busy: boolean; actions: PersonActions; onOpen: (id: string) => void }) {
  const [person, setPerson] = useState<PersonRow | null>(); const [standing, setStanding] = useState<PersonStanding>(); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void roomApi<unknown>(`/api/host/people/${id}`).then(result => { if (live) setPerson(PersonRowSchema.parse(result)); })
      .catch(cause => { if (!live) return; if (cause instanceof Error && cause.message === 'NOT_FOUND') setPerson(null); else setFailed(true); });
    void roomApi<unknown>(`/api/host/people/${id}/stats`).then(result => { if (live) setStanding(PersonStandingSchema.parse(result)); }).catch(() => undefined);
    return () => { live = false; };
  }, [id, changes]);
  // Nobody by that id (removed, or an old link): back to the start page.
  useEffect(() => { if (person === null) replaceWithHome(); }, [person]);
  if (failed) return <p role="alert" className="error">{explain(undefined)}</p>;
  if (!person) return person === undefined ? <p role="status">Loading…</p> : null;
  return <PersonPage person={person} busy={busy} actions={actions} standing={standing} onOpen={onOpen} />;
}

/** The numbers at a glance, above the list (over everyone, not only this page). */
function PeopleSummary({ summary }: { summary: Summary }) {
  const tiles: [string, string, string?][] = [
    ['People', summary.people.toLocaleString(), `${summary.editors.toLocaleString()} can edit games`],
    ['Seen this week', summary.seenThisWeek.toLocaleString(), `${summary.neverSignedIn.toLocaleString()} never signed in`],
    ['Phones signed in', summary.phones.toLocaleString()],
  ];
  return <ul className="people-summary" aria-label="People at a glance">{tiles.map(([label, value, note]) =>
    <li key={label}><span className="people-summary-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</li>)}</ul>;
}
