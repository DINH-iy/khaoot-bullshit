import { useId, useRef, type ReactNode } from 'react';
import { useTexts } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from '../room/extras.text.js';

export function LeaveRoom({ children }: { children?: ReactNode }) {
  const t = useTexts(EXTRAS_TEXTS);
  const dialog = useRef<HTMLDialogElement>(null);
  const stay = useRef<HTMLButtonElement>(null);
  const title = useId();
  const description = useId();
  return <>
    <button type="button" className="leave-room" aria-haspopup="dialog" onClick={() => { dialog.current?.showModal(); stay.current?.focus(); }}>
      {children ?? t('leaveRoom')}
    </button>
    <dialog ref={dialog} className="leave-room-confirm" role="alertdialog" aria-labelledby={title} aria-describedby={description}
      onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <h2 id={title}>{t('leaveTitle')}</h2>
      <p id={description}>{t('leaveWarning')}</p>
      <div className="actions">
        <button type="button" ref={stay} onClick={() => dialog.current?.close()}>{t('stayRoom')}</button>
        <a className="leave-room" href="/">{t('confirmLeave')}</a>
      </div>
    </dialog>
  </>;
}
