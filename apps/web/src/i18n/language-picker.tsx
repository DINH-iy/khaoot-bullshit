import { useId } from 'react';
import { chooseLanguage, isLanguage, LANGUAGES, useLanguage } from './language.js';

/**
 * The language of the host, editor and admin screens, remembered in this browser. Each language is named in itself
 * (Nederlands, Deutsch…), so anyone finds their own. `label` is the visible word "Language" in the current language.
 */
export function LanguagePicker({ label, className = '' }: { label: string; className?: string }) {
  const language = useLanguage(); const id = useId();
  return <span className={`language-picker ${className}`}>
    <label htmlFor={id} className="visually-hidden">{label}</label>
    <select id={id} value={language} title={label} onChange={event => { if (isLanguage(event.target.value)) chooseLanguage(event.target.value); }}>
      {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
    </select>
  </span>;
}
