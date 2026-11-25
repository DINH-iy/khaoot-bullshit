import { useEffect, useState } from 'react';
import { GameSharingSchema, type GameSharing } from '@party/contracts';
import { roomApi } from '../../room/api.js';
import { useTexts } from '../../i18n/texts.js';
import { Dropdown } from '../../ui/dropdown.js';
import { SHARE_TEXTS } from './share.text.js';

/**
 * Who may edit this game, for its author and the owner (someone it is only shared with does not see this):
 * a tick per editor, and for the owner who made it. `added`: a person just invited, shared with at once.
 */
export function GameSharingFields({ gameId, added }: { gameId: string; added: string | null }) {
  const t = useTexts(SHARE_TEXTS); const [sharing, setSharing] = useState<GameSharing | null>(null); const [note, setNote] = useState('');
  useEffect(() => { void roomApi(`/api/host/games/${gameId}/sharing`).then(data => setSharing(GameSharingSchema.parse(data))).catch(() => setSharing(null)); }, [gameId]);
  // A tick shows at once; the server's answer then confirms it (or it goes back).
  const save = (next: { sharedWith: string[]; authorPersonId?: string | null }) => {
    const before = sharing; setNote('');
    if (sharing) setSharing({ ...sharing, sharedWith: next.sharedWith, ...(next.authorPersonId !== undefined ? { authorPersonId: next.authorPersonId } : {}) });
    void roomApi(`/api/host/games/${gameId}/sharing`, next).then(data => { setSharing(GameSharingSchema.parse(data)); setNote(t('saved')); }).catch(() => { setSharing(before); setNote(t('failed')); });
  };
  // Inviting someone from the list above also lets them edit this game.
  useEffect(() => { if (added && sharing && !sharing.sharedWith.includes(added) && sharing.authorPersonId !== added) save({ sharedWith: [...sharing.sharedWith, added] }); }, [added]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sharing) return null;
  const others = sharing.editors.filter(person => person.personId !== sharing.authorPersonId);
  return <div className="invite-people game-sharing">
    <h3>{t('title')}</h3>
    <p className="hint">{t('hint')}</p>
    {sharing.canChangeAuthor && <><label className="ed-inline">{t('madeBy')}<Dropdown value={sharing.authorPersonId ?? ''} label={t('madeBy')}
      options={[{ value: '', label: t('owner') }, ...sharing.editors.map(person => ({ value: person.personId, label: person.name }))]}
      onChange={value => save({ sharedWith: sharing.sharedWith.filter(id => id !== value), authorPersonId: value || null })} /></label>
      <p className="hint">{t('madeByHint')}</p></>}
    {others.length === 0 ? <p className="hint">{t('noEditors')}</p> : <ul className="plain-list">{others.map(person => <li key={person.personId}>
      <label className="choice"><input type="checkbox" checked={sharing.sharedWith.includes(person.personId)}
        onChange={event => save({ sharedWith: event.target.checked ? [...sharing.sharedWith, person.personId] : sharing.sharedWith.filter(id => id !== person.personId) })} />{person.name}</label></li>)}</ul>}
    {note && <p role="status" className="hint">{note}</p>}
  </div>;
}
