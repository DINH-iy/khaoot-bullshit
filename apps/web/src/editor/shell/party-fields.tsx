import { useState } from 'react';
import { BUILTIN_SOUNDS, DEFAULT_SOUNDBOARD, MAX_OWN_REACTIONS, MAX_SOUNDS, OwnReactionSchema, sceneMediaUrl, type OwnReaction, type Sound } from '@party/contracts';
import { Section } from '../controls/section.js';
import { Icon } from '../controls/icons.js';
import type { Definition } from '../model.js';
import { useTexts } from '../../i18n/texts.js';
import { Dropdown } from '../../ui/dropdown.js';
import { MediaLibraryDialog } from '../scene/fields/media-field.js';
import { OwnReactionView } from '../../room-extras/reactions.js';
import { playSound } from '../../room-extras/sounds.js';
import { SOUND_TEXTS } from '../../room-extras/sounds.text.js';
import { PARTY_FIELDS_TEXTS } from './party-fields.text.js';

/**
 * Game settings → Reactions & sounds: the game's own reactions (`ownReactions`) and its soundboard (`soundboard`;
 * left out, the standard four built-in sounds). Both are stored only when set.
 */
export function PartyFields({ definition, onChange }: { definition: Definition; onChange: (next: Definition, group?: string) => void }) {
  const t = useTexts(PARTY_FIELDS_TEXTS); const s = useTexts(SOUND_TEXTS);
  const reactions = (definition['ownReactions'] as OwnReaction[] | undefined) ?? [];
  const sounds = (definition['soundboard'] as Sound[] | undefined) ?? DEFAULT_SOUNDBOARD;
  const [text, setText] = useState(''); const [picking, setPicking] = useState<'picture' | 'sound' | null>(null);
  const store = (key: 'ownReactions' | 'soundboard', value: unknown[] | undefined) => { const copy = { ...definition }; if (value) copy[key] = value; else delete copy[key]; onChange(copy, key); };
  const setReactions = (next: OwnReaction[]) => store('ownReactions', next.length ? next : undefined);
  const setSounds = (next: Sound[]) => store('soundboard', JSON.stringify(next) === JSON.stringify(DEFAULT_SOUNDBOARD) ? undefined : next);
  // Text without letters (😀, 🎉🔥) is an emoji; with letters a short text, shown as a sticker.
  const addText = () => { const value = text.trim(); const reaction = OwnReactionSchema.safeParse({ kind: /\p{L}/u.test(value) ? 'text' : 'emoji', text: value });
    if (reaction.success && reactions.length < MAX_OWN_REACTIONS) { setReactions([...reactions, reaction.data]); setText(''); } };
  const nameOf = (sound: Sound) => sound.kind === 'builtin' ? s(sound.name) : sound.label;
  const unused = BUILTIN_SOUNDS.filter(name => !sounds.some(sound => sound.kind === 'builtin' && sound.name === name));
  return <Section title={t('title')} memory="Reactions & sounds" summary={t('summary', { reactions: reactions.length, sounds: sounds.length })}>
    <p className="field-title">{t('reactions')}</p>
    <p className="hint">{t('reactionsHint')}</p>
    {reactions.length > 0 && <ul className="party-reactions">{reactions.map((reaction, index) => { const name = reaction.kind === 'picture' ? t('picture', { number: index + 1 }) : reaction.text;
      return <li key={index}><span className={`party-reaction own-${reaction.kind}`}><OwnReactionView reaction={reaction} /></span>
        <button type="button" className="icon-only danger-icon" aria-label={t('remove', { name })} onClick={() => setReactions(reactions.filter((_, at) => at !== index))}><Icon name="trash" size={14} /></button></li>; })}</ul>}
    {reactions.length < MAX_OWN_REACTIONS ? <div className="party-add">
      <input value={text} maxLength={16} aria-label={t('newReaction')} placeholder={t('newReaction')} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addText(); } }} />
      <button type="button" className="small-button with-icon" disabled={!text.trim()} onClick={addText}><Icon name="plus" size={16} />{t('add')}</button>
      <button type="button" className="small-button" onClick={() => setPicking('picture')}>{t('addPicture')}</button>
    </div> : <p className="hint">{t('full', { count: MAX_OWN_REACTIONS })}</p>}

    <p className="field-title">{t('sounds')}</p>
    <p className="hint">{t('soundsHint')}</p>
    <ol className="music-list">{sounds.map((sound, index) => <li key={`${index}-${nameOf(sound)}`}>
      <span className="music-name">{nameOf(sound)}</span>
      {sound.kind === 'media' ? <audio src={sceneMediaUrl(sound.id)} controls preload="none" aria-label={t('listen', { name: nameOf(sound) })} />
        : <button type="button" className="icon-only" aria-label={t('listen', { name: nameOf(sound) })} onClick={() => playSound(sound)}><Icon name="play" size={14} /></button>}
      <button type="button" className="icon-only danger-icon" aria-label={t('remove', { name: nameOf(sound) })} onClick={() => setSounds(sounds.filter((_, at) => at !== index))}><Icon name="trash" size={14} /></button>
    </li>)}</ol>
    <div className="actions">
      {unused.length > 0 && sounds.length < MAX_SOUNDS && <Dropdown value="" placeholder={t('addBuiltin')} label={t('addBuiltin')} options={unused.map(name => ({ value: name, label: s(name) }))}
        onChange={name => setSounds([...sounds, { kind: 'builtin', name: name as Sound & { kind: 'builtin' } extends { name: infer N } ? N : never }])} />}
      <button type="button" className="small-button with-icon" disabled={sounds.length >= MAX_SOUNDS} onClick={() => setPicking('sound')}><Icon name="plus" size={16} />{t('addSong')}</button>
      {definition['soundboard'] !== undefined && <button type="button" className="small-button" onClick={() => setSounds(DEFAULT_SOUNDBOARD)}>{t('standard')}</button>}
    </div>
    {picking && <MediaLibraryDialog current={undefined} only={picking === 'picture' ? 'image' : 'audio'} title={picking === 'picture' ? t('addPicture') : t('addSong')}
      onPick={item => { if (picking === 'picture') setReactions([...reactions, { kind: 'picture', id: item.id }]); else setSounds([...sounds, { kind: 'media', id: item.id, label: item.name.slice(0, 24).trim() || 'Sound' }]); setPicking(null); }}
      onClose={() => setPicking(null)} />}
  </Section>;
}
