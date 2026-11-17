/**
 * One setting with a few choices, shown as buttons (the pressed one is the current
 * choice) instead of a dropdown that hides them. Short labels sit side by side;
 * `stacked` puts longer ones in a short list, one per row, with an optional hint.
 */
export interface Choice<T extends string> { value: T; label: string; hint?: string }
export function Segmented<T extends string>({ label, value, choices, onChange, stacked = false, inline = false }: {
  label: string; value: T; choices: readonly Choice<T>[]; onChange: (value: T) => void; stacked?: boolean; inline?: boolean;
}) {
  return <div className={`ed-choice${inline ? ' inline' : ''}`}>
    <p className="field-title" aria-hidden="true">{label}</p>
    <div className={`segmented${stacked ? ' stacked' : ''}`} role="group" aria-label={label}>
      {choices.map(choice => <button key={choice.value} type="button" aria-pressed={value === choice.value} onClick={() => { if (value !== choice.value) onChange(choice.value); }}>
        {choice.hint ? <><strong>{choice.label}</strong><small>{choice.hint}</small></> : choice.label}
      </button>)}
    </div>
  </div>;
}
