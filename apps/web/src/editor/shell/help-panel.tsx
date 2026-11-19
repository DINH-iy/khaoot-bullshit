import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTexts } from '../../i18n/texts.js';
import { marked } from '../../i18n/rich.js';
import { HELP_TEXTS } from './help.text.js';

// ⌘ on a Mac, Ctrl elsewhere: the key the shortcuts are written with.
const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
const Keys = ({ keys }: { keys: string }) => <span className="help-keys">{keys.split(' + ').map((key, index) => <span key={index}>{index > 0 && ' + '}<kbd>{key}</kbd></span>)}</span>;
const Row = ({ keys, children }: { keys: string; children: ReactNode }) => <tr><th scope="row"><Keys keys={keys} /></th><td>{children}</td></tr>;
type Key = keyof typeof HELP_TEXTS.en;
// The map's gestures (their names are translated) and the keyboard shortcuts (key combinations stay as on the keyboard,
// except named keys such as Delete and the arrow keys). Each row: what to press, what it does.
const MAP: [Key | '+', Key][] = [['kScroll', 'dScroll'], ['kShiftScroll', 'dShiftScroll'], ['kClick', 'dClick'], ['kShiftClick', 'dShiftClick'], ['kShiftDrag', 'dShiftDrag'], ['kDrag', 'dDrag'],
  ['kDouble', 'dDouble'], ['kDragPort', 'dDragPort'], ['+', 'dPlus'], ['kRight', 'dRight'], ['kArrow', 'dArrow'], ['kBend', 'dBend'], ['kBendPoint', 'dBendPoint']];
const KEYS: [string | Key, Key][] = [[`${mod} + Z`, 'dUndo'], [`${mod} + Shift + Z`, 'dRedo'], [`${mod} + A`, 'dAll'], [`${mod} + C`, 'dCopy'], [`${mod} + V`, 'dPaste'], [`${mod} + D`, 'dDuplicate'],
  ['kDelete', 'dDelete'], ['kArrows', 'dArrows'], [`${mod} + Shift + L`, 'dTidy'], ['Alt + Shift + H', 'dRow'], ['Alt + Shift + V', 'dColumn'], ['Shift + 1', 'dWhole'], ['Shift + 2', 'dZoomSel'],
  ['Tab', 'dTab'], ['Esc', 'dEsc'], ['?', 'dHelp']];

/**
 * Help & shortcuts: how the editor works and every key and gesture, in one place.
 * Opened from the ☰ menu, the map's Tips or the ? key. Keep it in step with the editor:
 * a new shortcut or gesture belongs here too (help.text.ts, in every language).
 */
export function HelpPanel({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null); const id = useId(); const t = useTexts(HELP_TEXTS);
  const text = (key: Key) => marked(t(key, { mod }));
  const keysOf = (keys: string) => keys in HELP_TEXTS.en ? t(keys as Key, { mod }) : keys;
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; box.current?.querySelector<HTMLElement>('h2')?.focus(); return () => previous?.focus?.(); }, []);
  return <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={box} className="ed-dialog help-panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <div className="help-head"><h2 id={`${id}-title`} tabIndex={-1}>{t('title')}</h2><button type="button" onClick={onClose}>{t('close')}</button></div>
      <section aria-labelledby={`${id}-around`}><h3 id={`${id}-around`}>{t('around')}</h3>
        <ul>{(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] as const).map(key => <li key={key}>{text(key)}</li>)}</ul>
      </section>
      <section aria-labelledby={`${id}-map`}><h3 id={`${id}-map`}>{t('map')}</h3>
        <table className="help-table"><tbody>{MAP.map(([keys, what]) => <Row key={what} keys={keys === '+' ? '+' : keysOf(keys)}>{text(what)}</Row>)}</tbody></table>
      </section>
      <section aria-labelledby={`${id}-keys`}><h3 id={`${id}-keys`}>{t('keys')}</h3>
        <table className="help-table"><tbody>{KEYS.map(([keys, what]) => <Row key={what} keys={keysOf(keys)}>{text(what)}</Row>)}</tbody></table>
      </section>
      <section aria-labelledby={`${id}-menus`}><h3 id={`${id}-menus`}>{t('menus')}</h3>
        <ul>{(['m1', 'm2', 'm3'] as const).map(key => <li key={key}>{text(key)}</li>)}</ul>
      </section>
    </div>
  </div>;
}
