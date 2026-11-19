import { useCallback } from 'react';
import { currentLanguage, useLanguage, type Language } from './language.js';

/**
 * The words of one screen in every language. English is the source; the other languages must have every one of its
 * keys (the build fails otherwise), and a test checks they keep the same `{placeholders}`. Each feature keeps its
 * own texts next to its code (`*.text.ts`), so no single giant file grows.
 */
export type Texts<K extends string> = { [L in Language]: Record<K, string> };
const registry: { name: string; texts: Texts<string> }[] = [];
export function defineTexts<const T extends Record<string, string>>(name: string, en: T, others: Record<Exclude<Language, 'en'>, Record<keyof T, string>>): Texts<Extract<keyof T, string>> {
  const texts = { en, ...others } as Texts<Extract<keyof T, string>>;
  registry.push({ name, texts: texts as Texts<string> });
  return texts;
}
/** Every set of texts made so far (for the completeness test). */
export const allTexts = () => registry;

const fill = (text: string, values?: Record<string, string | number>) => values ? text.replace(/\{(\w+)\}/g, (whole, name: string) => name in values ? String(values[name]) : whole) : text;
export type Translate<K extends string> = (key: K, values?: Record<string, string | number>) => string;
/** Outside React (or once): the text in the current language, with `{placeholders}` filled in. */
export function translate<K extends string>(texts: Texts<K>, key: K, values?: Record<string, string | number>, language: Language = currentLanguage()): string {
  return fill(texts[language][key] ?? texts.en[key], values);
}
/** In a component: `const t = useTexts(TEXTS); t('start')`. Redraws when the language changes. */
export function useTexts<K extends string>(texts: Texts<K>): Translate<K> {
  const language = useLanguage();
  return useCallback((key: K, values?: Record<string, string | number>) => translate(texts, key, values, language), [texts, language]);
}
