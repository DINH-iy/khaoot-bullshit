import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FLOW_GROUP_COLOURS, FLOW_GROUP_NAME_MAX, type FlowGroupColour } from '@party/contracts';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { CONTROLS_TEXTS } from '../controls/controls.text.js';
import { Icon } from '../controls/icons.js';
import { ColorPicker } from '../../ui/color-picker.js';
import { FLOW_TEXTS } from './flow.text.js';

const COLOURS = defineTexts('flow group colours', {
  default: 'Default', red: 'Red', orange: 'Orange', amber: 'Amber', green: 'Green',
  custom: 'Custom', apply: 'Apply custom colour',
  teal: 'Teal', blue: 'Blue', violet: 'Violet', pink: 'Pink',
}, {
  nl: { default: 'Standaard', red: 'Rood', orange: 'Oranje', amber: 'Amber', green: 'Groen', teal: 'Turkoois', blue: 'Blauw', violet: 'Violet', pink: 'Roze', custom: 'Aangepast', apply: 'Aangepaste kleur toepassen' },
  de: { default: 'Standard', red: 'Rot', orange: 'Orange', amber: 'Bernstein', green: 'Grün', teal: 'Türkis', blue: 'Blau', violet: 'Violett', pink: 'Rosa', custom: 'Benutzerdefiniert', apply: 'Eigene Farbe übernehmen' },
  ro: { default: 'Implicită', red: 'Roșu', orange: 'Portocaliu', amber: 'Chihlimbar', green: 'Verde', teal: 'Turcoaz', blue: 'Albastru', violet: 'Violet', pink: 'Roz', custom: 'Personalizată', apply: 'Aplică culoarea personalizată' },
});

function GroupDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="ed-dialog group-edit-dialog" aria-labelledby={id}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <h2 id={id}>{title}</h2>
    {children}
  </dialog>;
}

export function RenameGroupDialog({ name, fallback, onClose, onSave }: {
  name: string | undefined; fallback: string; onClose: () => void; onSave: (name: string) => void;
}) {
  const t = useTexts(FLOW_TEXTS);
  const controls = useTexts(CONTROLS_TEXTS);
  const [value, setValue] = useState(name ?? '');
  return <GroupDialog title={t('renameGroup')} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onSave(value.trim()); }}>
      <label>{t('groupNameField')}<input autoFocus onFocus={event => event.currentTarget.select()} value={value} placeholder={fallback}
        maxLength={FLOW_GROUP_NAME_MAX} onChange={event => setValue(event.currentTarget.value)} /></label>
      <p className="hint">{t('groupNameHint')}</p>
      <div className="actions">
        <button type="button" onClick={onClose}>{controls('cancel')}</button>
        <button className="primary" type="submit">{t('saveGroupName')}</button>
      </div>
    </form>
  </GroupDialog>;
}

export function GroupColourDialog({ colour, onClose, onSelect }: {
  colour: FlowGroupColour | undefined; onClose: () => void; onSelect: (colour: FlowGroupColour | undefined) => void;
}) {
  const t = useTexts(FLOW_TEXTS);
  const label = useTexts(COLOURS);
  const controls = useTexts(CONTROLS_TEXTS);
  const [custom, setCustom] = useState(() => colour?.startsWith('#') ? colour : '#6d4fe0');
  return <GroupDialog title={t('groupColour')} onClose={onClose}>
    <div className="flow-group-colours">
      {(['default', ...FLOW_GROUP_COLOURS] as const).map(choice => {
        const value = choice === 'default' ? undefined : choice;
        return <button type="button" key={choice} data-group-colour={value} aria-pressed={value === colour} onClick={() => onSelect(value)}>
          <span className="flow-group-swatch" aria-hidden="true">{value === colour && <Icon name="check" size={14} />}</span>{label(choice)}
        </button>;
      })}
    </div>
    <div className="flow-group-custom-colour">
      <ColorPicker value={custom} onChange={setCustom} label={label('custom')} opaque>{label('custom')}</ColorPicker>
      <button type="button" className="primary" disabled={custom === colour} onClick={() => onSelect(custom)}>{label('apply')}</button>
    </div>
    <div className="actions"><button type="button" onClick={onClose}>{controls('cancel')}</button></div>
  </GroupDialog>;
}
