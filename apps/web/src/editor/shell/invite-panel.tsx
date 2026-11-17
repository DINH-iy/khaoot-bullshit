import { useEffect, useRef, useState } from 'react';
import { PeopleListSchema, PersonKeyViewSchema, type PersonRow } from '@party/contracts';
import { roomApi } from '../../room/api.js';
import type { HostRole } from '../../owner/owner-nav.js';

/** An invite: opens this game's editor and signs the device in as the person (their personal key, after #, never in server logs). */
const inviteLink = (gameId: string, key: string) => `${location.origin}/?edit=${gameId}#person=${key}`;

/**
 * Inviting people to edit this game together. Anyone signed in (the owner or an
 * editor) can share the plain link to the game. The owner also sees their people:
 * an invite link for each person with editor rights (it signs their device in
 * and opens this game), and editor rights to give with one tap.
 */
export function InvitePanel({ gameId, role, onClose }: { gameId: string; role: HostRole | null; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { heading.current?.focus(); }, []);
  const [people, setPeople] = useState<PersonRow[]>(); const [error, setError] = useState(''); const [copied, setCopied] = useState(''); const [busy, setBusy] = useState(false);
  const owner = role === 'owner';
  const load = () => roomApi('/api/host/people').then(data => setPeople(PeopleListSchema.parse(data).people)).catch(() => setError('The people could not be loaded.'));
  useEffect(() => { if (owner) void load(); }, [owner]);
  const copy = (what: string, text: string) => { void navigator.clipboard.writeText(text).then(() => setCopied(what), () => setError('Copying is blocked in this browser.')); };
  const invite = (person: PersonRow) => { setBusy(true); setError(''); void roomApi(`/api/host/people/${person.id}/key`).then(data => copy(person.id, inviteLink(gameId, PersonKeyViewSchema.parse(data).key)))
    .catch(() => setError(`No key to share for ${person.name}: make a new key under Admin → People.`)).finally(() => setBusy(false)); };
  const allow = (person: PersonRow) => { setBusy(true); setError(''); void roomApi(`/api/host/people/${person.id}/editor`, { canEdit: true }).then(load).catch(() => setError('That did not work. Try again.')).finally(() => setBusy(false)); };
  const plain = `${location.origin}/?edit=${gameId}`;
  return <section className="game-settings-panel invite-panel" aria-labelledby="invite-heading" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <div className="inspector-head"><h2 id="invite-heading" ref={heading} tabIndex={-1}>Edit together</h2><button className="small-button" onClick={onClose}>Close</button></div>
    <p className="hint">Everyone in this game’s editor sees each other’s changes, selections and pointers live. Inviting needs a person with editor rights: they can change games, but never host or open the admin menu.</p>
    {error && <p role="alert" className="hint warn">{error}</p>}
    {owner && <div className="invite-people">
      <h3>Invite a person</h3>
      {!people && !error && <p role="status" className="hint">Loading people…</p>}
      {people && people.length === 0 && <p className="hint">No people yet. Add one under <a href="/?admin=people">Admin → People</a> and tick “Can edit games”.</p>}
      {people && people.length > 0 && <ul className="plain-list">{people.map(person => <li key={person.id} className="invite-row">
        <span><strong>{person.name}</strong><small>{person.canEdit ? 'Can edit games' : 'Player only'}</small></span>
        {person.canEdit
          ? <button className="small-button" disabled={busy || !person.hasKey} title={person.hasKey ? undefined : 'Make a new key under Admin → People first'} onClick={() => invite(person)}>{copied === person.id ? 'Link copied ✓' : 'Copy invite link'}</button>
          : <button className="small-button" disabled={busy} onClick={() => allow(person)}>Give editing rights</button>}
      </li>)}</ul>}
      <p className="hint">The invite link signs that person’s phone or computer in with their personal key and opens this game. Anyone with it can edit as them, so send it only to them.</p>
    </div>}
    <div className="invite-people">
      <h3>Link to this game</h3>
      <p className="hint">For people already signed in as an editor{owner ? ' (or you on another device)' : ''}.</p>
      <div className="invite-link"><code>{plain}</code><button className="small-button" onClick={() => copy('plain', plain)}>{copied === 'plain' ? 'Copied ✓' : 'Copy'}</button></div>
    </div>
  </section>;
}
