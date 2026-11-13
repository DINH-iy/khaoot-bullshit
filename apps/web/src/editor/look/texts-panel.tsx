import { useState } from 'react';
import { TEXT_DEFAULTS, TEXT_GROUPS, TEXT_KEYS, type TextKey } from '@party/contracts';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!);
const PLACEHOLDER_HELP: Record<string, string> = { time: 'the time left', host: 'the web address', captain: 'the captain’s name', team: 'the team name', count: 'a number', total: 'the number of players', answer: 'the correct answer', points: 'the points', route: 'the chosen route' };

/** Every word the players, the screen and the host see. Empty means the standard text. */
export function TextsPanel({ texts, below, onChange }: { texts: Record<string, string> | undefined; below: Record<string, string>; onChange: (texts: Record<string, string>) => void }) {
  const [search, setSearch] = useState('');
  const current = texts ?? {};
  const set = (key: TextKey, value: string) => { const next = { ...current }; if (value === '') delete next[key]; else next[key] = value; onChange(next); };
  const query = search.trim().toLowerCase();
  const matches = (key: TextKey) => !query || TEXT_DEFAULTS[key].toLowerCase().includes(query) || (current[key] ?? '').toLowerCase().includes(query);
  const changed = Object.keys(current).length;
  return <div className="look-panel">
    <label>Find a text<input type="search" value={search} placeholder="For example: answer is in" onChange={event => setSearch(event.target.value)} /></label>
    <p className="hint">Type your own words in any box. Leave it empty for the standard text, shown in grey. Words in curly brackets, such as {'{time}'}, are filled in during the game.{changed ? ` ${changed} ${changed === 1 ? 'text is' : 'texts are'} changed here.` : ''}</p>
    {TEXT_GROUPS.map(group => {
      const keys = TEXT_KEYS.filter(key => key.startsWith(group.prefix) && matches(key)); if (!keys.length) return null;
      return <fieldset key={group.prefix}><legend>{group.title}</legend>{keys.map(key => {
        const fallback = below[key] ?? TEXT_DEFAULTS[key]; const value = current[key] ?? ''; const wanted = placeholders(TEXT_DEFAULTS[key]);
        const missing = value ? wanted.filter(name => !placeholders(value).includes(name)) : [];
        return <div key={key} className="text-field">
          <label>{TEXT_DEFAULTS[key]}<input value={value} placeholder={fallback} maxLength={400} onChange={event => set(key, event.target.value)} /></label>
          {wanted.length > 0 && <p className="hint">{wanted.map(name => `{${name}} is ${PLACEHOLDER_HELP[name] ?? name}`).join(', ')}.</p>}
          {missing.length > 0 && <p className="hint warn">{missing.map(name => `{${name}}`).join(' and ')} {missing.length === 1 ? 'is' : 'are'} not in your text, so it will not be shown.</p>}
          {value && <button className="link-button" onClick={() => set(key, '')}>Use the standard text</button>}
        </div>;
      })}</fieldset>;
    })}
  </div>;
}
