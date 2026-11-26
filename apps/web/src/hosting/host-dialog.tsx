import { useEffect, useRef, type ReactNode } from 'react';
import { useTexts } from '../i18n/texts.js';
import { Icon } from '../editor/controls/icons.js';
import { HOSTING_TEXTS } from './hosting.text.js';

/** A modal dialog on the host menu (New game, Import): a title, a close button, and its content. Escape or a click outside closes it. */
export function HostDialog({ id, title, wide = false, onClose, children }: { id: string; title: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null); const t = useTexts(HOSTING_TEXTS);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={`host-dialog${wide ? ' wide' : ''}`} aria-labelledby={id}
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="host-dialog-head"><h2 id={id}>{title}</h2>
      <button type="button" className="host-dialog-close" aria-label={t('closeDialog')} onClick={onClose}><Icon name="close" size={20} /></button></div>
    <div className="host-dialog-body">{children}</div>
  </dialog>;
}
