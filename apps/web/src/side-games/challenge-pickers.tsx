import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BRICK_MAPS, BRICK_PRESETS, type RoomSnapshot } from '@party/contracts';
import { useTexts } from '../i18n/texts.js';
import { BRICK_TEXTS } from '../minigames/brick-rally/brick-rally.text.js';
import { BrickMapPreview } from '../minigames/brick-rally/board.js';
import { Avatar } from '../players/avatar.js';
import { FaIcon } from '../presentation/icons.js';
import { PagedResultList } from '../ui/paged-result-list.js';
import { st } from './side-api.js';

export type ChallengePlayer = RoomSnapshot['players'][number];
export type ChallengePreset = typeof BRICK_PRESETS[number];

export function PickerDialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="challenge-picker" aria-labelledby={id}
    onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="challenge-picker-surface">
      <header><h3 id={id}>{title}</h3><button type="button" className="ghost" aria-label={st('closePicker')} onClick={onClose}>✕</button></header>
      <div className="challenge-picker-body">{children}</div>
      {footer && <footer className="challenge-picker-footer">{footer}</footer>}
    </div>
  </dialog>;
}

export function OpponentPicker({ players, value, onChange }: { players: ChallengePlayer[]; value: ChallengePlayer; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return <fieldset className="challenge-options">
    <legend>{st('who')}</legend>
    <button type="button" className="challenge-picker-trigger" aria-label={st('opponentPicker', { name: value.displayName })} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Avatar look={value.look} size={34} /><span>{value.displayName}</span><FaIcon name="arrow-right" />
    </button>
    {open && <PickerDialog title={st('choosePlayer')} onClose={() => setOpen(false)}>
      <PagedResultList className="challenge-opponent-list" pageSize={9} rows={players.map(player => <li key={player.id}>
        <button type="button" aria-pressed={player.id === value.id} onClick={() => { onChange(player.id); setOpen(false); }}>
          <Avatar look={player.look} size={48} /><span>{player.displayName}</span>
        </button>
      </li>)} />
    </PickerDialog>}
  </fieldset>;
}

export function ChallengeMapPicker({ value, onChange }: { value: ChallengePreset; onChange: (preset: ChallengePreset) => void }) {
  const t = useTexts(BRICK_TEXTS);
  const [open, setOpen] = useState(false);
  return <fieldset className="challenge-options">
    <legend>{t('map')}</legend>
    <button type="button" className="challenge-picker-trigger" aria-label={st('mapPicker', { name: t(value) })} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <BrickMapPreview map={BRICK_MAPS[value]} /><span>{t(value)}</span><FaIcon name="arrow-right" />
    </button>
    {open && <PickerDialog title={st('chooseMap')} onClose={() => setOpen(false)}>
      <PagedResultList className="challenge-map-list" pageSize={6} rows={BRICK_PRESETS.map(preset => <li key={preset}>
        <button type="button" aria-pressed={preset === value} onClick={() => { onChange(preset); setOpen(false); }}>
          <BrickMapPreview map={BRICK_MAPS[preset]} /><span>{t(preset)}</span>
        </button>
      </li>)} />
    </PickerDialog>}
  </fieldset>;
}
