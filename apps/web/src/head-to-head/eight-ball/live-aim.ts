import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { PoolAimNoticeSchema, type PoolAim, type PoolAimNotice } from '@party/contracts';

type Listener = (aim: PoolAimNotice) => void;

/** Relayed shooter aims, handed to the board showing that match. Nothing is kept beyond the newest one per match. */
export function createPoolAimStore() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    add(input: unknown) {
      const parsed = PoolAimNoticeSchema.safeParse(input); if (!parsed.success) return;
      for (const listener of listeners.get(parsed.data.match) ?? []) listener(parsed.data);
    },
    subscribe(match: string, listener: Listener) {
      const set = listeners.get(match) ?? new Set(); set.add(listener); listeners.set(match, set);
      return () => { set.delete(listener); if (!set.size) listeners.delete(match); };
    },
  };
}
export type PoolAimStore = ReturnType<typeof createPoolAimStore>;
export const PoolAimContext = createContext<{ store: PoolAimStore; send: (aim: PoolAim) => void } | null>(null);
/** The match a board shows live aims for, and which player sits in each seat. */
export type PoolLive = { match: string; seats: readonly [string, string] };

/** Sends the shooter's aim at most every 80 ms, always ending on the newest. */
export function useSendPoolAim(live: PoolLive | undefined, aim: PoolAim | undefined) {
  // The room screen rebuilds this context value on every render; only the newest send matters.
  const relay = useContext(PoolAimContext); const send = useRef(relay?.send); send.current = relay?.send;
  const match = live?.match;
  const last = useRef(0); const timer = useRef<number>(undefined); const latest = useRef(aim); latest.current = aim;
  const key = aim ? `${aim.shot}:${aim.angle}:${Math.round(aim.pull)}:${aim.cue?.join(',') ?? ''}` : '';
  useEffect(() => {
    if (!match || !latest.current || timer.current !== undefined) return;
    const flush = () => { timer.current = undefined; last.current = performance.now(); if (latest.current) send.current?.(latest.current); };
    const wait = 80 - (performance.now() - last.current);
    if (wait <= 0) flush(); else timer.current = window.setTimeout(flush, wait);
  }, [match, key]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
}

/** The newest aim from the player whose turn it is, for this shot; undefined when there is none. */
export function useGhostAim(live: PoolLive | undefined, shooter: 0 | 1 | null, shot: number) {
  const store = useContext(PoolAimContext)?.store;
  const [aim, setAim] = useState<PoolAimNotice>();
  const match = live?.match;
  const player = live && shooter !== null ? live.seats[shooter] : undefined;
  useEffect(() => {
    setAim(undefined);
    if (!store || !match || !player) return;
    return store.subscribe(match, next => { if (next.playerId === player && next.shot === shot) setAim(next); });
  }, [store, match, player, shot]);
  return aim;
}
