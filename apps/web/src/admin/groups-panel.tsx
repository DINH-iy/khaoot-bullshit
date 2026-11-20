import { useEffect, useMemo, useState } from 'react';
import { PersonGroupListSchema, PersonGroupSchema, type PersonGroup, type PersonRow } from '@party/contracts';
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
  const run = async (work: () => Promise<unknown>, refresh = true) => { setBusy(true); setError(''); try { await work(); if (refresh) await load(); } catch (cause) { setError(explain(cause)); } finally { setBusy(false); } };
  const add = (event: React.FormEvent) => { event.preventDefault(); void run(async () => { const made = await roomApi<{ id: string }>('/api/host/groups', { name }); setName(''); setOpen(made.id); }); };
  const names = useMemo(() => new Map(people?.map(person => [person.id, person.name])), [people]);

  return <>
    <p className="admin-intro">Save groups here, then add a whole group from the room’s Players menu.</p>
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
          <div className="group-heading"><span className="group-icon"><FaIcon name="users" /></span>
            <div><h3 className="group-name">{group.name}</h3><p className="group-count">{group.personIds.length} {group.personIds.length === 1 ? 'person' : 'people'}</p></div></div>
          <div className="admin-actions">
            <button type="button" className="quiet group-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : group.id)}>
              {expanded ? 'Done' : group.personIds.length ? 'Edit members' : 'Add people'}<FaIcon name={expanded ? 'chevron-up' : 'chevron-down'} /></button>
            <button type="button" className="quiet" disabled={busy} onClick={() => { const next = prompt(`New name for ${group.name}`, group.name)?.trim(); if (next && next !== group.name) void run(() => roomApi(`/api/host/groups/${group.id}`, { name: next }, 'PUT')); }}>Rename</button>
            <button type="button" className="quiet" disabled={busy} onClick={() => { if (confirm(`Delete the group ${group.name}? The people in it stay; only the group goes.`)) void run(() => roomApi(`/api/host/groups/${group.id}/remove`, {})); }}>Delete</button>
          </div>
        </div>
        {!expanded && members.length > 0 && <p className="group-members">{members.slice(0, 5).join(', ')}{members.length > 5 ? ` +${members.length - 5}` : ''}</p>}
        {expanded && <GroupMembers group={group} people={people} busy={busy} onChange={personIds => void run(async () => {
          const saved = PersonGroupSchema.parse(await roomApi(`/api/host/groups/${group.id}`, { personIds }, 'PUT'));
          setGroups(current => current?.map(entry => entry.id === saved.id ? saved : entry));
        }, false)} />}
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
    <p className="person-hint">Check names to add them to the group. Changes save automatically.</p>
    <div className="people-search"><label><span className="visually-hidden">Search people</span><input type="search" placeholder="Search a person…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <button type="button" className="quiet" disabled={busy || !shown.length} onClick={() => onChange(allShown ? group.personIds.filter(id => !shown.some(person => person.id === id)) : [...new Set([...group.personIds, ...shown.map(person => person.id)])])}>
        {allShown ? (search.trim() ? 'Remove matches' : 'Remove all') : (search.trim() ? 'Add matches' : 'Add all')}</button></div>
    {!shown.length && <p className="person-hint">No matching people.</p>}
    <ul className="group-people">{shown.map(person => <li key={person.id}><label className="person-check"><input type="checkbox" disabled={busy} checked={chosen.has(person.id)}
      onChange={event => onChange(event.target.checked ? [...group.personIds, person.id] : group.personIds.filter(id => id !== person.id))} />{person.name}</label></li>)}</ul>
  </div>;
}
