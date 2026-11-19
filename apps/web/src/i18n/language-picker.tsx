import { Dropdown } from '../ui/dropdown.js';
import { chooseLanguage, isLanguage, LANGUAGES, useLanguage } from './language.js';

/** Names stay in their own language so visitors can recognize them. */
export function LanguagePicker({ label, className = '' }: { label: string; className?: string }) {
  const language = useLanguage();
  return <span className={`language-picker ${className}`}>
    <Dropdown label={label} title={label} value={language}
      options={Object.entries(LANGUAGES).map(([code, name]) => ({ value: code, label: name, lang: code }))}
      onChange={value => { if (isLanguage(value)) chooseLanguage(value); }} />
  </span>;
}
