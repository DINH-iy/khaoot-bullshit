import { useEffect, useMemo, useRef, useState } from 'react';
import { PeopleListSchema, PersonGroupListSchema, PersonKeyViewSchema, type PersonGroup, type PersonRow, type RoomSnapshot } from '@party/contracts';
import { newId, roomApi } from './api.js';
import { FaIcon } from '../presentation/icons.js';
import { CopyIcon } from './join-qr.js';

// People in a room, for players without their personal key at hand (server: rooms/room-people.ts).
// Phones: pick your name from the people the host added (the host approves), or make an account
// while joining when the host allows it. Host: the setting, the added people with their keys, and approvals.

const problems: Record<string, string> = {
  SEAT_DENIED: 'The host turned this down.', SEAT_UNAVAILABLE: 'That name can no longer be picked. Ask the host.',
  ROOM_NOT_AVAILABLE: 'No open room has that code.', RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
  NAME_TAKEN: 'Someone already has that name. Pick another.', FORBIDDEN: 'Making an account is not switched on in this room.',
};
const explain = (cause: unknown) => problems[cause instanceof Error ? cause.message : ''] ?? 'The server could not be reached. Try again.';
type Waiting = { requestId: string; personId: string; name: string };
const storageKey = (code: string) => `party_pick_${code}`;

/** Join screen: "Played here before?" — the people the host added. Tapping one asks the host; once approved this phone is them. */
export function PickYourName({ roomCode, people, onSignedIn }: { roomCode: string; people: { id: string; name: string }[]; onSignedIn: (name: string) => void }) {
  const [waiting, setWaiting] = useState<Waiting>(); const [error, setError] = useState('');
  const done = useRef(onSignedIn); done.current = onSignedIn;
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(storageKey(roomCode)) ?? 'null') as Waiting | null; if (saved?.requestId) setWaiting(saved); } catch { /* optional */ } }, [roomCode]);
  const forget = () => { try { localStorage.removeItem(storageKey(roomCode)); } catch { /* optional */ } };
  useEffect(() => {
    if (!waiting) return; let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const check = () => { void roomApi<{ status: 'approved' | 'pending'; name: string | null }>('/api/rooms/pick', { roomCode, personId: waiting.personId, requestId: waiting.requestId })
      .then(result => { if (stopped) return; if (result.status === 'approved') { forget(); setWaiting(undefined); done.current(result.name ?? waiting.name); } else timer = setTimeout(check, 2500); })
      .catch(cause => { if (stopped) return; forget(); setWaiting(undefined); setError(explain(cause)); }); };
    timer = setTimeout(check, 0);
    return () => { stopped = true; clearTimeout(timer); };
  }, [waiting, roomCode]);
  const pick = (person: { id: string; name: string }) => {
    const request = { requestId: newId(), personId: person.id, name: person.name }; setError('');
    try { localStorage.setItem(storageKey(roomCode), JSON.stringify(request)); } catch { /* still works while the page stays open */ }
    setWaiting(request);
  };
  if (!people.length && !waiting) return null;
  return <div className="pick-name" role="group" aria-labelledby="pick-name-heading">
    <h2 id="pick-name-heading">Played with us before?</h2>
    {error && <p role="alert" className="join-error">{error}</p>}
    {waiting ? <><p role="status">Asking the host to let you in as <strong>{waiting.name}</strong>…</p>
      <button type="button" className="link-button" onClick={() => { forget(); setWaiting(undefined); }}><FaIcon name="xmark" />Stop asking</button></>
      : <><p className="pick-name-hint">Tap your name. The host lets you in, and this phone stays you from now on.</p>
        <ul className="pick-name-list">{people.map(person => <li key={person.id}><button type="button" onClick={() => pick(person)}>{person.name}</button></li>)}</ul></>}
  </div>;
}

