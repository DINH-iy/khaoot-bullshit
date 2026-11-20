import { useEffect, useId, useRef, useState } from 'react';
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
 * With `groups`, tabs (All first) narrow the cards down when there are many.
 */
export function ChoiceDialog({ title, intro, choices, value, groups, onPick, onClose }: {
  title: string; intro?: string; choices: CardChoice[]; value?: string | undefined; groups?: ChoiceGroup[]; onPick: (value: string) => void; onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null); const id = useId();
  const grouped = new Set(groups?.flatMap(group => group.values));
  const tabs = groups ? [{ key: 'all', name: t('all'), values: choices.map(choice => choice.value) }, ...groups.filter(group => group.values.some(entry => choices.some(choice => choice.value === entry))),
    ...(choices.some(choice => !grouped.has(choice.value)) ? [{ key: 'other', name: t('other'), values: choices.filter(choice => !grouped.has(choice.value)).map(choice => choice.value) }] : [])] : [];
  const [tab, setTab] = useState('all');
  const shown = tabs.length ? choices.filter(choice => tabs.find(entry => entry.key === tab)?.values.includes(choice.value)) : choices;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (box.current?.querySelector<HTMLElement>('[aria-pressed=true]') ?? box.current?.querySelector<HTMLElement>('.choice-card'))?.focus();
    return () => previous?.focus?.();
  }, []);
  // Focus stays inside the popup while it is open.
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const items = [...box.current!.querySelectorAll<HTMLElement>('button')]; const first = items[0]!; const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={box} className="ed-dialog choice-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={onKey}>
      <h2 id={`${id}-title`}>{title}</h2>
      {intro && <p>{intro}</p>}
      {tabs.length > 2 && <div className="choice-tabs" role="tablist" aria-label={t('sorts')}>{tabs.map(entry =>
        <button key={entry.key} type="button" role="tab" aria-selected={tab === entry.key} onClick={() => setTab(entry.key)}>{entry.name}<small>{entry.values.length}</small></button>)}</div>}
      <div className="choice-cards">
        {shown.map(choice => <button key={choice.value} type="button" className="choice-card" aria-pressed={value !== undefined ? choice.value === value : undefined} onClick={() => onPick(choice.value)}>
          {choice.icon && <Icon name={choice.icon} />}<span className="choice-copy"><span className="choice-title"><strong>{choice.label}</strong>
            {choice.value === value && <span className="choice-current">{t('chosen')}</span>}</span><small>{choice.description}</small></span>
        </button>)}
      </div>
      <div className="actions"><button type="button" onClick={onClose}>{t('cancel')}</button></div>
    </div>
  </div>;
}
