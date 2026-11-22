import { useEffect, useRef, useState } from 'react';
import { PeopleListSchema, PersonKeyViewSchema, type PersonRow } from '@party/contracts';
import { roomApi } from '../../room/api.js';
import { useTexts } from '../../i18n/texts.js';
import { rich } from '../../i18n/rich.js';
import { SETTINGS_TEXTS } from './settings.text.js';
import type { HostRole } from '../../owner/use-host-access.js';

/** An invite: opens this game's editor and signs the device in as the person (their personal key, after #, never in server logs). */
const inviteLink = (gameId: string, key: string) => `${location.origin}/?edit=${gameId}#person=${key}`;

/**
 * Inviting people to edit this game together. Anyone signed in (the owner or an
 * editor) can share the plain link to the game. The owner also sees their people:
 * an invite link for each person with editor rights (it signs their device in
 * and opens this game), and editor rights to give with one tap.
 */
export function InvitePanel({ gameId, role, onClose }: { gameId: string; role: HostRole | null; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { heading.current?.focus(); }, []); const t = useTexts(SETTINGS_TEXTS);
  const [people, setPeople] = useState<PersonRow[]>(); const [error, setError] = useState(''); const [copied, setCopied] = useState(''); const [busy, setBusy] = useState(false);
  const owner = role === 'owner';
  const load = () => roomApi('/api/host/people').then(data => setPeople(PeopleListSchema.parse(data).people)).catch(() => setError(t('peopleFailed')));
  useEffect(() => { if (owner) void load(); }, [owner]);
  const copy = (what: string, text: string) => { void navigator.clipboard.writeText(text).then(() => setCopied(what), () => setError(t('copyBlocked'))); };
  const invite = (person: PersonRow) => { setBusy(true); setError(''); void roomApi(`/api/host/people/${person.id}/key`).then(data => copy(person.id, inviteLink(gameId, PersonKeyViewSchema.parse(data).key)))
    .catch(() => setError(t('noKey', { name: person.name }))).finally(() => setBusy(false)); };
  const allow = (person: PersonRow) => { setBusy(true); setError(''); void roomApi(`/api/host/people/${person.id}/editor`, { canEdit: true }).then(load).catch(() => setError(t('didNotWork'))).finally(() => setBusy(false)); };
  const plain = `${location.origin}/?edit=${gameId}`;
  return <section className="game-settings-panel invite-panel" aria-labelledby="invite-heading" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <div className="inspector-head"><h2 id="invite-heading" ref={heading} tabIndex={-1}>{t('editTogether')}</h2><button className="small-button" onClick={onClose}>{t('close')}</button></div>
    <p className="hint">{t('editTogetherHint')}</p>
    {error && <p role="alert" className="hint warn">{error}</p>}
    {owner && <div className="invite-people">
      <h3>{t('invitePerson')}</h3>
      {!people && !error && <p role="status" className="hint">{t('loadingPeople')}</p>}
      {people && people.length === 0 && <p className="hint">{rich(t('noPeople'), { admin: <a href="/?admin=people">{t('adminPeople')}</a> })}</p>}
      {people && people.length > 0 && <ul className="plain-list">{people.map(person => <li key={person.id} className="invite-row">
        <span><strong>{person.name}</strong><small>{t(person.canEdit ? 'canEdit' : 'playerOnly')}</small></span>
        {person.canEdit
          ? <button className="small-button" disabled={busy || !person.hasKey} title={person.hasKey ? undefined : t('newKeyFirst')} onClick={() => invite(person)}>{t(copied === person.id ? 'linkCopied' : 'copyInvite')}</button>
          : <button className="small-button" disabled={busy} onClick={() => allow(person)}>{t('giveRights')}</button>}
      </li>)}</ul>}
      <p className="hint">{t('inviteHint')}</p>
    </div>}
    <div className="invite-people">
      <h3>{t('linkToGame')}</h3>
      <p className="hint">For people already signed in as an editor{owner ? ' (or you on another device)' : ''}.</p>
      <div className="invite-link"><code>{plain}</code><button className="small-button" onClick={() => copy('plain', plain)}>{t(copied === 'plain' ? 'copied' : 'copy')}</button></div>
    </div>
  </section>;
}
