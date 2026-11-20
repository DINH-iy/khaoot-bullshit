export function SettingToggle({ label, checked, onChange, disabled, hint }: {
  label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; hint?: string;
}) {
  return <label className="room-toggle">
    <span className="room-toggle-copy"><span>{label}</span>{hint && <small>{hint}</small>}</span>
    <input className="room-toggle-track" type="checkbox" role="switch" aria-label={label} aria-checked={checked} checked={checked} disabled={disabled}
      onChange={event => onChange(event.currentTarget.checked)} />
  </label>;
}
