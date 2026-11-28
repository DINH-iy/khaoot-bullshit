export function NumberSetting({ value, min, max, placeholder, label, onChange }: {
  value: number | undefined; min: number; max: number; placeholder: string; label?: string; onChange: (value: number | undefined) => void;
}) {
  return <input key={value} type="number" min={min} max={max} step={1} defaultValue={value} placeholder={placeholder} aria-label={label}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    onBlur={event => {
      const field = event.currentTarget;
      if (!field.validity.valid) field.value = value === undefined ? '' : String(value);
      else if (field.value) onChange(field.valueAsNumber);
      else onChange(undefined);
    }} />;
}
