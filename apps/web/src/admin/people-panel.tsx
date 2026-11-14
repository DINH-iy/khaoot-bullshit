import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { PeopleListSchema, PersonLinkSchema, type PersonLink, type PersonRow } from '@party/contracts';
import { roomApi } from '../network/api.js';

const problems: Record<string, string> = {
  UNAUTHORIZED: 'This browser is not signed in as the owner. Start the app with “npm run host”: the host menu it opens signs this browser in, then come back here.',
  AUTH_UNAVAILABLE: 'Owner access is not set up on this server.',
  NAME_TAKEN: 'Someone already has that name. Pick another.',
  INVALID_COMMAND: 'Give a name of 1 to 40 characters.',
};
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'The server could not be reached. Check that it is running and try again.';
/** The personal link is opened on the person's phone; the key after # never reaches the server's logs. */
export const personalLink = (token: string) => `${location.origin}/#person=${token}`;

function LinkCard({ link, onDone }: { link: PersonLink; onDone: () => void }) {
  const url = personalLink(link.token); const [copied, setCopied] = useState(false);
  const image = useMemo(() => { try { const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make(); return qr.createDataURL(4, 16); } catch { return null; } }, [url]);
  return <section className="person-link" aria-labelledby="person-link-heading">
    <h2 id="person-link-heading">Personal link for {link.name}</h2>
    <p>Open this on {link.name}’s phone (scan the code or send the link). From then on that phone always joins as {link.name}. Anyone with the link can become {link.name}, so send it only to them. It is shown only now; you can make a new one at any time.</p>
    {image && <img src={image} alt={`QR code with the personal link for ${link.name}`} width={200} height={200} />}
    <p className="person-url"><code>{url}</code></p>
    <div className="admin-actions">
      <button type="button" className="quiet" onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? 'Copied' : 'Copy link'}</button>
      <button type="button" onClick={onDone}>Done</button>
    </div>
  </section>;
}

/** People: accounts for regular players, so they always join as themselves and keep their chips. */
export function PeoplePanel() {
  const [people, setPeople] = useState<PersonRow[]>(); const [error, setError] = useState(''); const [name, setName] = useState('');
  const [link, setLink] = useState<PersonLink>(); const [busy, setBusy] = useState(false);
  const load = () => roomApi<unknown>('/api/host/people').then(data => { setPeople(PeopleListSchema.parse(data).people); setError(''); }).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); }, []);
  const run = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); try { await work(); await load(); } catch (cause) { setError(explain(cause)); } finally { setBusy(false); } };
  const add = (event: React.FormEvent) => { event.preventDefault(); void run(async () => { setLink(PersonLinkSchema.parse(await roomApi('/api/host/people', { name }))); setName(''); }); };
  const rename = (person: PersonRow) => { const next = prompt(`New name for ${person.name}`, person.name)?.trim(); if (next && next !== person.name) void run(() => roomApi(`/api/host/people/${person.id}`, { name: next }, 'PUT')); };
  const newLink = (person: PersonRow) => { if (confirm(`Make a new personal link for ${person.name}? The old link stops working; phones already signed in stay signed in.`)) void run(async () => setLink(PersonLinkSchema.parse(await roomApi(`/api/host/people/${person.id}/link`, {})))); };
  const signOut = (person: PersonRow) => { if (confirm(`Sign out all of ${person.name}’s phones? They join as guests until they open a personal link again.`)) void run(() => roomApi(`/api/host/people/${person.id}/sign-out`, {})); };
  const remove = (person: PersonRow) => { if (confirm(`Remove ${person.name}? Their phones are signed out and the name is free again. Past games and chips stay in the history.`)) void run(() => roomApi(`/api/host/people/${person.id}/remove`, {})); };

  return <>
    <p className="admin-intro">Make an account for each regular player. Give them their personal link once: their phone then always joins as them, with their look and their chips across games. Players without one still join as guests.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {link ? <LinkCard link={link} onDone={() => setLink(undefined)} /> : <form className="person-add" onSubmit={add}>
      <label>Name<input value={name} maxLength={40} required onChange={event => setName(event.target.value)} /></label>
      <button type="submit" disabled={busy || !name.trim()}>Add person</button>
    </form>}
    {!people && !error && <p role="status">Loading people…</p>}
    {people && !people.length && <p className="admin-empty">No people yet.</p>}
    {people && people.length > 0 && <div className="people-table-wrap"><table className="people-table">
      <thead><tr><th scope="col">Name</th><th scope="col">Phones</th><th scope="col">Last seen</th><th scope="col">Games</th><th scope="col">Chips</th><th scope="col">Bet in total</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
      <tbody>{people.map(person => <tr key={person.id}>
        <th scope="row">{person.name}</th><td>{person.devices}</td><td>{person.lastSeenAt ? new Date(person.lastSeenAt).toLocaleString() : 'never'}</td>
        <td>{person.games}</td><td>{person.chips.toLocaleString()}</td><td>{person.wagered.toLocaleString()}</td>
        <td><div className="admin-actions">
          <button type="button" className="quiet" disabled={busy} onClick={() => newLink(person)} aria-label={`New link for ${person.name}`}>New link</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => rename(person)} aria-label={`Rename ${person.name}`}>Rename</button>
          <button type="button" className="quiet" disabled={busy || !person.devices} onClick={() => signOut(person)} aria-label={`Sign out phones of ${person.name}`}>Sign out phones</button>
          <button type="button" className="danger" disabled={busy} onClick={() => remove(person)} aria-label={`Remove ${person.name}`}>Remove</button>
        </div></td>
      </tr>)}</tbody>
    </table></div>}
  </>;
}
