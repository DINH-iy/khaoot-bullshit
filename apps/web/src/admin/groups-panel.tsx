import { useEffect, useState } from 'react';
import { MAX_GROUP_MEMBERS, PersonGroupListSchema, PersonGroupSchema, type PersonGroup } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { FaIcon } from '../presentation/icons.js';
import { SIGNED_OUT_TEXT } from '../owner/owner-session.js';
import { usePeoplePage } from '../people/use-people-page.js';
import { PeoplePager } from '../people/people-pager.js';

// Groups of people (server: people/groups.ts): a shortcut for adding many people to a room at once
// (the host's "Add people…" list in a room offers each group). A person can be in any number of groups.
const problems: Record<string, string> = {
  UNAUTHORIZED: SIGNED_OUT_TEXT, NAME_TAKEN: 'There already is a group with that name. Pick another.',
  INVALID_COMMAND: 'Give a name of 1 to 40 characters.', NOT_FOUND: 'That group no longer exists.', RATE_LIMITED: 'That is the most groups there can be (200).',
  GROUP_FULL: `A group holds at most ${MAX_GROUP_MEMBERS} people. Search for fewer people to add.`,
};
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'The server could not be reached. Check that it is running and try again.';

export function GroupsPanel() {
  const [groups, setGroups] = useState<PersonGroup[]>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const load = () => roomApi<unknown>('/api/host/groups').then(data => { setGroups(PersonGroupListSchema.parse(data).groups); setError(''); });
  useEffect(() => { void load().catch(cause => setError(explain(cause))); }, []);
  /** Runs a change (busy meanwhile); its result, or undefined when it failed (the error then shows). */
  const run = async <T,>(work: () => Promise<T>, refresh = true): Promise<T | undefined> => {
    setBusy(true); setError('');
    try { const result = await work(); if (refresh) await load(); return result; } catch (cause) { setError(explain(cause)); return undefined; } finally { setBusy(false); }
  };
  const add = (event: React.FormEvent) => { event.preventDefault(); void run(async () => { const made = await roomApi<{ id: string }>('/api/host/groups', { name }); setName(''); setOpen(made.id); }); };

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
      const expanded = open === group.id; const members = group.names;
      return <li key={group.id} className="group-card">
        <div className="group-head">
          <div className="group-heading"><span className="group-icon"><FaIcon name="users" /></span>
            <div><h3 className="group-name">{group.name}</h3><p className="group-count">{group.personIds.length} {group.personIds.length === 1 ? 'person' : 'people'}</p></div></div>
          <div className="admin-actions">
            <button type="button" className="quiet group-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : group.id)}>
              {expanded ? 'Done' : group.personIds.length ? 'Edit members' : 'Add people'}<FaIcon name={expanded ? 'chevron-up' : 'chevron-down'} /></button>
            <button type="button" className="quiet" disabled={busy} onClick={() => { const next = prompt(`New name for ${group.name}`, group.name)?.trim(); if (next && next !== group.name) void run(() => roomApi(`/api/host/groups/${group.id}`, { name: next }, 'PUT')); }}>Rename</button>
            <button type="button" className="danger" disabled={busy} onClick={() => { if (confirm(`Delete the group ${group.name}? The people in it stay; only the group goes.`)) void run(() => roomApi(`/api/host/groups/${group.id}/remove`, {})); }}>Delete</button>
          </div>
        </div>
        {!expanded && members.length > 0 && <p className="group-members">{members.slice(0, 5).join(', ')}{members.length > 5 ? ` +${members.length - 5}` : ''}</p>}
        {expanded && <GroupMembers group={group} busy={busy} onSaved={saved => setGroups(current => current?.map(entry => entry.id === saved.id ? saved : entry))}
          save={(path, body, method) => run(async () => PersonGroupSchema.parse(await roomApi(path, body, method)), false)} />}
      </li>;
    })}</ul>}
  </>;
}

/**
 * Tick who is in the group, a page of people at a time; each tick saves straight away. "Add all" and "Remove all"
 * take everyone matching the search, also those on other pages.
 */
function GroupMembers({ group, busy, save, onSaved }: {
  group: PersonGroup; busy: boolean; onSaved: (group: PersonGroup) => void;
  save: (path: string, body: object, method?: 'PUT') => Promise<PersonGroup | undefined>;
}) {
  const paging = usePeoplePage(); const { data, search, setSearch, query } = paging;
  const change = (path: string, body: object, method?: 'PUT') => void save(path, body, method).then(saved => { if (saved) onSaved(saved); });
  const chosen = new Set(group.personIds);
  if (paging.failed) return <p role="alert" className="error">{explain(undefined)}</p>;
  if (!data) return <p role="status">Loading people…</p>;
  if (!query && !data.total) return <p className="admin-empty">No people yet. Add them on the People tab first.</p>;
  return <div className="group-members-edit" role="group" aria-label={`Who is in ${group.name}`}>
    <p className="person-hint">Check names to add them to the group. Changes save automatically.</p>
    <div className="people-search"><label><span className="visually-hidden">Search people</span><input type="search" placeholder="Search a person…" maxLength={40} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <button type="button" className="quiet" disabled={busy || !data.total} onClick={() => change(`/api/host/groups/${group.id}/matches`, { search: query, add: true })}>
        {query ? `Add all ${data.total.toLocaleString()} found` : 'Add everyone'}</button>
      <button type="button" className="danger" disabled={busy || !group.personIds.length || !data.total} onClick={() => change(`/api/host/groups/${group.id}/matches`, { search: query, add: false })}>
        {query ? 'Remove those found' : 'Remove everyone'}</button></div>
    {!data.total && <p className="person-hint">No matching people.</p>}
    <ul className="group-people">{data.people.map(person => <li key={person.id}><label className="person-check"><input type="checkbox" disabled={busy} checked={chosen.has(person.id)}
      onChange={event => change(`/api/host/groups/${group.id}`, { personIds: event.target.checked ? [...group.personIds, person.id] : group.personIds.filter(id => id !== person.id) }, 'PUT')} />{person.name}</label></li>)}</ul>
    <PeoplePager paging={paging} />
  </div>;
}
