import { useCallback, useEffect, useRef, useState } from 'react';
import { testSeat } from './test-seat.js';
import { io, type Socket } from 'socket.io-client';
import { createLiveStrokes } from '../drawing/live-strokes.js';
import { createReactionStore } from '../room-extras/reactions.js';
import { createPoolAimStore } from '../head-to-head/eight-ball/live-aim.js';
import { translate } from '../i18n/texts.js';
import { ROOM_TEXTS } from './room.text.js';
import { refusalText } from './refusals.js';
import { isUnavailablePageError } from '../navigation.js';
import { deviceLog, note, sendGameOver, setLogRoom } from '../diagnostics/recorder.js';
const r = (key: keyof typeof ROOM_TEXTS.en, values?: Record<string, string | number>) => translate(ROOM_TEXTS, key, values);
import { CommandReceiptSchema, GameCommandSchema, HeartbeatReplySchema, RoomSnapshotSchema, SessionChangedSchema, type GameCommand, type PoolAim, type RoomReply, type RoomSnapshot } from '@party/contracts';

export function useRoom(sessionId: string | undefined, display = false) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot>(); const [connection, setConnection] = useState('Connecting');
  const [deniedSession, setDeniedSession] = useState<string>();
  const [message, setMessage] = useState(''); const [samples, setSamples] = useState<number[]>([]); const [reconnects, setReconnects] = useState(0);
  const [pending, setPending] = useState<GameCommand>(); const [saving, setSaving] = useState(false); const [clockOffset, setClockOffset] = useState(0); const [confirmMs, setConfirmMs] = useState<number | null>(null);
  // Live minigame signals: GO the moment it happens, and the running tap counts of a race.
  // Counts challenge updates pushed to this phone; the challenges sheet reloads when it changes.
  const [challengeTick, setChallengeTick] = useState(0);
  const [go, setGo] = useState<{ stageRunId: string; goAt: string; receivedAt: number } | null>(null); const [progress, setProgress] = useState<{ stageRunId: string; counts: { playerId: string; count: number }[] } | null>(null);
  const [liveStrokes] = useState(createLiveStrokes); const [reactions] = useState(createReactionStore); const [poolAims] = useState(createPoolAimStore);
  const socketRef = useRef<Socket | undefined>(undefined); const pendingRef = useRef<GameCommand | undefined>(undefined); const sendRef = useRef<(command: GameCommand) => void>(() => {});
  // What the host was looking at when acting: used to decide whether a conflicting action is still meant.
  const latestRef = useRef<RoomSnapshot | undefined>(undefined); const basisRef = useRef('');
  const basisOf = (state: RoomSnapshot | undefined) => state ? `${state.view.status}:${state.view.stage?.id ?? ''}:${state.view.stage?.status ?? ''}:${state.view.stage?.revealed ?? ''}` : '';
  const storageKey = `party_pending_${sessionId ?? ''}`;
  const remember = useCallback((command?: GameCommand) => {
    pendingRef.current = command; setPending(command);
    try { if (command) localStorage.setItem(storageKey, JSON.stringify(command)); else localStorage.removeItem(storageKey); }
    catch { setMessage(r('noRetain')); }
  }, [storageKey]);
  useEffect(() => {
    // Another room (back to the lobby): nothing of the previous room may show or act in the meantime.
    setSnapshot(undefined);
    setDeniedSession(undefined);
    if (!sessionId) return;
    try { const saved = localStorage.getItem(storageKey); if (saved && saved.length < 6000) { const parsed = GameCommandSchema.safeParse(JSON.parse(saved)); if (parsed.success && parsed.data.sessionId === sessionId) { pendingRef.current = parsed.data; setPending(parsed.data); } } } catch { /* Online submission remains available. */ }
    let mounted = true; let syncing = false; let syncAgain = false; let reconciled = false; let connections = 0; let debounce: ReturnType<typeof setTimeout> | undefined;
    let sawPlaying = false; let admissionRetries = 0; let admissionTimer: ReturnType<typeof setTimeout> | undefined;
    const socket = io({ autoConnect: false, auth: { sessionId, ...(display ? { display: true } : {}), ...(testSeat ? { seat: testSeat } : {}) }, reconnectionAttempts: 20, reconnectionDelay: 500, reconnectionDelayMax: 5000, timeout: 8000 }); socketRef.current = socket;
    const denyAccess = () => { setSnapshot(undefined); setDeniedSession(sessionId); };
    // Commands go in the device log with their answer and time; syncs only when they fail or are slow,
    // heartbeats only as round-trip figures (they come every 10 seconds).
    const logged = (event: string, input: unknown, code: string, ms: number) => {
      if (event === 'room.heartbeat') { if (code === 'ok') deviceLog.heartbeat.add(ms); else note({ kind: 'command', what: event, code, ms }); return; }
      if (event === 'room.sync' && code === 'ok' && ms < 1500) return;
      const type = event === 'room.command' && typeof (input as { type?: unknown } | null)?.type === 'string' ? ` ${(input as { type: string }).type}` : '';
      if (code === 'ok') deviceLog.requests.add(ms);
      note({ kind: 'command', what: `${event}${type}`, code, ms });
    };
    const emit = <T,>(event: string, input: unknown): Promise<T> => new Promise((resolve, reject) => {
      if (!socket.connected) { note({ kind: 'command', what: event, code: 'not connected' }); reject(new Error(r('notConnected'))); return; }
      const start = performance.now();
      socket.timeout(5000).emit(event, input, (error: Error | null, reply: RoomReply<T>) => {
        const ms = Math.round(performance.now() - start);
        logged(event, input, error ? 'timeout' : !reply ? 'invalid reply' : reply.ok ? 'ok' : reply.error.code, ms);
        if (error) reject(new Error(r('notConfirmedReconnect')));
        else if (!reply?.ok) reject(new Error(reply && !reply.ok ? reply.error.code : r('invalidReply'))); else resolve(reply.data);
      });
    });
    const transmit = (command: GameCommand, attempt = 0) => {
      if (!socket.connected) { setSaving(false); setMessage(r('retained')); return; }
      setSaving(true); const start = performance.now();
      void emit('room.command', command).then(data => {
        const receipt = CommandReceiptSchema.parse(data);
        if (!mounted || receipt.commandId !== pendingRef.current?.commandId) return;
        // Buttons stay disabled until the screen shows the result, so a quick next press is based on the new state.
        // A confirmed action needs no message; its timing goes to the connection details.
        remember(); setMessage(''); setConfirmMs(Math.round(performance.now() - start)); return sync();
      }).catch(error => {
        if (!mounted) return;
        // Every saved answer advances the room revision, so a host action often
        // arrives one revision late. If the round is otherwise as the host saw it,
        // the same action is re-sent against the new revision instead of failing.
        if (error instanceof Error && error.message === 'REVISION_CONFLICT' && 'expectedRevision' in command && basisRef.current && attempt < 3) {
          void emit('room.sync', { sessionId }).then(data => {
            const state = RoomSnapshotSchema.parse(data); if (!mounted) return;
            latestRef.current = state; setSnapshot(state);
            if (basisOf(state) !== basisRef.current) { remember(); setMessage(r('changedBefore')); return; }
            const next = { ...command, commandId: crypto.randomUUID(), expectedRevision: state.view.revision } as GameCommand;
            remember(next); transmit(next, attempt + 1);
          }).catch(() => { if (mounted) { remember(); setMessage(r('notConfirmedCheck')); requestSync(); } });
          return;
        } setMessage(refusalText(error, 'notConfirmed'));
        if (error instanceof Error && ['REVISION_CONFLICT', 'INVALID_STATE', 'ALREADY_SUBMITTED', 'ALREADY_JUDGED', 'INELIGIBLE', 'FORBIDDEN', 'INVALID_SUBMISSION', 'COMMAND_KEY_REUSED', 'TOO_LATE', 'ALREADY_DECIDED', 'DECISION_PENDING'].includes(error.message)) { remember(); requestSync(); }
      }).finally(() => { if (mounted) setSaving(false); });
    };
    sendRef.current = transmit;
    const reconcile = async (state: RoomSnapshot) => {
      const command = pendingRef.current; if (!command) return;
      const data = await emit<{ receipt: unknown }>('room.receipt', { commandId: command.commandId }); if (!mounted) return;
      if (data.receipt) { const receipt = CommandReceiptSchema.parse(data.receipt); if (receipt.commandId === command.commandId) { remember(); setMessage(r('restored')); } }
      else if (command.type === 'submission.submit' && state.view.stage?.id === command.stageRunId && state.view.stage.status === 'ACTIVE' && state.view.status === 'RUNNING') transmit(command);
      else setMessage(r('previous'));
    };
    const sync = async () => {
      if (!mounted || !socket.connected) return; if (syncing) { syncAgain = true; return; } syncing = true;
      try {
        const state = RoomSnapshotSchema.parse(await emit('room.sync', { sessionId })); if (!mounted) return;
        setSnapshot(previous => { const next = !previous || state.view.revision >= previous.view.revision ? state : previous; latestRef.current = next; return next; });
        setLogRoom(sessionId, state.role, state.selfPlayerId);
        // The whole log once the game is over, from a device that saw it played (not one opening an old room).
        if (state.view.status !== 'FINISHED') sawPlaying = true; else if (sawPlaying) sendGameOver(sessionId);
        setClockOffset(Date.parse(state.view.serverTime) - Date.now());
        if (!reconciled) { reconciled = true; await reconcile(state); }
      } catch (error) {
        if (!mounted) return;
        if (isUnavailablePageError(error)) denyAccess();
        else setMessage(refusalText(error, 'syncFailed'));
      }
      finally { syncing = false; if (syncAgain) { syncAgain = false; requestSync(); } }
    };
    function requestSync() { if (debounce) clearTimeout(debounce); debounce = setTimeout(() => { void sync(); }, 150); }
    const heartbeat = async () => {
      if (!socket.connected || document.hidden) return; const nonce = String(Date.now()); const start = performance.now();
      try { const reply = HeartbeatReplySchema.parse(await emit('room.heartbeat', { nonce })); if (mounted && reply.nonce === nonce) setSamples(previous => [...previous.slice(-59), performance.now() - start]); }
      catch (error) {
        if (!mounted) return;
        if (isUnavailablePageError(error)) denyAccess();
        else setMessage(r('checkFailed'));
      }
    };
    socket.on('connect', () => { if (!mounted) return; note({ kind: 'connection', what: connections ? 'reconnected' : 'connected' }); if (connections) deviceLog.reconnects++; admissionRetries = 0; if (admissionTimer) clearTimeout(admissionTimer); connections++; setReconnects(value => value + (connections > 1 ? 1 : 0)); setConnection('Connected'); reconciled = false; void sync(); void heartbeat(); });
    socket.on('disconnect', reason => {
      if (!mounted) return; note({ kind: 'connection', what: 'disconnected', code: reason.slice(0, 60) });
      setConnection('Disconnected — reconnecting'); setSaving(false);
      // A forced disconnect can mean this seat was revoked. Ask the server before deciding where to go.
      if (reason === 'io server disconnect') socket.connect();
    });
    socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
      if (!mounted) return; setConnection('Connection unavailable'); note({ kind: 'connection', what: 'could not connect', code: (error.data?.code ?? error.message).slice(0, 60) });
      if (isUnavailablePageError(error.data?.code)) { denyAccess(); return; }
      setMessage(r('unreachable'));
      // Socket.IO retries transport failures itself, but namespace middleware
      // rejection needs an explicit bounded retry for temporary DB/rate failures.
      if (error.data && ++admissionRetries <= 20) {
        if (admissionTimer) clearTimeout(admissionTimer);
        admissionTimer = setTimeout(() => { if (mounted && !socket.connected) socket.connect(); }, Math.min(5000, 500 * 2 ** Math.min(admissionRetries, 4)));
      }
    });
    const syncIfNew = (input: unknown, run: () => void) => {
      const event = SessionChangedSchema.safeParse(input);
      if (event.success && event.data.sessionId === sessionId && event.data.revision > (latestRef.current?.view.revision ?? -1)) run();
    };
    socket.on('room.changed', input => syncIfNew(input, requestSync));
    socket.on('room.pool-shot', input => syncIfNew(input, () => { clearTimeout(debounce); void sync(); }));
    socket.on('presence.changed', requestSync);
    // The server measures its round trip to this phone; answering at once keeps minigame results fair.
    socket.on('room.ping', (_input: unknown, ack: unknown) => { if (typeof ack === 'function') ack(); });
    socket.on('minigame.go', (data: { stageRunId?: unknown; goAt?: unknown }) => { if (mounted && typeof data?.stageRunId === 'string' && typeof data.goAt === 'string') { setGo({ stageRunId: data.stageRunId, goAt: data.goAt, receivedAt: performance.now() }); requestSync(); } });
    socket.on('drawing.live', (data: unknown) => { if (mounted) liveStrokes.apply(data); });
    socket.on('room.reaction', (data: unknown) => { if (mounted) reactions.add(data); });
    socket.on('room.pool-aim', (data: unknown) => { if (mounted) poolAims.add(data); });
    socket.on('minigame.progress', (data: { stageRunId?: unknown; counts?: unknown }) => { if (mounted && typeof data?.stageRunId === 'string' && Array.isArray(data.counts)) setProgress({ stageRunId: data.stageRunId, counts: (data.counts as { playerId: string; count: number }[]).filter(entry => typeof entry?.playerId === 'string' && Number.isInteger(entry.count)).slice(0, 512) }); });
    socket.on('room.error', (error: { code: string }) => {
      if (!mounted) return; note({ kind: 'connection', what: 'room error', code: String(error?.code).slice(0, 60) });
      if (isUnavailablePageError(error.code)) denyAccess();
      else setMessage(refusalText(new Error(String(error?.code)), 'notConfirmed'));
    });
    socket.on('side.challenge', () => { if (mounted) setChallengeTick(value => value + 1); });
    const interval = setInterval(() => { void heartbeat(); requestSync(); }, 10000);
    const foreground = () => { if (!document.hidden) { if (!socket.connected) socket.connect(); reconciled = false; requestSync(); void heartbeat(); } };
    document.addEventListener('visibilitychange', foreground); window.addEventListener('online', foreground); socket.connect();
    return () => { mounted = false; setLogRoom(null); clearInterval(interval); if (debounce) clearTimeout(debounce); if (admissionTimer) clearTimeout(admissionTimer); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('online', foreground); socket.removeAllListeners(); socket.disconnect(); socketRef.current = undefined; };
  }, [sessionId, display, remember, storageKey, liveStrokes, reactions, poolAims]);
  return { snapshot, denied: deniedSession !== undefined && deniedSession === sessionId, connection, message, samples, reconnects, pending, saving, clockOffset, confirmMs, go, progress, challengeTick,
    /** A tap race's running count; fire-and-forget, the final result is the saved one. */
    // Not volatile: a report waits for a busy connection instead of being dropped, so the server sees every tap it can.
    sendTaps(stageRunId: string, count: number) { socketRef.current?.emit('minigame.taps', { stageRunId, count }); },
    liveStrokes, reactions, poolAims,
    /** The 8-ball shooter's aim while lining up; dropped when the connection is busy, the next one replaces it. */
    sendPoolAim(aim: PoolAim) { socketRef.current?.volatile.emit('room.pool-aim', aim); },
    /** An emoji or sticker for the shared screen; fire-and-forget (the server limits the pace). */
    sendReaction(reaction: number) { socketRef.current?.volatile.emit('room.react', { reaction }); },
    /** A stroke of a Pass the pencil turn while it is drawn (others see it grow); `stroke: null` with a smaller `count` is an undo. */
    sendStroke(message: { stageRunId: string; turn: number; strokeId: number; stroke: unknown; count: number }) { socketRef.current?.volatile.emit('drawing.stroke', message); },
    send(command: GameCommand) { if (pendingRef.current) return; basisRef.current = basisOf(latestRef.current); remember(command); sendRef.current(command); }, retry() { if (pendingRef.current) sendRef.current(pendingRef.current); },
    discard() { remember(); setMessage(r('discarded')); }, reconnect() { socketRef.current?.disconnect().connect(); },
  };
}