/** After making an account: the personal key, shown once, to write down. */
export function NewKeyCard({ name, personalKey, busy, onContinue }: { name: string; personalKey: string; busy: boolean; onContinue: () => void }) {
  return <div className="new-key" role="group" aria-labelledby="new-key-heading">
    <p className="new-key-icon" aria-hidden="true"><FaIcon name="user-plus" /></p>
    <h2 id="new-key-heading">Welcome, {name}!</h2>
    <p>Your personal code. With it you are always {name}, on any phone, with your look, chips and stats.</p>
    <div className="new-key-code"><code aria-label={`Personal code ${personalKey}`}>{personalKey}</code><CopyIcon text={personalKey} label="Copy code" /></div>
    <p className="new-key-note">Write it down or take a screenshot: it is shown only now. Lost it? The host can look it up.</p>
    <button type="button" className="primary big" disabled={busy} onClick={onContinue}>Continue to the game</button>
  </div>;
}

function useHostAction(onError: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const act = (path: string, body: object, failed = 'That did not go through. Try again.') => { setBusy(true); void roomApi(path, body).catch(() => onError(failed)).finally(() => setBusy(false)); };
  return { busy, act };
}

/** Room settings: guests may make their own account while joining. */
export function SignupSetting({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const { busy, act } = useHostAction(onError);
  return <label className="choice"><input type="checkbox" checked={state.settings.signup} disabled={busy} onChange={event => act(`/api/rooms/${sessionId}/settings`, { signup: event.target.checked })} />
    Players can make an account when joining</label>;
}

/** Room settings: phones on the test bench (several players in one browser) may join; the test bench switches it on. */
export function TestBenchSetting({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const { busy, act } = useHostAction(onError);
  return <label className="choice"><input type="checkbox" checked={state.settings.testBench} disabled={busy} onChange={event => act(`/api/rooms/${sessionId}/settings`, { testBench: event.target.checked })} />
    Test bench phones may join</label>;
}

/** Phones asking to sign in as one of the added people, in the host panel (nothing when there are none). */
export function NameRequests({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const { busy, act } = useHostAction(onError);
  const requests = state.nameRequests ?? []; if (!requests.length) return null;
  const name = (personId: string) => state.expected?.find(person => person.personId === personId)?.name ?? 'someone';
  return <div className="seat-requests" role="region" aria-label="Name requests"><h3>Who is this?</h3><ul className="plain-list">{requests.map(request => {
    const label = name(request.personId);
    return <li key={request.requestId}>A phone says it is <strong>{label}</strong>.
      <div className="actions"><button disabled={busy} onClick={() => act(`/api/rooms/${sessionId}/name-requests`, { requestId: request.requestId, approve: true }, 'The request may have expired.')}><FaIcon name="check" /> Yes, it is {label}</button>
        <button disabled={busy} className="ghost icon-button" aria-label={`No, it is not ${label}`} title="No" onClick={() => act(`/api/rooms/${sessionId}/name-requests`, { requestId: request.requestId, approve: false }, 'The request may have expired.')}><FaIcon name="xmark" /></button></div></li>;
  })}</ul></div>;
}

/** Players sheet: the people added to this room (with their code and whether they are in), and a picker to add more. */
export function ExpectedPeople({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const { busy, act } = useHostAction(onError);
  const expected = useMemo(() => state.expected ?? [], [state.expected]);
  const [keys, setKeys] = useState<Record<string, string>>({}); const [picking, setPicking] = useState(false);
  // The host is the owner, so the keys can be looked up (as on the People page); one request per person, once.
  useEffect(() => {
    for (const person of expected) if (!(person.personId in keys)) {
      setKeys(current => ({ ...current, [person.personId]: '' }));
      void roomApi(`/api/host/people/${person.personId}/key`).then(data => setKeys(current => ({ ...current, [person.personId]: PersonKeyViewSchema.parse(data).key }))).catch(() => undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expected]);
  const save = (personIds: string[]) => act(`/api/rooms/${sessionId}/expected`, { personIds }, 'Could not change the list.');
  return <div className="expected-people">
    <div className="expected-head"><h3>People you added</h3><button type="button" className="icon-button" onClick={() => setPicking(!picking)} aria-expanded={picking} aria-label={picking ? 'Done adding people' : 'Add people'} title={picking ? 'Done' : 'Add people who played before'}><FaIcon name={picking ? 'check' : 'user-plus'} /></button></div>
    {!expected.length && !picking && <p className="hint">Add people who played before: they pick their name on the join screen and you let them in. Their codes show here, to tell them in person.</p>}
    {expected.length > 0 && <ul className="plain-list expected-list">{expected.map(person => <li key={person.personId}>
      <span className="expected-name">{person.name}</span>
      <code className="expected-key" aria-label={`Code of ${person.name}`}>{keys[person.personId] || '…'}</code>
      <span className={`expected-state${person.joined ? ' in' : ''}`}>{person.joined ? 'in the room' : 'not yet'}</span>
      <button type="button" className="icon-button" disabled={busy} aria-label={`Take ${person.name} off the list`} title={`Take ${person.name} off the list`} onClick={() => save(expected.filter(other => other.personId !== person.personId).map(other => other.personId))}><FaIcon name="boot" /></button></li>)}</ul>}
    {picking && <PeoplePicker chosen={expected.map(person => person.personId)} busy={busy} onChange={save} />}
  </div>;
}

/** All people (from the People page), to tick who is expected; a group (People → Groups) ticks all its members at once. */
function PeoplePicker({ chosen, busy, onChange }: { chosen: string[]; busy: boolean; onChange: (personIds: string[]) => void }) {
  const [people, setPeople] = useState<PersonRow[]>(); const [search, setSearch] = useState(''); const [error, setError] = useState('');
  const [groups, setGroups] = useState<PersonGroup[]>([]);
  useEffect(() => { void roomApi('/api/host/people').then(data => setPeople(PeopleListSchema.parse(data).people)).catch(() => setError('The people could not be loaded.')); }, []);
  // Without groups (or when they cannot be loaded) the list of people works as before.
  useEffect(() => { void roomApi('/api/host/groups').then(data => setGroups(PersonGroupListSchema.parse(data).groups.filter(group => group.personIds.length > 0))).catch(() => undefined); }, []);
  const toggleGroup = (group: PersonGroup, add: boolean) => onChange(add ? [...new Set([...chosen, ...group.personIds])] : chosen.filter(id => !group.personIds.includes(id)));
  const shown = people?.filter(person => person.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="people-picker">
    {error && <p role="alert" className="error">{error}</p>}
    {!people && !error && <p role="status">Loading people…</p>}
    {people && !people.length && <p className="hint">No people yet. Make them in Admin → People, or let players make an account (Room settings).</p>}
    {groups.length > 0 && <fieldset className="group-picker"><legend>Groups</legend><ul className="plain-list">{groups.map(group => {
      const all = group.personIds.every(id => chosen.includes(id)); const some = !all && group.personIds.some(id => chosen.includes(id));
      return <li key={group.id}><label className="choice"><input type="checkbox" disabled={busy} checked={all} ref={input => { if (input) input.indeterminate = some; }}
        onChange={event => toggleGroup(group, event.target.checked)} />{group.name} <span className="hint">({group.personIds.length})</span></label></li>;
    })}</ul></fieldset>}
    {people && people.length > 6 && <label><span className="visually-hidden">Search people</span><input type="search" placeholder="Search a person…" value={search} onChange={event => setSearch(event.target.value)} /></label>}
    {shown && <ul className="plain-list">{shown.map(person => <li key={person.id}><label className="choice"><input type="checkbox" disabled={busy} checked={chosen.includes(person.id)}
      onChange={event => onChange(event.target.checked ? [...chosen, person.id] : chosen.filter(id => id !== person.id))} />{person.name}</label></li>)}</ul>}
  </div>;
}
