import { useId, useLayoutEffect, useRef, useState } from 'react';
import { translate } from '../../i18n/texts.js';
import { CONTROLS_TEXTS } from './controls.text.js';
const t = (key: keyof typeof CONTROLS_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROLS_TEXTS, key, values);
import { Icon } from './icons.js';

export interface CardChoice { value: string; label: string; description: string; icon?: string }
/** A tab of choices in the popup; choices in no group are under "Other". */
export interface ChoiceGroup { key: string; name: string; values: readonly string[] }

/**
 * A popup with one card per choice (name and a line on what it is), for choices
 * that need more than a word: which minigame, how a duel is won, which award to
 * add. The current choice is marked; Escape, Cancel or a click outside keeps it.
 * With `groups`, category filters narrow the cards. Pages fit the available card area.
 */
export function ChoiceDialog({ title, intro, choices, value, groups, onPick, onClose }: {
  title: string; intro?: string; choices: CardChoice[]; value?: string | undefined; groups?: ChoiceGroup[]; onPick: (value: string) => void; onClose: () => void;
}) {
  const box = useRef<HTMLDialogElement>(null);
  const cards = useRef<HTMLDivElement>(null);
  const id = useId();
  const grouped = new Set(groups?.flatMap(group => group.values));
  const tabs = groups ? [{ key: 'all', name: t('all'), values: choices.map(choice => choice.value) }, ...groups.filter(group => group.values.some(entry => choices.some(choice => choice.value === entry))),
    ...(choices.some(choice => !grouped.has(choice.value)) ? [{ key: 'other', name: t('other'), values: choices.filter(choice => !grouped.has(choice.value)).map(choice => choice.value) }] : [])] : [];
  const [tab, setTab] = useState('all');
  const shown = tabs.length ? choices.filter(choice => tabs.find(entry => entry.key === tab)?.values.includes(choice.value)) : choices;
  const [pageSize, setPageSize] = useState(0);
  const [offset, setOffset] = useState(0);
  const lastPage = Math.max(0, Math.ceil(shown.length / (pageSize || 1)) - 1);
  const page = Math.min(Math.floor(offset / (pageSize || 1)), lastPage);
  const pageCards = shown.slice(page * pageSize, (page + 1) * pageSize);
  useLayoutEffect(() => {
    const dialog = box.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  useLayoutEffect(() => {
    const area = cards.current!;
    const measure = () => {
      const columns = Number(getComputedStyle(area).getPropertyValue('--choice-columns'));
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      // Leave room for a wrapped title, description and selection badge in each row.
      const rows = Math.max(1, Math.floor(area.clientHeight / (7 * rem)));
      setPageSize(columns * rows);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const items = [...box.current!.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <dialog ref={box} className="ed-dialog choice-dialog" aria-labelledby={`${id}-title`} onKeyDown={onKey}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className="choice-header">
      <h2 id={`${id}-title`}>{title}</h2>
      {intro && <p>{intro}</p>}
      {tabs.length > 2 && <div className="choice-tabs" role="group" aria-label={t('sorts')}>{tabs.map(entry =>
        <button key={entry.key} type="button" aria-pressed={tab === entry.key} onClick={() => { setTab(entry.key); setOffset(0); }}>{entry.name}</button>)}</div>}
    </header>
    <div ref={cards} className="choice-cards">
      {pageCards.map(choice => <button key={choice.value} type="button" className="choice-card" aria-pressed={value !== undefined ? choice.value === value : undefined} onClick={() => onPick(choice.value)}>
        {choice.icon && <Icon name={choice.icon} />}<span className="choice-copy"><span className="choice-title"><strong>{choice.label}</strong>
          {choice.value === value && <span className="choice-current">{t('chosen')}</span>}</span><small>{choice.description}</small></span>
      </button>)}
    </div>
    <footer className="choice-footer">
      <button type="button" autoFocus onClick={onClose}>{t('cancel')}</button>
      {lastPage > 0 && <div className="choice-pager">
        <button type="button" aria-disabled={page === 0} onClick={() => { if (page > 0) setOffset((page - 1) * pageSize); }}>{t('previousPage')}</button>
        <span role="status">{t('pageCount', { page: page + 1, total: lastPage + 1 })}</span>
        <button type="button" aria-disabled={page === lastPage} onClick={() => { if (page < lastPage) setOffset((page + 1) * pageSize); }}>{t('nextPage')}</button>
      </div>}
    </footer>
  </dialog>;
}
