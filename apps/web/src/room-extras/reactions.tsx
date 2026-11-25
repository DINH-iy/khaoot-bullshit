import { useEffect, useState, useSyncExternalStore } from 'react';
import { REACTIONS, type OwnReaction, type RoomSnapshot, type Sound } from '@party/contracts';
import { FaIcon } from '../presentation/icons.js';
import { useTexts } from '../i18n/texts.js';
import { SOUND_TEXTS } from './sounds.text.js';
import { useText } from '../presentation/look.js';
import { Avatar } from '../players/avatar.js';
import { translate } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from '../room/extras.text.js';
const x = (key: keyof typeof EXTRAS_TEXTS.en, values?: Record<string, string | number>) => translate(EXTRAS_TEXTS, key, values);
import './room-extras.css';

type Reaction = { id: number; playerId: string; at: number; value: string; kind: 'emoji' | 'sticker' | 'message' | 'own' };
/** The latest reactions for the shared screen, outside React state so a burst does not redraw the whole room. */
export function createReactionStore() {
  let items: Reaction[] = []; const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    add(input: unknown) {
      const message = input as { id?: unknown; playerId?: unknown; reaction?: unknown; text?: unknown } | null;
      if (!message || typeof message.id !== 'number' || !Number.isInteger(message.id) || typeof message.playerId !== 'string') return;
      const index = typeof message.reaction === 'number' && Number.isInteger(message.reaction) ? message.reaction : null;
      const preset = index !== null ? REACTIONS[index] : undefined;
      // One of the game's own reactions: kept by its number, drawn from the game's list by the overlay.
      const own = index !== null && index >= REACTIONS.length;
      const value = own ? String(index - REACTIONS.length) : preset ?? (typeof message.text === 'string' ? message.text.slice(0, 60) : '');
      if (!value) return;
      const kind = own ? 'own' : preset ? /^[A-Z]/.test(value) ? 'sticker' : 'emoji' : 'message';
      items = [...items.slice(-29), { id: message.id, playerId: message.playerId, value, kind, at: Date.now() }];
      notify();
    },
    expire(now: number) { const kept = items.filter(item => now - item.at < 4200); if (kept.length !== items.length) { items = kept; notify(); } },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    items: () => items,
  };
}
export type ReactionStore = ReturnType<typeof createReactionStore>;

/** Bottom right of the shared screen: reactions float up and fade, like a stream chat. */
export function useReactions(store?: ReactionStore) {
  const items = useSyncExternalStore(store?.subscribe ?? noSubscription, store?.items ?? noReactions);
  useEffect(() => {
    if (!store || !items.length) return;
    const timer = setInterval(() => store.expire(Date.now()), 500);
    return () => clearInterval(timer);
  }, [store, items.length]);
  return items;
}
const empty: Reaction[] = [];
const noSubscription = () => () => {};
const noReactions = () => empty;

export function ReactionsOverlay({ state, store }: { state: RoomSnapshot; store: ReactionStore }) {
  const items = useReactions(store);
  if (!items.length) return null;
  return <div className="reactions-overlay" aria-hidden="true">{items.slice(-6).map(item => {
    const player = state.players.find(entry => entry.id === item.playerId);
    const own = item.kind === 'own' ? state.view.party?.reactions[Number(item.value)] : undefined;
    if (item.kind === 'own' && !own) return null;
    return <div key={item.id} className={`reaction ${own ? `own own-${own.kind}` : item.kind}`}>
      {player && <Avatar look={player.look} size={34} />}<span className="reaction-value">{own ? <OwnReactionView reaction={own} /> : item.value}</span>{player && <span className="reaction-name">{player.displayName}</span>}</div>;
  })}</div>;
}

/** One of the game's own reactions: an emoji, a short text, or a picture (GIFs move). */
export function OwnReactionView({ reaction }: { reaction: OwnReaction }) {
  return reaction.kind === 'picture' ? <img className="own-reaction-picture" src={`/api/media/${reaction.id}`} alt="" /> : <>{reaction.text}</>;
}

