import { useId } from 'react';
import { InfoTip } from './info-tip.js';

/**
 * One setting with a few choices, shown as buttons (the pressed one is the current
 * choice) instead of a dropdown that hides them. Short labels sit side by side;
 * `stacked` puts longer ones in a short list, one per row, like radio buttons. A
 * choice's hint is behind an ⓘ next to it (and read out with the choice).
 */
export interface Choice<T extends string> { value: T; label: string; hint?: string }
export function Segmented<T extends string>({ label, value, choices, onChange, stacked = false, inline = false }: {
  label: string; value: T; choices: readonly Choice<T>[]; onChange: (value: T) => void; stacked?: boolean; inline?: boolean;
}) {
  const id = useId();
  return <div className={`ed-choice${inline ? ' inline' : ''}`}>
    <p className="field-title" aria-hidden="true">{label}</p>
    <div className={`segmented${stacked ? ' stacked' : ''}`} role="group" aria-label={label}>
      {choices.map((choice, index) => {
        const button = <button key={choice.value} type="button" aria-pressed={value === choice.value} aria-describedby={choice.hint ? `${id}-${index}` : undefined} onClick={() => { if (value !== choice.value) onChange(choice.value); }}>
          {stacked && <span className="seg-radio" aria-hidden="true" />}{choice.label}</button>;
        return stacked ? <div key={choice.value} className="seg-row">{button}
          {choice.hint && <InfoTip label={`About “${choice.label}”`}>{choice.hint}</InfoTip>}</div> : button;
      })}
    </div>
    {choices.map((choice, index) => choice.hint && <span key={choice.value} id={`${id}-${index}`} hidden>{choice.hint}</span>)}
  </div>;
}
