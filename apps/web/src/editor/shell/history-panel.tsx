import { useCornerPanel } from './corner-panels.js';
import { Icon } from '../controls/icons.js';
import { useTexts } from '../../i18n/texts.js';
import { SHELL_TEXTS } from './shell.text.js';

const KEY = 'party.editor.historyOpen';
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

interface Entry { label: string; at: number }

/**
 * Your edits in this visit, newest on top (undone ones above "Now", greyed): click one to go back to just
 * after it, or forward again to it; "When you opened the game" undoes everything. The same as pressing
 * Undo or Redo that many times, so other people's changes stay. Folded, it is a small "History" button.
 */
export function HistoryPanel({ steps, disabled, onRestore }: { steps: { undo: Entry[]; redo: Entry[] }; disabled: boolean; onRestore: (kind: 'undo' | 'redo', count: number) => void }) {
  const [open, setOpen] = useCornerPanel('history', KEY); const t = useTexts(SHELL_TEXTS);
  const toggle = () => setOpen(!open);
  const { undo, redo } = steps; const total = undo.length + redo.length;
  const row = (entry: Entry, kind: 'undo' | 'redo', count: number, undone: boolean) => <li key={`${kind}-${count}`} className={undone ? 'undone' : undefined}>
    <button type="button" disabled={disabled || count === 0} onClick={() => onRestore(kind, count)} title={t(count === 0 ? 'youAreHere' : undone ? 'redoToHere' : 'undoToHere')}>
      <span>{entry.label}</span><time>{clock.format(entry.at)}</time></button></li>;
  return <section className={`history-panel${open ? ' open' : ''}`} aria-label={t('history')}>
    <button type="button" className="history-toggle" title={t('history')} aria-expanded={open} onClick={toggle}>
      <Icon name="history" size={18} /><span className="corner-label">{t('history')}</span>{total ? <> <span className="history-count">{undo.length}</span></> : null}<span className="problems-caret" aria-hidden="true">{open ? '▾' : '▴'}</span></button>
    {open && <div className="history-list">
      {!total && <p className="history-empty">{t('historyEmpty')}</p>}
      {total > 0 && <ol>
        {/* Gone back by accident? One click redoes everything up to the latest edit. */}
        {redo.length > 0 && <li className="history-latest"><button type="button" disabled={disabled} onClick={() => onRestore('redo', redo.length)} title={t('redoAll')}><span><Icon name="redo" size={16} /> {t('backToLatest')}</span></button></li>}
        {/* Undone steps, the furthest first: clicking one redoes up to it. */}
        {redo.map((entry, index) => row(entry, 'redo', redo.length - index, true))}
        <li className="history-now" aria-label={t('now')}>{t('now')}</li>
        {/* Done steps, newest first: clicking one undoes back to just after it. */}
        {[...undo].reverse().map((entry, index) => row(entry, 'undo', index, false))}
        <li><button type="button" disabled={disabled || !undo.length} onClick={() => onRestore('undo', undo.length)} title={t('undoAll')}><span>{t('whenOpened')}</span></button></li>
      </ol>}
    </div>}
  </section>;
}
