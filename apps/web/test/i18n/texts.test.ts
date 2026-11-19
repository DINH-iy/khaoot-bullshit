import { describe, expect, it } from 'vitest';
import { allTexts, translate } from '../../src/i18n/texts.js';
import { LANGUAGES, type Language } from '../../src/i18n/language.js';

// Every screen's texts (*.text.ts), loaded the way the app loads them.
const modules = import.meta.glob('../../src/**/*.text.ts', { eager: true });
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

describe('the app’s own screens in every language', () => {
  it('finds the texts of the translated screens', () => {
    expect(Object.keys(modules).length).toBeGreaterThanOrEqual(3);
    expect(allTexts().map(entry => entry.name)).toEqual(expect.arrayContaining(['owner', 'hosting', 'host']));
  });
  it('has every text in every language, none empty, with the same {placeholders} as the English', () => {
    const problems: string[] = [];
    for (const { name, texts } of allTexts()) for (const [key, english] of Object.entries(texts.en)) for (const language of Object.keys(LANGUAGES) as Language[]) {
      const text = texts[language][key];
      if (!text?.trim()) problems.push(`${name}.${key} is missing in ${language}`);
      else if (JSON.stringify(placeholders(text)) !== JSON.stringify(placeholders(english))) problems.push(`${name}.${key} in ${language} has {${placeholders(text)}} instead of {${placeholders(english)}}`);
    }
    expect(problems).toEqual([]);
  });
  it('fills in placeholders and leaves names it was not given for rich text', () => {
    const texts = allTexts().find(entry => entry.name === 'hosting')!.texts;
    expect(translate(texts, 'playerMany', { count: 3 }, 'nl')).toBe('3 spelers');
    expect(translate(texts, 'step1', {}, 'de')).toContain('{copy}');
  });
});
