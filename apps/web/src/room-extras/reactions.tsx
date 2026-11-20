import { useEffect, useState, useSyncExternalStore } from 'react';
import { REACTIONS, type RoomSnapshot } from '@party/contracts';
import { useText } from '../presentation/look.js';
import { Avatar } from '../players/avatar.js';
import { translate } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from '../room/extras.text.js';
const x = (key: keyof typeof EXTRAS_TEXTS.en, values?: Record<string, string | number>) => translate(EXTRAS_TEXTS, key, values);
import './room-extras.css';

type Reaction = { id: number; playerId: string; at: number; value: string; kind: 'emoji' | 'sticker' | 'message' };
/** The latest reactions for the shared screen, outside React state so a burst does not redraw the whole room. */
export function createReactionStore() {
  let items: Reaction[] = []; const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    add(input: unknown) {
      const message = input as { id?: unknown; playerId?: unknown; reaction?: unknown; text?: unknown } | null;
      if (!message || typeof message.id !== 'number' || !Number.isInteger(message.id) || typeof message.playerId !== 'string') return;
      const preset = typeof message.reaction === 'number' && Number.isInteger(message.reaction) ? REACTIONS[message.reaction] : undefined;
      const value = preset ?? (typeof message.text === 'string' ? message.text.slice(0, 60) : '');
      if (!value) return;
      const kind = preset ? /^[A-Z]/.test(value) ? 'sticker' : 'emoji' : 'message';
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
    return <div key={item.id} className={`reaction ${item.kind}`}>
      {player && <Avatar look={player.look} size={34} />}<span className="reaction-value">{item.value}</span>{player && <span className="reaction-name">{player.displayName}</span>}</div>;
  })}</div>;
}

/** The phone's reaction tray: tap as often as you like (the server limits the pace). */
export function ReactionTray({ onSend, choices, limit }: { onSend: (reaction: number) => void; choices: readonly number[]; limit: number }) {
  const t = useText(); const [sent, setSent] = useState<number | null>(null);
  // The same limit as the server (per 10 seconds), so the phone can say "slow down" instead of silently dropping.
  const [recent, setRecent] = useState<number[]>([]); const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  const live = recent.filter(at => now - at < 10_000); const waiting = live.length >= limit;
  const send = (index: number) => { const at = Date.now(); const kept = recent.filter(time => at - time < 10_000); if (kept.length >= limit) return; setRecent([...kept, at]); setNow(at); onSend(index); setSent(index); };
  return <div className="reaction-tray">
    <p className="sheet-title">{t('react.title')}</p>
    <div className="reaction-grid">{REACTIONS.map((value, index) => choices.includes(index) && <button key={value} type="button" className={/^[A-Z]/.test(value) ? 'sticker' : undefined}
      aria-label={x('send', { reaction: value })} disabled={waiting} onClick={() => send(index)}>{value}</button>)}</div>
    <p className="hint" role="status">{waiting ? x('slowDown', { limit, seconds: Math.ceil((10_000 - (now - live[0]!)) / 1000) }) : x('leftForNow', { count: limit - live.length, limit })}</p>
    {sent !== null && <p role="status" className="visually-hidden">Sent {REACTIONS[sent]}</p>}
  </div>;
}
