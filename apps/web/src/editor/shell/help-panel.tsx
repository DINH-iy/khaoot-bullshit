import { Dropdown } from '../../ui/dropdown.js';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTexts } from '../../i18n/texts.js';
import { marked } from '../../i18n/rich.js';
import { arrangementKeys, defaultZoomShortcuts, editingActions, editingLabel, shortcutDigits, zoomKeys, type ZoomShortcuts } from '../flow/zoom-shortcuts.js';
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
const KEYS: [string | Key, Key][] = [['kArrows', 'dArrows'], ['Tab', 'dTab'], ['Esc', 'dEsc'], ['kSave', 'dSave']];
const EDIT_ACTION_TEXT = { undo: 'dUndo', redo: 'dRedo', selectAll: 'dAll', copy: 'dCopy', paste: 'dPaste', duplicate: 'dDuplicate', remove: 'dDelete', help: 'dHelp' } as const;

/**
 * Help & shortcuts: how the editor works and every key and gesture, in one place.
 * Opened from the ☰ menu, the map's Tips or the ? key. Keep it in step with the editor:
 * a new shortcut or gesture belongs here too (help.text.ts, in every language).
 */
export function HelpPanel({ onClose, zoomShortcuts, onZoomShortcuts }: { onClose: () => void; zoomShortcuts: ZoomShortcuts; onZoomShortcuts: (value: ZoomShortcuts) => void }) {
  const box = useRef<HTMLDivElement>(null); const id = useId(); const t = useTexts(HELP_TEXTS);
  const arrangements = { tidy: 'dTidy', row: 'dRow', column: 'dColumn' } as const;
  const arrangementActions = ['tidy', 'row', 'column'] as const;
  const arrangementLabel = (action: typeof arrangementActions[number], key: string) => `${action === 'tidy' ? mod : 'Alt'} + Shift + ${key}`;
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
        <table className="help-table"><tbody>{KEYS.map(([keys, what]) => <Row key={what} keys={keysOf(keys)}>{text(what)}</Row>)}
          {editingActions.map(action => <Row key={action} keys={editingLabel(action, zoomShortcuts.edits[action])}>{text(EDIT_ACTION_TEXT[action])}</Row>)}
          {arrangementActions.map(action => <Row key={action} keys={arrangementLabel(action, zoomShortcuts[action])}>{text(arrangements[action])}</Row>)}
          <Row keys={`Shift + ${zoomShortcuts.all}`}>{text('dWhole')}</Row>
          <Row keys={`Shift + ${zoomShortcuts.selection}`}>{text('dZoomSel')}</Row></tbody></table>
      </section>
      <section aria-labelledby={`${id}-binding`}><h3 id={`${id}-binding`}>{t('zoomBindings')}</h3>
        <div className="zoom-bindings">
          {(['all', 'selection'] as const).map(action => <label key={action}>{t(action === 'all' ? 'dWhole' : 'dZoomSel')}
            <Dropdown value={zoomShortcuts[action]} onChange={value => {
              const key = zoomKeys.find(option => option === value);
              if (key) onZoomShortcuts({ ...zoomShortcuts, [action]: key });
            }} options={zoomKeys.map(key => ({ value: key, label: `Shift + ${key}`, disabled: key === zoomShortcuts[action === 'all' ? 'selection' : 'all'] }))} />
          </label>)}
          {arrangementActions.map(action => <label key={action}>{t(action)}
            <Dropdown value={zoomShortcuts[action]} onChange={value => {
              const key = arrangementKeys.find(option => option === value);
              if (key) onZoomShortcuts({ ...zoomShortcuts, [action]: key });
            }} options={arrangementKeys.map(key => ({
              value: key, label: arrangementLabel(action, key),
              disabled: (action === 'row' && key === zoomShortcuts.column) || (action === 'column' && key === zoomShortcuts.row),
            }))} />
          </label>)}
          {editingActions.map(action => <label key={action}>{t(EDIT_ACTION_TEXT[action], { mod }).replaceAll('*', '')}
            <Dropdown value={zoomShortcuts.edits[action] ?? ''} onChange={value => {
              const edits = { ...zoomShortcuts.edits };
              const digit = shortcutDigits.find(option => option === value);
              if (digit) edits[action] = digit; else delete edits[action];
              onZoomShortcuts({ ...zoomShortcuts, edits });
            }} options={[
              { value: '', label: editingLabel(action) },
              ...shortcutDigits.map(digit => ({ value: digit, label: editingLabel(action, digit), disabled: editingActions.some(other => other !== action && zoomShortcuts.edits[other] === digit) })),
            ]} />
          </label>)}
          <button type="button" onClick={() => onZoomShortcuts(defaultZoomShortcuts)}>{t('resetBindings')}</button>
        </div>
      </section>
      <section aria-labelledby={`${id}-menus`}><h3 id={`${id}-menus`}>{t('menus')}</h3>
        <ul>{(['m1', 'm2', 'm3'] as const).map(key => <li key={key}>{text(key)}</li>)}</ul>
      </section>
    </div>
  </div>;
}
