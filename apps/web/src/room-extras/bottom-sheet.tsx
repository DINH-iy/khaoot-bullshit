import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { defineTexts, useTexts } from '../i18n/texts.js';

const TEXTS = defineTexts('phone-sheet', {
  close: 'Close', resize: 'Resize panel',
}, {
  nl: { close: 'Sluiten', resize: 'Paneelhoogte aanpassen' },
  de: { close: 'Schließen', resize: 'Panelhöhe ändern' },
  ro: { close: 'Închide', resize: 'Redimensionează panoul' },
});

export function BottomSheet({ title, onClose, children, actions, leadingAction, resizable = false, roomy = false }: {
  title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; leadingAction?: ReactNode; resizable?: boolean; roomy?: boolean;
}) {
  const t = useTexts(TEXTS);
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const drag = useRef<{ startY: number; startHeight: number; space: number; moved: boolean }>(null);
  useEffect(() => { heading.current?.focus(); }, [title]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (!event.defaultPrevented && event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);

  return <div ref={backdrop} className={roomy ? "sheet-backdrop sheet-backdrop-roomy" : "sheet-backdrop"} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}
      style={height === undefined ? undefined : { '--sheet-height': `${height}%` } as CSSProperties}>
      {resizable && <button type="button" className="sheet-grip" aria-label={t('resize')}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0 || !panel.current || !backdrop.current) return;
          const style = getComputedStyle(backdrop.current);
          const space = backdrop.current.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
          if (space <= 0) return;
          drag.current = { startY: event.clientY, startHeight: panel.current.offsetHeight, space, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const start = drag.current;
          if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const delta = start.startY - event.clientY;
          if (!start.moved && Math.abs(delta) < 5) return;
          start.moved = true;
          setHeight(Math.max(35, Math.min(100, (start.startHeight + delta) / start.space * 100)));
        }}
        onPointerCancel={() => { drag.current = null; }}
        onClick={event => {
          if (event.detail === 0 || !drag.current?.moved) setHeight(height === undefined ? 100 : undefined);
          drag.current = null;
        }}><span /></button>}
      <div className="sheet-head">
        <div className="sheet-head-title">{leadingAction}<h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2></div>
        <div className="sheet-head-actions">
          {actions}
          <button type="button" className="ghost small-button" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  </div>;
}
