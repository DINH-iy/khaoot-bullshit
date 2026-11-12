import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CommandReceiptSchema, GameCommandSchema, HeartbeatReplySchema, RoomSnapshotSchema, type GameCommand, type RoomReply, type RoomSnapshot } from '@party/contracts';

export function useRoom(sessionId: string | undefined, display = false) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot>(); const [connection, setConnection] = useState('Connecting');
  const [message, setMessage] = useState(''); const [samples, setSamples] = useState<number[]>([]); const [reconnects, setReconnects] = useState(0);
  const [pending, setPending] = useState<GameCommand>(); const [saving, setSaving] = useState(false);
  const socketRef = useRef<Socket | undefined>(undefined); const pendingRef = useRef<GameCommand | undefined>(undefined); const sendRef = useRef<(command: GameCommand) => void>(() => {});
  const storageKey = `party_pending_${sessionId ?? ''}`;
  const remember = useCallback((command?: GameCommand) => {
    pendingRef.current = command; setPending(command);
    try { if (command) localStorage.setItem(storageKey, JSON.stringify(command)); else localStorage.removeItem(storageKey); }
    catch { setMessage('This browser cannot retain pending actions across refreshes. Keep this page open until Saved.'); }
  }, [storageKey]);
  useEffect(() => {
    if (!sessionId) return;
    try { const saved = localStorage.getItem(storageKey); if (saved && saved.length < 6000) { const parsed = GameCommandSchema.safeParse(JSON.parse(saved)); if (parsed.success && parsed.data.sessionId === sessionId) { pendingRef.current = parsed.data; setPending(parsed.data); } } } catch { /* Online submission remains available. */ }
    let mounted = true; let syncing = false; let syncAgain = false; let reconciled = false; let connections = 0; let debounce: ReturnType<typeof setTimeout> | undefined;
    let admissionRetries = 0; let admissionTimer: ReturnType<typeof setTimeout> | undefined;
    const socket = io({ autoConnect: false, auth: { sessionId, ...(display ? { display: true } : {}) }, reconnectionAttempts: 20, reconnectionDelay: 500, reconnectionDelayMax: 5000, timeout: 8000 }); socketRef.current = socket;
    const emit = <T,>(event: string, input: unknown): Promise<T> => new Promise((resolve, reject) => {
      if (!socket.connected) { reject(new Error('Not connected')); return; }
      socket.timeout(5000).emit(event, input, (error: Error | null, reply: RoomReply<T>) => {
        if (error) reject(new Error('Not confirmed — reconnect or check again.'));
        else if (!reply?.ok) reject(new Error(reply && !reply.ok ? reply.error.code : 'Invalid server reply')); else resolve(reply.data);
      });
    });
    const transmit = (command: GameCommand) => {
      if (!socket.connected) { setSaving(false); setMessage('Not confirmed — reconnecting. Your action is retained.'); return; }
      setSaving(true); const start = performance.now();
      void emit('room.command', command).then(data => {
        const receipt = CommandReceiptSchema.parse(data);
        if (!mounted || receipt.commandId !== pendingRef.current?.commandId) return;
        remember(); setMessage(`Saved · ${Math.round(performance.now() - start)} ms confirmation`); requestSync();
      }).catch(error => {
        if (!mounted) return; setMessage(error instanceof Error ? error.message : 'Not confirmed');
        if (error instanceof Error && ['REVISION_CONFLICT', 'INVALID_STATE', 'ALREADY_SUBMITTED', 'ALREADY_JUDGED', 'INELIGIBLE', 'FORBIDDEN', 'INVALID_SUBMISSION', 'COMMAND_KEY_REUSED'].includes(error.message)) { remember(); requestSync(); }
      }).finally(() => { if (mounted) setSaving(false); });
    };
    sendRef.current = transmit;
    const reconcile = async (state: RoomSnapshot) => {
      const command = pendingRef.current; if (!command) return;
      const data = await emit<{ receipt: unknown }>('room.receipt', { commandId: command.commandId }); if (!mounted) return;
      if (data.receipt) { const receipt = CommandReceiptSchema.parse(data.receipt); if (receipt.commandId === command.commandId) { remember(); setMessage('Saved — restored after reconnect.'); } }
      else if (command.type === 'submission.submit' && state.view.stage?.id === command.stageRunId && state.view.stage.status === 'ACTIVE' && state.view.status === 'RUNNING') transmit(command);
      else setMessage('Previous action is not confirmed. Review the current stage before retrying or discarding it.');
    };
    const sync = async () => {
      if (!mounted || !socket.connected) return; if (syncing) { syncAgain = true; return; } syncing = true;
      try {
        const state = RoomSnapshotSchema.parse(await emit('room.sync', { sessionId })); if (!mounted) return;
        setSnapshot(previous => !previous || state.view.revision >= previous.view.revision ? state : previous);
        if (!reconciled) { reconciled = true; await reconcile(state); }
      } catch (error) { if (mounted) setMessage(error instanceof Error ? error.message : 'Could not synchronize.'); }
      finally { syncing = false; if (syncAgain) { syncAgain = false; requestSync(); } }
    };
    function requestSync() { if (debounce) clearTimeout(debounce); debounce = setTimeout(() => { void sync(); }, 150); }
    const heartbeat = async () => {
      if (!socket.connected || document.hidden) return; const nonce = String(Date.now()); const start = performance.now();
      try { const reply = HeartbeatReplySchema.parse(await emit('room.heartbeat', { nonce })); if (mounted && reply.nonce === nonce) setSamples(previous => [...previous.slice(-59), performance.now() - start]); }
      catch { if (mounted) setMessage('Connection check failed. Saved data remains on the server.'); }
    };
    socket.on('connect', () => { if (!mounted) return; admissionRetries = 0; if (admissionTimer) clearTimeout(admissionTimer); connections++; setReconnects(value => value + (connections > 1 ? 1 : 0)); setConnection('Connected'); reconciled = false; void sync(); void heartbeat(); });
    socket.on('disconnect', () => { if (mounted) { setConnection('Disconnected — reconnecting'); setSaving(false); } });
    socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
      if (!mounted) return; setConnection('Connection unavailable');
      const denied = ['UNAUTHORIZED', 'CREDENTIAL_EXPIRED', 'FORBIDDEN', 'ORIGIN_REJECTED'].includes(error.data?.code ?? '');
      if (denied) { setSnapshot(undefined); setMessage('Room access denied. Your access may have expired or been revoked.'); return; }
      setMessage('Cannot reach the server. Retrying with backoff.');
      // Socket.IO retries transport failures itself, but namespace middleware
      // rejection needs an explicit bounded retry for temporary DB/rate failures.
      if (error.data && ++admissionRetries <= 20) {
        if (admissionTimer) clearTimeout(admissionTimer);
        admissionTimer = setTimeout(() => { if (mounted && !socket.connected) socket.connect(); }, Math.min(5000, 500 * 2 ** Math.min(admissionRetries, 4)));
      }
    });
    socket.on('room.changed', requestSync); socket.on('presence.changed', requestSync);
    socket.on('room.error', (error: { code: string }) => { if (mounted) setMessage(error.code); });
    const interval = setInterval(() => { void heartbeat(); requestSync(); }, 10000);
    const foreground = () => { if (!document.hidden) { if (!socket.connected) socket.connect(); reconciled = false; requestSync(); void heartbeat(); } };
    document.addEventListener('visibilitychange', foreground); window.addEventListener('online', foreground); socket.connect();
    return () => { mounted = false; clearInterval(interval); if (debounce) clearTimeout(debounce); if (admissionTimer) clearTimeout(admissionTimer); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('online', foreground); socket.removeAllListeners(); socket.disconnect(); socketRef.current = undefined; };
  }, [sessionId, display, remember, storageKey]);
  return { snapshot, connection, message, samples, reconnects, pending, saving,
    send(command: GameCommand) { if (pendingRef.current) return; remember(command); sendRef.current(command); }, retry() { if (pendingRef.current) sendRef.current(pendingRef.current); },
    discard() { remember(); setMessage('Pending action discarded locally. Already saved actions remain on the server.'); }, reconnect() { socketRef.current?.disconnect().connect(); },
  };
}
