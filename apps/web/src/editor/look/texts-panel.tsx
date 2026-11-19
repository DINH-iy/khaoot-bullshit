import { useState } from 'react';
import { TEXT_DEFAULTS, TEXT_GROUPS, TEXT_KEYS, TEXT_LABELS, type TextKey } from '@party/contracts';
import { translate } from '../../i18n/texts.js';
import { LOOK_TEXTS } from './look.text.js';
import { gameName } from '../../presentation/catalog.text.js';
const t = (key: keyof typeof LOOK_TEXTS.en, values?: Record<string, string | number>) => translate(LOOK_TEXTS, key, values);
import { Section } from '../controls/section.js';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!);
const PLACEHOLDER_HELP: Record<string, keyof typeof LOOK_TEXTS.en> = { time: 'hTime', host: 'hHost', captain: 'hCaptain', team: 'hTeam', count: 'hCount', total: 'hTotal', answer: 'hAnswer', points: 'hPoints', route: 'hRoute' };
// A long text's short name (a minigame's “how to play”), in the editor's language.
const labelOf = (key: TextKey) => { const game = key.startsWith('minigame.how.') ? key.slice('minigame.how.'.length) : null; return game ? t('howToPlay', { game: gameName(game) }) : TEXT_LABELS[key]; };
const groupTitle = (prefix: string, fallback: string) => `g.${prefix}` in LOOK_TEXTS.en ? t(`g.${prefix}` as keyof typeof LOOK_TEXTS.en) : fallback;

/** Every word the players, the screen and the host see. Empty means the standard text. */
export function TextsPanel({ texts, below, onChange }: { texts: Record<string, string> | undefined; below: Record<string, string>; onChange: (texts: Record<string, string>) => void }) {
  const [search, setSearch] = useState('');
  const current = texts ?? {};
  const set = (key: TextKey, value: string) => { const next = { ...current }; if (value === '') delete next[key]; else next[key] = value; onChange(next); };
  const query = search.trim().toLowerCase();
  const matches = (key: TextKey) => !query || TEXT_DEFAULTS[key].toLowerCase().includes(query) || (labelOf(key) ?? '').toLowerCase().includes(query) || (current[key] ?? '').toLowerCase().includes(query);
  const changed = Object.keys(current).length;
  return <div className="look-panel">
    <label>{t('findText')}<input type="search" value={search} placeholder={t('findPlaceholder')} onChange={event => setSearch(event.target.value)} /></label>
    <p className="hint">{t('textsHint')}{changed ? t(changed === 1 ? 'changedOne' : 'changedMany', { count: changed }) : ''}</p>
    {/* In small named groups (closed until opened, as left last time); a search opens the groups it finds something in. */}
    {TEXT_GROUPS.map(group => {
      const keys = TEXT_KEYS.filter(key => key.startsWith(group.prefix) && matches(key)); if (!keys.length) return null;
      const own = TEXT_KEYS.filter(key => key.startsWith(group.prefix) && current[key]).length;
      return <Section key={group.prefix} title={groupTitle(group.prefix, group.title)} memory={`texts:${group.prefix}`} forceOpen={Boolean(query)}
        summary={own ? t('nChanged', { count: own }) : t('nTexts', { count: TEXT_KEYS.filter(key => key.startsWith(group.prefix)).length })}>{keys.map(key => {
        const fallback = below[key] ?? TEXT_DEFAULTS[key]; const value = current[key] ?? ''; const wanted = placeholders(TEXT_DEFAULTS[key]);
        const missing = value ? wanted.filter(name => !placeholders(value).includes(name)) : [];
        return <div key={key} className="text-field">
          {/* A long text (a minigame's “how to play”) gets a short name and a bigger box. */}
          {TEXT_LABELS[key] ? <label>{labelOf(key)}<textarea rows={3} value={value} placeholder={fallback} maxLength={400} onChange={event => set(key, event.target.value)} /></label>
            : <label>{TEXT_DEFAULTS[key]}<input value={value} placeholder={fallback} maxLength={400} onChange={event => set(key, event.target.value)} /></label>}
          {wanted.length > 0 && <p className="hint">{wanted.map(name => t('isPart', { name: `{${name}}`, meaning: PLACEHOLDER_HELP[name] ? t(PLACEHOLDER_HELP[name]!) : name })).join(', ')}.</p>}
          {missing.length > 0 && <p className="hint warn">{t(missing.length === 1 ? 'missingOne' : 'missingMany', { names: missing.map(name => `{${name}}`).join(' · ') })}</p>}
          {value && <button type="button" className="small-button" onClick={() => set(key, '')}>{t('useStandard')}</button>}
        </div>;
      })}</Section>;
    })}
  </div>;
}