/** The phone's reaction tray: tap as often as you like (the server limits the pace). Below it, the game's sounds. */
export function ReactionTray({ onSend, choices, limit, own = [], reactions = true, sounds, onSound }: { onSend: (reaction: number) => void; choices: readonly number[]; limit: number;
  own?: readonly OwnReaction[]; reactions?: boolean; sounds?: { list: readonly Sound[]; waitUntil: number; offset: number } | undefined; onSound?: ((sound: number) => void) | undefined }) {
  const t = useText(); const s = useTexts(SOUND_TEXTS); const [sent, setSent] = useState<number | null>(null);
  // The same limit as the server (per 10 seconds), so the phone can say "slow down" instead of silently dropping.
  const [recent, setRecent] = useState<number[]>([]); const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  const live = recent.filter(at => now - at < 10_000); const waiting = live.length >= limit;
  const send = (index: number) => { const at = Date.now(); const kept = recent.filter(time => at - time < 10_000); if (kept.length >= limit) return; setRecent([...kept, at]); setNow(at); onSend(index); setSent(index); };
  // Reactions and sounds as two parts of the sheet, so neither list scrolls under the other.
  const hasSounds = Boolean(sounds && sounds.list.length > 0 && onSound);
  const [tab, setTab] = useState<'reactions' | 'sounds'>(reactions ? 'reactions' : 'sounds');
  const part = reactions && hasSounds ? tab : reactions ? 'reactions' : 'sounds';
  return <div className="reaction-tray">
    {reactions && hasSounds && <div className="tray-tabs" role="group" aria-label={t('react.title')}>
      <button type="button" aria-pressed={part === 'reactions'} onClick={() => setTab('reactions')}>{x('react')}</button>
      <button type="button" aria-pressed={part === 'sounds'} onClick={() => setTab('sounds')}>{s('sounds')}</button></div>}
    {part === 'reactions' && <>
      <p className="sheet-title">{t('react.title')}</p>
      {/* The game's own reactions first, then the standard ones the host allows. */}
      {own.length > 0 && <div className="reaction-grid own" role="group" aria-label={s('own')}>{own.map((reaction, index) =>
        <button key={`own-${index}`} type="button" className={`own-${reaction.kind}`} aria-label={x('send', { reaction: reaction.kind === 'picture' ? `${s('own')} ${index + 1}` : reaction.text })}
          disabled={waiting} onClick={() => send(REACTIONS.length + index)}><OwnReactionView reaction={reaction} /></button>)}</div>}
      <div className="reaction-grid">{REACTIONS.map((value, index) => choices.includes(index) && <button key={value} type="button" className={/^[A-Z]/.test(value) ? 'sticker' : undefined}
        aria-label={x('send', { reaction: value })} disabled={waiting} onClick={() => send(index)}>{value}</button>)}</div>
      <p className="hint" role="status">{waiting ? x('slowDown', { limit, seconds: Math.ceil((10_000 - (now - live[0]!)) / 1000) }) : x('leftForNow', { count: limit - live.length, limit })}</p>
      {sent !== null && <p role="status" className="visually-hidden">Sent {sent < REACTIONS.length ? REACTIONS[sent] : s('own')}</p>}
    </>}
    {part === 'sounds' && sounds && onSound && <SoundButtons sounds={sounds} onSound={onSound} now={now} titled={!reactions} />}
  </div>;
}

/** The soundboard on a phone: one button per sound, all waiting while this phone or the room has to wait. */
function SoundButtons({ sounds, onSound, now, titled }: { sounds: { list: readonly Sound[]; waitUntil: number; offset: number }; onSound: (sound: number) => void; now: number; titled: boolean }) {
  const s = useTexts(SOUND_TEXTS);
  const left = Math.ceil((sounds.waitUntil - (now + sounds.offset)) / 1000);
  return <section className="sound-board" aria-label={s('sounds')}>
    {titled && <p className="sheet-title"><FaIcon name="bolt" /> {s('sounds')}</p>}
    <div className="sound-grid">{sounds.list.map((sound, index) => { const name = sound.kind === 'builtin' ? s(sound.name) : sound.label;
      return <button key={index} type="button" aria-label={s('play', { sound: name })} disabled={left > 0} onClick={() => onSound(index)}>{name}</button>; })}</div>
    <p className="hint" role="status">{left > 0 ? s('wait', { seconds: left }) : s('ready')}</p>
  </section>;
}
