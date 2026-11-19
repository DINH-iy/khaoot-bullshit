import { useState } from 'react';
import type { SceneTranslations } from '@party/contracts';
import { LANGUAGES, isLanguage, type Language } from '../../../i18n/language.js';
import { useTexts } from '../../../i18n/texts.js';
import { Section } from '../../controls/section.js';
import type { Stage } from '../../model.js';
import { TRANSLATION_TEXTS } from './translation.text.js';

export function TranslationLanguage({ value, onChange }: { value: Language | ''; onChange: (value: Language | '') => void }) {
  const t = useTexts(TRANSLATION_TEXTS);
  return <label>{t('language')}<select value={value} onChange={event => {
    const next = event.target.value;
    if (next === '' || isLanguage(next)) onChange(next);
  }}>
    <option value="">{t('original')}</option>
    {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
  </select></label>;
}

export function SceneTranslationFields({ stage, onChange }: { stage: Stage; onChange: (next: Stage) => void }) {
  const t = useTexts(TRANSLATION_TEXTS);
  const [language, setLanguage] = useState<Language | ''>('');
  const translations = (stage['translations'] ?? {}) as SceneTranslations;
  const current = language ? translations[language] ?? {} : {};
  const input = stage['input'] as { options?: { key: string; label: string }[]; items?: { key: string; label: string }[] } | undefined;
  const options = stage.kind === 'route' ? (stage['options'] as { key: string; label: string }[] | undefined) : input?.options ?? input?.items;
  const save = (patch: Partial<typeof current>) => {
    if (!language) return;
    const entry = Object.fromEntries(Object.entries({ ...current, ...patch }).filter(([, value]) => typeof value === 'string' ? value.trim() : value && Object.keys(value).length));
    const next = { ...translations };
    if (Object.keys(entry).length) next[language] = entry;
    else delete next[language];
    const changed = { ...stage };
    if (Object.keys(next).length) changed['translations'] = next;
    else delete changed['translations'];
    onChange(changed);
  };
  return <Section title={t('translations')} memory="scene-translations">
    <TranslationLanguage value={language} onChange={setLanguage} />
    {language && <>
      <p className="hint">{t('fallback')}</p>
      <label>{t('prompt')}<textarea value={current.prompt ?? ''} maxLength={2000} placeholder={stage.prompt} onChange={event => save({ prompt: event.target.value })} /></label>
      {stage.kind === 'info' && <label>{t('title')}<input value={current.title ?? ''} maxLength={120} placeholder={String(stage.title ?? '')} onChange={event => save({ title: event.target.value })} /></label>}
      {Boolean(stage['explain']) && <label>{t('explanation')}<textarea value={current.explanation ?? ''} maxLength={1000} placeholder={(stage['explain'] as { text?: string }).text} onChange={event => save({ explanation: event.target.value })} /></label>}
      {options?.map(option => <label key={option.key}>{option.label}<input value={Object.hasOwn(current.labels ?? {}, option.key) ? current.labels![option.key] : ''} placeholder={option.label} maxLength={240} onChange={event => {
        const labels = { ...current.labels };
        if (event.target.value.trim()) labels[option.key] = event.target.value; else delete labels[option.key];
        save({ labels });
      }} /></label>)}
    </>}
  </Section>;
}
