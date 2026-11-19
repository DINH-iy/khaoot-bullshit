import { Dropdown } from '../ui/dropdown.js';
import { useEffect, useState, type Ref } from 'react';
import type { RoomSnapshot } from '@party/contracts';
import { Avatar } from '../players/avatar.js';
import { BUILDER_TEXTS } from '../players/look-builder.text.js';
import { sendPhoto } from '../players/look-builder.js';
import { FaIcon } from '../presentation/icons.js';
import { useTexts } from '../i18n/texts.js';
import { HOST_TEXTS } from './host.text.js';
import { ROUND_CONTROL_TEXTS } from './round-control.text.js';
import { ROOM_MANAGEMENT_TEXTS } from './room-management.text.js';
import { roomApi } from './api.js';

type Player = RoomSnapshot['players'][number];

export function HostPlayerList({ state, disabled, send, onError, listRef }: {
  state: RoomSnapshot; disabled: boolean; send: (type: string, extra: Record<string, unknown>) => void;
  onError: (message: string) => void; listRef?: Ref<HTMLUListElement>;
}) {
  const h = useTexts(HOST_TEXTS); const t = useTexts(ROOM_MANAGEMENT_TEXTS);
  const [editing, setEditing] = useState<string>();
  const [assigning, setAssigning] = useState(false); const rounds = useTexts(ROUND_CONTROL_TEXTS);
  const sessionId = state.view.sessionId;
  const kick = (player: Player, ban: boolean) => {
    if (ban && !confirm(t('banAsk', { name: player.displayName }))) return;
    void roomApi(`/api/rooms/${sessionId}/revoke`, { playerId: player.id, ban }).catch(() => onError(h('revokeFailed')));
  };
  return <><label className="host-phone-picker">{rounds('hostPhone')}
    <Dropdown disabled={disabled || assigning} value={state.hostPhonePlayerId ?? ''} onChange={value => {
      setAssigning(true);
      void roomApi(`/api/rooms/${sessionId}/host-phone`, { playerId: value || null })
        .catch(() => onError(rounds('hostPhoneFailed'))).finally(() => setAssigning(false));
    }} options={[{ value: '', label: rounds('none') }, ...state.players.map(player => ({ value: player.id, label: player.displayName, disabled: !player.connected }))]} /></label><ul ref={listRef}>{state.players.map(player => <li key={player.id} className={player.connected ? 'online' : 'offline'}>
    <span className="dot" aria-hidden="true" /><Avatar look={player.look} size={28} />{player.displayName}<span className="visually-hidden"> · </span>
    <span className="player-state">{h(player.connected ? 'connected' : 'disconnected')}</span>
    {player.look.picture && <button type="button" className="small-button ghost" disabled={disabled} aria-label={h('removePictureOf', { name: player.displayName })}
      onClick={() => send('player.removePicture', { playerId: player.id })}>{h('removePicture')}</button>}
    <button type="button" className="small-button ghost" aria-expanded={editing === player.id}
      onClick={() => setEditing(editing === player.id ? undefined : player.id)}>{t('manage', { name: player.displayName })}</button>
    <button type="button" className="icon-button player-revoke" disabled={disabled} aria-label={h('revokeFor', { name: player.displayName })} title={h('kickOut', { name: player.displayName })}
      onClick={() => kick(player, false)}><FaIcon name="boot" /></button>
    {editing === player.id && <PlayerModeration key={player.id} player={player} disabled={disabled} sessionId={sessionId}
      change={fields => send('player.moderate', { playerId: player.id, ...fields })} onError={onError} onBan={() => kick(player, true)} />}
  </li>)}</ul></>;
}

function PlayerModeration({ player, sessionId, disabled, change, onError, onBan }: {
  player: Player; sessionId: string; disabled: boolean; change: (fields: { displayName?: string; photoId?: string }) => void;
  onError: (message: string) => void; onBan: () => void;
}) {
  const t = useTexts(ROOM_MANAGEMENT_TEXTS); const look = useTexts(BUILDER_TEXTS);
  const [name, setName] = useState(player.displayName);
  const [uploading, setUploading] = useState(false);
  const [photoId, setPhotoId] = useState<string>();
  useEffect(() => { setName(player.displayName); }, [player.displayName]);
  const rename = name.trim() && name.trim() !== player.displayName;
  const replace = photoId && player.look.picture?.assetId !== photoId ? photoId : undefined;
  return <form className="player-moderation" onSubmit={event => {
    event.preventDefault();
    if (!disabled && !uploading && (rename || replace)) change({ ...(rename ? { displayName: name.trim() } : {}), ...(replace ? { photoId: replace } : {}) });
  }}>
    <label>{t('name')}<input value={name} maxLength={40} onChange={event => setName(event.target.value)} /></label>
    <label>{look('choosePhoto')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || uploading} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      setUploading(true); setPhotoId(undefined);
      void sendPhoto(sessionId, file, player.id).then(setPhotoId).catch(() => onError(t('photoFailed'))).finally(() => setUploading(false));
    }} /></label>
    {replace && <Avatar look={{ ...player.look, picture: { assetId: replace, kind: 'photo' } }} size={44} />}
    <div className="actions">
      <button type="submit" className="primary" disabled={disabled || uploading || (!rename && !replace)}>{t(replace ? 'replacePhoto' : 'saveName')}</button>
      {player.canBan && <button type="button" className="danger" disabled={disabled || uploading} onClick={onBan}>{t('ban')}</button>}
    </div>
  </form>;
}
