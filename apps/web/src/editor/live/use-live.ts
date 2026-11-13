import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { DraftSchema, EDITOR_NAMESPACE, EditorCursorSchema, EditorPeersSchema, type Draft, type EditorPeer, type EditorPresence } from '@party/contracts';
import { roomApi } from '../../network/api.js';
import type { Point } from '../model.js';

const NAME = 'party-editor-name';
const ANIMALS = ['Otter', 'Fox', 'Heron', 'Badger', 'Lynx', 'Robin', 'Hare', 'Owl', 'Seal', 'Finch', 'Marten', 'Stork'];
function storedName(): string {
  try { const saved = localStorage.getItem(NAME)?.trim().slice(0, 40); if (saved) return saved; } catch { /* a name for this visit only */ }
  return ANIMALS[Math.floor(Math.random() * ANIMALS.length)]!;
}

/**
 * The live side of editing together: who else has this game open, what they
 * have selected, their pointers, and their saves the moment they happen.
 * Saving never depends on it; without a connection the editor still works
 * and merges other people's work when it saves.
 */
export function useLive(gameId: string, mine: Omit<EditorPresence, 'name'>, onDraft: (draft: Draft) => void, onConnect: () => void) {
  const [all, setAll] = useState<EditorPeer[]>([]); const [selfId, setSelfId] = useState<string>();
  const [cursors, setCursors] = useState<Record<string, Point>>({}); const [name, setNameState] = useState(storedName);
  const socketRef = useRef<Socket | undefined>(undefined);
  const presence: EditorPresence = useMemo(() => ({ name: name.trim() || 'Someone', view: mine.view, selected: mine.selected.slice(0, 50) }), [name, mine.view, mine.selected.join('\u0000')]); // eslint-disable-line react-hooks/exhaustive-deps
  const presenceRef = useRef(presence); presenceRef.current = presence;
  const handlers = useRef({ onDraft, onConnect }); handlers.current = { onDraft, onConnect };

  useEffect(() => {
    let closed = false; let retry: ReturnType<typeof setTimeout> | undefined;
    const socket = io(EDITOR_NAMESPACE, { reconnectionDelay: 500, reconnectionDelayMax: 5000, timeout: 8000,
      // A fresh ticket for every (re)connection; they last two minutes.
      auth: send => { void roomApi<{ ticket: string }>(`/api/host/games/${gameId}/live`, {}).then(({ ticket }) => send({ ticket, name: presenceRef.current.name }), () => send({})); } });
    socketRef.current = socket;
    socket.on('connect', () => { setSelfId(socket.id); socket.emit('editor.presence', presenceRef.current); handlers.current.onConnect(); });
    socket.on('disconnect', () => { setAll([]); setCursors({}); setSelfId(undefined); });
    // A refused ticket is not retried by the library itself.
    socket.on('connect_error', () => { if (!closed && !socket.active) { clearTimeout(retry); retry = setTimeout(() => { if (!closed) socket.connect(); }, 5000); } });
    socket.on('editor.peers', (data: unknown) => {
      const parsed = EditorPeersSchema.safeParse(data); if (!parsed.success) return;
      setAll(parsed.data); const here = new Set(parsed.data.filter(peer => peer.view === 'flow').map(peer => peer.id));
      setCursors(current => Object.keys(current).every(id => here.has(id)) ? current : Object.fromEntries(Object.entries(current).filter(([id]) => here.has(id))));
    });
    socket.on('editor.cursor', (data: unknown) => {
      const parsed = EditorCursorSchema.safeParse(data); if (!parsed.success) return; const { id, at } = parsed.data;
      setCursors(current => { if (at) return { ...current, [id]: at }; if (!(id in current)) return current; const { [id]: _gone, ...rest } = current; return rest; });
    });
    socket.on('editor.draft', (data: unknown) => { const parsed = DraftSchema.safeParse(data); if (parsed.success && parsed.data.gameId === gameId) handlers.current.onDraft(parsed.data); });
    return () => { closed = true; clearTimeout(retry); socket.disconnect(); socketRef.current = undefined; };
  }, [gameId]);
  useEffect(() => { if (socketRef.current?.connected) socketRef.current.emit('editor.presence', presence); }, [presence]);

  // At most about twenty pointer positions a second, always ending on the latest.
  const pointer = useRef<{ last: number; timer?: ReturnType<typeof setTimeout>; next?: Point | null }>({ last: 0 });
  const sendCursor = useCallback((at: Point | null) => {
    const state = pointer.current; state.next = at; if (state.timer) return;
    state.timer = setTimeout(() => {
      delete state.timer; state.last = Date.now(); const next = state.next;
      if (next !== undefined && socketRef.current?.connected) socketRef.current.volatile.emit('editor.cursor', next && { x: Math.round(next.x), y: Math.round(next.y) });
    }, Math.max(0, 50 - (Date.now() - state.last)));
  }, []);
  useEffect(() => () => clearTimeout(pointer.current.timer), []);
  const setName = (next: string) => { setNameState(next.slice(0, 40)); try { localStorage.setItem(NAME, next.trim().slice(0, 40)); } catch { /* only a convenience */ } };

  const peers = useMemo(() => all.filter(peer => peer.id !== selfId), [all, selfId]);
  return { peers, cursors, sendCursor, name, setName, color: all.find(peer => peer.id === selfId)?.color ?? null };
}
export type LiveState = ReturnType<typeof useLive>;
