import { useEffect, useMemo, useRef, useState } from 'react';
import { PeopleListSchema, PersonGroupListSchema, PersonKeyViewSchema, type PersonGroup, type PersonRow, type RoomSnapshot } from '@party/contracts';
import { newId, roomApi } from './api.js';
import { FaIcon } from '../presentation/icons.js';
import { CopyIcon } from './join-qr.js';
import { rich } from '../i18n/rich.js';
import { useTexts } from '../i18n/texts.js';
import { translate } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from './extras.text.js';
const x = (key: keyof typeof EXTRAS_TEXTS.en, values?: Record<string, string | number>) => translate(EXTRAS_TEXTS, key, values);
import { HOST_TEXTS } from './host.text.js';

// People in a room, for players without their personal key at hand (server: rooms/room-people.ts).
// Phones: pick your name from the people the host added (the host approves), or make an account
// while joining when the host allows it. Host: the setting, the added people with their keys, and approvals.

const problems: Record<string, string> = {
  SEAT_DENIED: 'pDenied', SEAT_UNAVAILABLE: 'pGone', ROOM_NOT_AVAILABLE: 'noRoom', RATE_LIMITED: 'tooMany', NAME_TAKEN: 'pTaken', FORBIDDEN: 'pForbidden',
};
const explain = (cause: unknown) => x((problems[cause instanceof Error ? cause.message : ''] ?? 'unreachable') as keyof typeof EXTRAS_TEXTS.en);
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
    <h2 id="pick-name-heading">{x('playedBefore')}</h2>
    {error && <p role="alert" className="join-error">{error}</p>}
    {waiting ? <><p role="status">{rich(x('askingHost'), { name: <strong>{waiting.name}</strong> })}</p>
      <button type="button" className="small-button" onClick={() => { forget(); setWaiting(undefined); }}><FaIcon name="xmark" />{x('stopAsking')}</button></>
      : <><p className="pick-name-hint">{x('tapName')}</p>
        <ul className="pick-name-list">{people.map(person => <li key={person.id}><button type="button" onClick={() => pick(person)}>{person.name}</button></li>)}</ul></>}
  </div>;
}

/** After making an account: the personal key, shown once, to write down. */
export function NewKeyCard({ name, personalKey, busy, onContinue }: { name: string; personalKey: string; busy: boolean; onContinue: () => void }) {
  return <div className="new-key" role="group" aria-labelledby="new-key-heading">
    <p className="new-key-icon" aria-hidden="true"><FaIcon name="user-plus" /></p>
    <h2 id="new-key-heading">{x('welcome', { name })}</h2>
    <p>{x('codeIntro', { name })}</p>
    <div className="new-key-code"><code aria-label={x('personalCode', { code: personalKey })}>{personalKey}</code><CopyIcon text={personalKey} label={x('copyCode')} /></div>
    <p className="new-key-note">{x('codeNote')}</p>
    <button type="button" className="primary big" disabled={busy} onClick={onContinue}>{x('continueGame')}</button>
  </div>;
}

function useHostAction(onError: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const act = (path: string, body: object, failed = x('didNotGoThrough')) => { setBusy(true); void roomApi(path, body).catch(() => onError(failed)).finally(() => setBusy(false)); };
  return { busy, act };
}

