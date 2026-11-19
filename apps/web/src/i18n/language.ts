import { useSyncExternalStore } from 'react';

/**
 * The language of the app's own screens: the host menu, the host's room controls, the editor and the admin pages.
 * Chosen per browser, starting from the browser's own language. Rooms use this choice for built-in text
 * and any translations the game's author supplies.
 */
export const LANGUAGES = { en: 'English', nl: 'Nederlands', de: 'Deutsch', ro: 'Română' } as const;
export type Language = keyof typeof LANGUAGES;
export const isLanguage = (value: unknown): value is Language => typeof value === 'string' && Object.hasOwn(LANGUAGES, value);
const KEY = 'party_ui_language';

function fromBrowser(): Language {
  const wanted = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language];
  for (const tag of wanted) { const base = tag?.toLowerCase().split('-')[0]; if (isLanguage(base)) return base; }
  return 'en';
}
function read(): Language {
  try { const saved = localStorage.getItem(KEY); if (isLanguage(saved)) return saved; } catch { /* storage off: the browser's language */ }
  return fromBrowser();
}
let current: Language = typeof window === 'undefined' ? 'en' : read();
const listeners = new Set<() => void>();
const apply = () => { if (typeof document !== 'undefined') document.documentElement.lang = current; };
apply();

export const currentLanguage = () => current;
/** Switches every open screen of this browser tab at once, and remembers the choice in this browser. */
export function chooseLanguage(language: Language) {
  current = language; apply();
  try { localStorage.setItem(KEY, language); } catch { /* still switched for this visit */ }
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** The current language; the component redraws when it changes. */
export const useLanguage = () => useSyncExternalStore(subscribe, currentLanguage, () => 'en' as Language);
