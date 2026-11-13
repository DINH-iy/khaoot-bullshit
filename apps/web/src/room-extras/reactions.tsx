import { useEffect, useState, useSyncExternalStore } from 'react';
import { REACTIONS, type RoomSnapshot } from '@party/contracts';
import { useText } from '../presentation/look.js';
import { Avatar } from '../players/avatar.js';
import './room-extras.css';

export interface Reaction { id: number; playerId: string; reaction: number; at: number }
/** The latest reactions for the shared screen, outside React state so a burst does not redraw the whole room. */
export function createReactionStore() {
  let items: Reaction[] = []; const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    add(input: unknown) {
      const message = input as Partial<Reaction> | null;
      if (!message || !Number.isInteger(message.id) || typeof message.playerId !== 'string' || !Number.isInteger(message.reaction) || message.reaction! < 0 || message.reaction! >= REACTIONS.length) return;
      items = [...items.slice(-29), { id: message.id!, playerId: message.playerId, reaction: message.reaction!, at: Date.now() }]; notify();
    },
    expire(now: number) { const kept = items.filter(item => now - item.at < 4200); if (kept.length !== items.length) { items = kept; notify(); } },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    items: () => items,
  };
}
export type ReactionStore = ReturnType<typeof createReactionStore>;

/** Bottom right of the shared screen: reactions float up and fade, like a stream chat. */
export function ReactionsOverlay({ state, store }: { state: RoomSnapshot; store: ReactionStore }) {
  const items = useSyncExternalStore(store.subscribe, store.items);
  useEffect(() => { const timer = setInterval(() => store.expire(Date.now()), 500); return () => clearInterval(timer); }, [store]);
  if (!items.length) return null;
  return <div className="reactions-overlay" aria-hidden="true">{items.map(item => {
    const player = state.players.find(entry => entry.id === item.playerId); const value = REACTIONS[item.reaction]!; const sticker = /^[A-Z!]+$/.test(value);
    return <div key={item.id} className={`reaction${sticker ? ' sticker' : ''}`} style={{ '--drift': `${(item.id % 5) * 9 - 18}px` } as React.CSSProperties}>
      {player && <Avatar look={player.look} size={34} />}<span className="reaction-value">{value}</span>{player && <span className="reaction-name">{player.displayName}</span>}</div>;
  })}</div>;
}

/** The phone's reaction tray: tap as often as you like (the server limits the pace). */
export function ReactionTray({ onSend }: { onSend: (reaction: number) => void }) {
  const t = useText(); const [sent, setSent] = useState<number | null>(null);
  return <div className="reaction-tray">
    <p className="sheet-title">{t('react.title')}</p>    <div className="reaction-grid">{REACTIONS.map((value, index) => <button key={value} type="button" className={/^[A-Z!]+$/.test(value) ? 'sticker' : undefined}
      aria-label={`Send ${value}`} onClick={() => { onSend(index); setSent(index); }}>{value}</button>)}</div>
    {sent !== null && <p role="status" className="visually-hidden">Sent {REACTIONS[sent]}</p>}
  </div>;
}