/** Room settings: guests may make their own account while joining. */
export function SignupSetting({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const { busy, act } = useHostAction(onError); const h = useTexts(HOST_TEXTS);
  return <label className="choice"><input type="checkbox" checked={state.settings.signup} disabled={busy} onChange={event => act(`/api/rooms/${sessionId}/settings`, { signup: event.target.checked })} />
    {h('signupSetting')}</label>;
}

/** Room settings: phones on the test bench (several players in one browser) may join; the test bench switches it on. */
export function TestBenchSetting({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const { busy, act } = useHostAction(onError); const h = useTexts(HOST_TEXTS);
  return <label className="choice"><input type="checkbox" checked={state.settings.testBench} disabled={busy} onChange={event => act(`/api/rooms/${sessionId}/settings`, { testBench: event.target.checked })} />
    {h('testBenchSetting')}</label>;
}

/** Phones asking to sign in as one of the added people, in the host panel (nothing when there are none). */
export function NameRequests({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const { busy, act } = useHostAction(onError); const h = useTexts(HOST_TEXTS);
  const requests = state.nameRequests ?? []; if (!requests.length) return null;
  const name = (personId: string) => state.expected?.find(person => person.personId === personId)?.name ?? h('someone');
  return <div className="seat-requests" role="region" aria-label={h('nameRequests')}><h3>{h('whoIsThis')}</h3><ul className="plain-list">{requests.map(request => {
    const label = name(request.personId);
    return <li key={request.requestId}>{h('phoneSays', { name: label })}
      <div className="actions"><button disabled={busy} onClick={() => act(`/api/rooms/${sessionId}/name-requests`, { requestId: request.requestId, approve: true }, h('requestExpired'))}><FaIcon name="check" /> {h('yesItIs', { name: label })}</button>
        <button disabled={busy} className="ghost icon-button" aria-label={h('noItIsNot', { name: label })} title={h('no')} onClick={() => act(`/api/rooms/${sessionId}/name-requests`, { requestId: request.requestId, approve: false }, h('requestExpired'))}><FaIcon name="xmark" /></button></div></li>;
  })}</ul></div>;
}

/** Players sheet: the people added to this room (with their code and whether they are in), and a picker to add more. */
export function ExpectedPeople({ state, sessionId, onError }: { state: RoomSnapshot; sessionId: string; onError: (message: string) => void }) {
  const { busy, act } = useHostAction(onError); const h = useTexts(HOST_TEXTS);
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
  const save = (personIds: string[]) => act(`/api/rooms/${sessionId}/expected`, { personIds }, h('listFailed'));
  return <div className="expected-people">
    <div className="expected-head"><h3>{h('peopleAdded')}</h3><button type="button" className="icon-button" onClick={() => setPicking(!picking)} aria-expanded={picking} aria-label={h(picking ? 'doneAdding' : 'addPeople')} title={h(picking ? 'done' : 'addPeopleTitle')}><FaIcon name={picking ? 'check' : 'user-plus'} /></button></div>
    {!expected.length && !picking && <p className="hint">{h('addPeopleHint')}</p>}
    {expected.length > 0 && <ul className="plain-list expected-list">{expected.map(person => <li key={person.personId}>
      <span className="expected-name">{person.name}</span>
      <code className="expected-key" aria-label={h('codeOf', { name: person.name })}>{keys[person.personId] || '…'}</code>
      <span className={`expected-state${person.joined ? ' in' : ''}`}>{h(person.joined ? 'inTheRoom' : 'notYet')}</span>
      <button type="button" className="icon-button" disabled={busy} aria-label={h('takeOff', { name: person.name })} title={h('takeOff', { name: person.name })} onClick={() => save(expected.filter(other => other.personId !== person.personId).map(other => other.personId))}><FaIcon name="boot" /></button></li>)}</ul>}
    {picking && <PeoplePicker chosen={expected.map(person => person.personId)} busy={busy} onChange={save} />}
  </div>;
}

/** All people (from the People page), to tick who is expected; a group (People → Groups) ticks all its members at once. */
function PeoplePicker({ chosen, busy, onChange }: { chosen: string[]; busy: boolean; onChange: (personIds: string[]) => void }) {
  const [people, setPeople] = useState<PersonRow[]>(); const [search, setSearch] = useState(''); const [error, setError] = useState('');
  const [groups, setGroups] = useState<PersonGroup[]>([]); const h = useTexts(HOST_TEXTS);
  useEffect(() => { void roomApi('/api/host/people').then(data => setPeople(PeopleListSchema.parse(data).people)).catch(() => setError(h('peopleLoadFailed'))); }, []);
  // Without groups (or when they cannot be loaded) the list of people works as before.
  useEffect(() => { void roomApi('/api/host/groups').then(data => setGroups(PersonGroupListSchema.parse(data).groups.filter(group => group.personIds.length > 0))).catch(() => undefined); }, []);
  const toggleGroup = (group: PersonGroup, add: boolean) => onChange(add ? [...new Set([...chosen, ...group.personIds])] : chosen.filter(id => !group.personIds.includes(id)));
  const shown = people?.filter(person => person.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="people-picker">
    {error && <p role="alert" className="error">{error}</p>}
    {!people && !error && <p role="status">{h('loadingPeople')}</p>}
    {people && !people.length && <p className="hint">{h('noPeople')}</p>}
    {groups.length > 0 && <fieldset className="group-picker"><legend>{h('groups')}</legend><ul className="plain-list">{groups.map(group => {
      const all = group.personIds.every(id => chosen.includes(id)); const some = !all && group.personIds.some(id => chosen.includes(id));
      return <li key={group.id}><label className="choice"><input type="checkbox" disabled={busy} checked={all} ref={input => { if (input) input.indeterminate = some; }}
        onChange={event => toggleGroup(group, event.target.checked)} />{group.name} <span className="hint">({group.personIds.length})</span></label></li>;
    })}</ul></fieldset>}
    {people && people.length > 6 && <label><span className="visually-hidden">{h('searchPeople')}</span><input type="search" placeholder={h('searchPerson')} value={search} onChange={event => setSearch(event.target.value)} /></label>}
    {shown && <ul className="plain-list">{shown.map(person => <li key={person.id}><label className="choice"><input type="checkbox" disabled={busy} checked={chosen.includes(person.id)}
      onChange={event => onChange(event.target.checked ? [...chosen, person.id] : chosen.filter(id => id !== person.id))} />{person.name}</label></li>)}</ul>}
  </div>;
}
