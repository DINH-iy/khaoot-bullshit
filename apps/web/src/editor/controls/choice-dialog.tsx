import { useEffect, useId, useRef } from 'react';
import { Icon } from './icons.js';

export interface CardChoice { value: string; label: string; description: string; icon?: string }

/**
 * A popup with one card per choice (name and a line on what it is), for choices
 * that need more than a word: which minigame, how a duel is won, which award to
 * add. The current choice is marked; Escape, Cancel or a click outside keeps it.
 */
export function ChoiceDialog({ title, intro, choices, value, onPick, onClose }: {
  title: string; intro?: string; choices: CardChoice[]; value?: string | undefined; onPick: (value: string) => void; onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null); const id = useId();
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
      <div className="choice-cards">
        {choices.map(choice => <button key={choice.value} type="button" className="choice-card" aria-pressed={value !== undefined ? choice.value === value : undefined} onClick={() => onPick(choice.value)}>
          {choice.icon && <Icon name={choice.icon} />}<span><strong>{choice.label}</strong><small>{choice.description}</small></span>
          {choice.value === value && <span className="choice-current">Chosen</span>}
        </button>)}
      </div>
      <div className="actions"><button type="button" onClick={onClose}>Cancel</button></div>
    </div>
  </div>;
}
