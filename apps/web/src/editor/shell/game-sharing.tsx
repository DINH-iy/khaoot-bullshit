import { useEffect, useState } from 'react';
import { EDITOR_ROLE_ID, GameSharingSchema, type GameSharing } from '@party/contracts';
import { roomApi } from '../../room/api.js';
import { useTexts } from '../../i18n/texts.js';
import { Dropdown } from '../../ui/dropdown.js';
import { SHARE_TEXTS } from './share.text.js';

type Shares = GameSharing['shares'];

/**
 * Who may work on this game and in which role, for those allowed to share it (its maker, the owner, or a role with
 * "share"): a role per person (or not shared), and for the owner who made it. `added`: a person just invited, shared
 * with at once as Editor.
 */
export function GameSharingFields({ gameId, added }: { gameId: string; added: string | null }) {
  const t = useTexts(SHARE_TEXTS); const [sharing, setSharing] = useState<GameSharing | null>(null); const [note, setNote] = useState('');
  useEffect(() => { void roomApi(`/api/host/games/${gameId}/sharing`).then(data => setSharing(GameSharingSchema.parse(data))).catch(() => setSharing(null)); }, [gameId]);
  // A change shows at once; the server's answer then confirms it (or it goes back).
  const save = (next: { shares: Shares; authorPersonId?: string | null }) => {
    const before = sharing; setNote('');
    if (sharing) setSharing({ ...sharing, shares: next.shares, ...(next.authorPersonId !== undefined ? { authorPersonId: next.authorPersonId } : {}) });
    void roomApi(`/api/host/games/${gameId}/sharing`, next).then(data => { setSharing(GameSharingSchema.parse(data)); setNote(t('saved')); }).catch(() => { setSharing(before); setNote(t('failed')); });
  };
  const withRole = (personId: string, roleId: string | null) => [...(sharing?.shares ?? []).filter(share => share.personId !== personId), ...(roleId ? [{ personId, roleId }] : [])];
  // Inviting someone from the list above also lets them work on this game (as Editor, unless they already have a role here).
  useEffect(() => { if (added && sharing && !sharing.shares.some(share => share.personId === added) && sharing.authorPersonId !== added) save({ shares: withRole(added, EDITOR_ROLE_ID) }); }, [added]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sharing) return null;
  const others = sharing.editors.filter(person => person.personId !== sharing.authorPersonId);
  const roleOf = (personId: string) => sharing.shares.find(share => share.personId === personId)?.roleId ?? '';
  return <div className="invite-people game-sharing">
    <h3>{t('title')}</h3>
    <p className="hint">{t('hint')}</p>
    {sharing.canChangeAuthor && <><label className="ed-inline">{t('madeBy')}<Dropdown value={sharing.authorPersonId ?? ''} label={t('madeBy')}
      options={[{ value: '', label: t('owner') }, ...sharing.editors.map(person => ({ value: person.personId, label: person.name }))]}
      onChange={value => save({ shares: sharing.shares.filter(share => share.personId !== value), authorPersonId: value || null })} /></label>
      <p className="hint">{t('madeByHint')}</p></>}
    {others.length === 0 ? <p className="hint">{t('noEditors')}</p> : <ul className="plain-list">{others.map(person => <li key={person.personId} className="share-row">
      <span>{person.name}</span>
      <Dropdown value={roleOf(person.personId)} label={t('roleFor', { name: person.name })}
        options={[{ value: '', label: t('notShared') }, ...sharing.roles.map(role => ({ value: role.id, label: role.name }))]}
        onChange={value => save({ shares: withRole(person.personId, value || null) })} /></li>)}</ul>}
    {note && <p role="status" className="hint">{note}</p>}
  </div>;
}
