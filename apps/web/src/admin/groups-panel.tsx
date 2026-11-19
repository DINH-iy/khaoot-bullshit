import { useEffect, useMemo, useState } from 'react';
import { PersonGroupListSchema, type PersonGroup, type PersonRow } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { FaIcon } from '../presentation/icons.js';
import { SIGNED_OUT_TEXT } from '../owner/owner-session.js';

// Groups of people (server: people/groups.ts): a shortcut for adding many people to a room at once
// (the host's "Add people…" list in a room offers each group). A person can be in any number of groups.
const problems: Record<string, string> = {
  UNAUTHORIZED: SIGNED_OUT_TEXT, NAME_TAKEN: 'There already is a group with that name. Pick another.',
  INVALID_COMMAND: 'Give a name of 1 to 40 characters.', NOT_FOUND: 'That group no longer exists.', RATE_LIMITED: 'That is the most groups there can be (200).',
};
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'The server could not be reached. Check that it is running and try again.';
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function GroupsPanel({ people }: { people: PersonRow[] | undefined }) {
  const [groups, setGroups] = useState<PersonGroup[]>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const load = () => roomApi<unknown>('/api/host/groups').then(data => { setGroups(PersonGroupListSchema.parse(data).groups); setError(''); });
  useEffect(() => { void load().catch(cause => setError(explain(cause))); }, []);
  const run = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); try { await work(); } catch (cause) { setError(explain(cause)); } finally { await load().catch(() => undefined); setBusy(false); } };
  const add = (event: React.FormEvent) => { event.preventDefault(); void run(async () => { const made = await roomApi<{ id: string }>('/api/host/groups', { name }); setName(''); setOpen(made.id); }); };
  const names = useMemo(() => new Map(people?.map(person => [person.id, person.name])), [people]);

  return <>
    <p className="admin-intro">Put people in groups (work, family, the Friday club…) to add a whole group to a room at once: in the room, open <strong>Add people</strong> in the Players sheet and tick the group. Someone can be in as many groups as you like.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <form className="person-add" onSubmit={add} aria-labelledby="group-add-heading">
      <h2 id="group-add-heading">Make a group</h2>
      <label className="person-add-name">Name<input value={name} maxLength={40} required onChange={event => setName(event.target.value)} /></label>
      <button type="submit" className="primary" disabled={busy || !name.trim()}>Make group</button>
    </form>
    {!groups && !error && <p role="status">Loading groups…</p>}
    {groups && !groups.length && <p className="admin-empty">No groups yet.</p>}
    {groups && groups.length > 0 && <ul className="group-list">{groups.map(group => {
      const expanded = open === group.id; const members = group.personIds.map(id => names.get(id)).filter(Boolean);
      return <li key={group.id} className="group-card">
        <div className="group-head">
          <button type="button" className="group-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : group.id)}>
            <FaIcon name="users" /><span className="group-name">{group.name}</span>
            <span className="group-count">{group.personIds.length} {group.personIds.length === 1 ? 'person' : 'people'}</span>
            <FaIcon name={expanded ? 'chevron-up' : 'chevron-down'} /></button>
          <div className="admin-actions">
            <button type="button" className="quiet" disabled={busy} onClick={() => { const next = prompt(`New name for ${group.name}`, group.name)?.trim(); if (next && next !== group.name) void run(() => roomApi(`/api/host/groups/${group.id}`, { name: next }, 'PUT')); }}>Rename</button>
            <button type="button" className="quiet" disabled={busy} onClick={() => { if (confirm(`Delete the group ${group.name}? The people in it stay; only the group goes.`)) void run(() => roomApi(`/api/host/groups/${group.id}/remove`, {})); }}>Delete</button>
          </div>
        </div>
        {!expanded && members.length > 0 && <p className="group-members">{members.join(', ')}</p>}
        {expanded && <GroupMembers group={group} people={people} busy={busy} onChange={personIds => {
          // Shown at once; the server's answer (or, on failure, the reload) puts the saved list back.
          setGroups(current => current?.map(entry => entry.id === group.id ? { ...entry, personIds } : entry));
          void run(() => roomApi(`/api/host/groups/${group.id}`, { personIds }, 'PUT'));
        }} />}
      </li>;
    })}</ul>}
  </>;
}

/** Tick who is in the group; each tick saves straight away. */
function GroupMembers({ group, people, busy, onChange }: { group: PersonGroup; people: PersonRow[] | undefined; busy: boolean; onChange: (personIds: string[]) => void }) {
  const [search, setSearch] = useState('');
  if (!people) return <p role="status">Loading people…</p>;
  if (!people.length) return <p className="admin-empty">No people yet. Add them on the People tab first.</p>;
  const chosen = new Set(group.personIds); const shown = people.filter(person => fold(person.name).includes(fold(search.trim())));
  const allShown = shown.length > 0 && shown.every(person => chosen.has(person.id));
  return <div className="group-members-edit" role="group" aria-label={`Who is in ${group.name}`}>
    <div className="people-search"><label><span className="visually-hidden">Search people</span><input type="search" placeholder="Search a person…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <button type="button" className="quiet" disabled={busy || !shown.length} onClick={() => onChange(allShown ? group.personIds.filter(id => !shown.some(person => person.id === id)) : [...new Set([...group.personIds, ...shown.map(person => person.id)])])}>
        {allShown ? (search.trim() ? 'Untick these' : 'Untick everyone') : (search.trim() ? 'Tick these' : 'Tick everyone')}</button></div>
    <ul className="group-people">{shown.map(person => <li key={person.id}><label className="person-check"><input type="checkbox" disabled={busy} checked={chosen.has(person.id)}
      onChange={event => onChange(event.target.checked ? [...group.personIds, person.id] : group.personIds.filter(id => id !== person.id))} />{person.name}</label></li>)}</ul>
  </div>;
}
