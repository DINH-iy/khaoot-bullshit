import { useEffect, useRef } from 'react';

/**
 * A small confirmation in the middle of the editor, for a key press that would
 * remove something. Enter confirms (the confirm button has focus), Escape or a
 * click outside keeps everything.
 */
export function ConfirmDialog({ title, text, confirm, onConfirm, onCancel }: { title: string; text: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; button.current?.focus(); return () => previous?.focus?.(); }, []);
  return <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="ed-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ed-dialog-title" aria-describedby="ed-dialog-text"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } if (event.key === 'Tab') { event.preventDefault(); (document.activeElement === button.current ? event.currentTarget.querySelector<HTMLButtonElement>('.ed-dialog-keep') : button.current)?.focus(); } }}>
      <h2 id="ed-dialog-title">{title}</h2>
      <p id="ed-dialog-text">{text}</p>
      <div className="actions"><button type="button" className="ed-dialog-keep" onClick={onCancel}>Keep</button><button type="button" ref={button} className="danger" onClick={onConfirm}>{confirm}</button></div>
    </div>
  </div>;
}
