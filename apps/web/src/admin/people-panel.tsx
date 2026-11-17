import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { PeopleListSchema, PersonKeyViewSchema, type PersonKeyView, type PersonRow } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { SIGNED_OUT_TEXT } from '../owner/owner-session.js';

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
  const load = () => roomApi<unknown>('/api/host/people').then(data => { setPeople(PeopleListSchema.parse(data).people); setError(''); }).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); }, []);
  const run = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); try { await work(); await load(); } catch (cause) { setError(explain(cause)); } finally { setBusy(false); } };
  const show = (data: unknown, fresh: boolean) => setShown({ view: PersonKeyViewSchema.parse(data), fresh });
  const add = (event: React.FormEvent) => { event.preventDefault(); void run(async () => { show(await roomApi('/api/host/people', { name, canEdit }), true); setName(''); setCanEdit(false); }); };
  const rename = (person: PersonRow) => { const next = prompt(`New name for ${person.name}`, person.name)?.trim(); if (next && next !== person.name) void run(() => roomApi(`/api/host/people/${person.id}`, { name: next }, 'PUT')); };
  const viewKey = (person: PersonRow) => { void run(async () => show(await roomApi(`/api/host/people/${person.id}/key`), false)); };
  const newKey = (person: PersonRow) => { if (confirm(`Make a new key for ${person.name}? The old key and link stop working; phones already signed in stay signed in.`)) void run(async () => show(await roomApi(`/api/host/people/${person.id}/key`, {}), true)); };
  const setEditor = (person: PersonRow, next: boolean) => {
    if (next ? confirm(`Let ${person.name} edit games? They can make, change, publish, rehearse and remove games. They cannot host rooms or open this admin menu.`) : true)
      void run(() => roomApi(`/api/host/people/${person.id}/editor`, { canEdit: next }));
  };
  const signOut = (person: PersonRow) => { if (confirm(`Sign out all of ${person.name}’s phones? They join as guests until they sign in with their key again.`)) void run(() => roomApi(`/api/host/people/${person.id}/sign-out`, {})); };
  const remove = (person: PersonRow) => { if (confirm(`Remove ${person.name}? Their phones are signed out, their key stops working and the name is free again. Past games and chips stay in the history.`)) void run(() => roomApi(`/api/host/people/${person.id}/remove`, {})); };

  return <>
    <p className="admin-intro">Make an account for each regular player. Each gets a personal key: typed once on a phone (or opened as a link), that phone then always joins as them, with their look and their chips across games. Editors can also make and change games, but never host or see this menu. Players without an account still join as guests.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {shown ? <KeyCard view={shown.view} fresh={shown.fresh} onDone={() => setShown(undefined)} /> : <form className="person-add" onSubmit={add}>
      <label>Name<input value={name} maxLength={40} required onChange={event => setName(event.target.value)} /></label>
      <label className="person-check"><input type="checkbox" checked={canEdit} onChange={event => setCanEdit(event.target.checked)} />Can edit games</label>
      <button type="submit" disabled={busy || !name.trim()}>Add person</button>
    </form>}
    {!people && !error && <p role="status">Loading people…</p>}
    {people && !people.length && <p className="admin-empty">No people yet.</p>}
    {people && people.length > 0 && <div className="people-table-wrap"><table className="people-table">
      <thead><tr><th scope="col">Name</th><th scope="col">Editor</th><th scope="col">Phones</th><th scope="col">Last seen</th><th scope="col">Games</th><th scope="col">Chips</th><th scope="col">Bet in total</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
      <tbody>{people.map(person => <tr key={person.id}>
        <th scope="row">{person.name}</th>
        <td><label className="person-check"><input type="checkbox" checked={person.canEdit} disabled={busy} onChange={event => setEditor(person, event.target.checked)} /><span className="visually-hidden">{person.name} can edit games</span><span aria-hidden="true">{person.canEdit ? 'Yes' : 'No'}</span></label></td>
        <td>{person.devices}</td><td>{person.lastSeenAt ? new Date(person.lastSeenAt).toLocaleString() : 'never'}</td>
        <td>{person.games}</td><td>{person.chips.toLocaleString()}</td><td>{person.wagered.toLocaleString()}</td>
        <td><div className="admin-actions">
          <button type="button" className="quiet" disabled={busy || !person.hasKey} onClick={() => viewKey(person)} aria-label={`Show key of ${person.name}`} title={person.hasKey ? undefined : 'Made before keys could be shown again: make a new key'}>Show key</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => newKey(person)} aria-label={`New key for ${person.name}`}>New key</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => rename(person)} aria-label={`Rename ${person.name}`}>Rename</button>
          <button type="button" className="quiet" disabled={busy || !person.devices} onClick={() => signOut(person)} aria-label={`Sign out phones of ${person.name}`}>Sign out phones</button>
          <button type="button" className="danger" disabled={busy} onClick={() => remove(person)} aria-label={`Remove ${person.name}`}>Remove</button>
        </div></td>
      </tr>)}</tbody>
    </table></div>}
  </>;
}
