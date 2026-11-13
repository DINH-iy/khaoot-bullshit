import { useCallback, useEffect, useRef, useState } from 'react';
import { DraftSchema, type DefinitionIssue, type Draft } from '@party/contracts';
import { newId, roomApi } from '../network/api.js';
import type { Definition, Positions } from './model.js';
import { combine, fromDoc, toDoc, type Doc, type Snapshot } from './live/document.js';
import { same } from './live/merge.js';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';
/** One of your own edits: the game just before and just after it. Undo and redo replay only this difference. */
interface Step { before: Snapshot; after: Snapshot }
const HISTORY = 100;

/**
 * One game draft shared by both editor views: loading, automatic saving, undo/redo,
 * publishing and playing. Several people can edit at once: a save by someone
 * else is merged into this copy (see live/document.ts), never overwritten.
 */
export function useDraft(gameId: string) {
  const [draft, setDraft] = useState<Draft>(); const [loadError, setLoadError] = useState('');
  const [definition, setDefinition] = useState<Definition>(); const [positions, setPositions] = useState<Positions>({});
  const [issues, setIssues] = useState<DefinitionIssue[]>([]); const [save, setSave] = useState<SaveState>('saved');
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ undo: Step[]; redo: Step[] }>({ undo: [], redo: [] });
  const revision = useRef(0); const dirty = useRef(false); const saving = useRef(false); const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The last version known to be saved on the server: what our unsaved edits are measured against.
  const server = useRef<Doc | undefined>(undefined);
  const latest = useRef<{ definition?: Definition; positions: Positions }>({ positions: {} });
  latest.current = { ...(definition ? { definition } : {}), positions };
  const lastRecord = useRef<{ at: number; group: string }>({ at: 0, group: '' });
  // While a card or arrow is being dragged, other people's changes wait: the drag works on what was on screen when it began.
  const dragging = useRef(false); const waiting = useRef<Draft | undefined>(undefined);
  const show = (next: Snapshot) => { latest.current = next; setDefinition(next.definition); setPositions(next.positions); };

  const load = useCallback(() => {
    setLoadError('');
    void roomApi(`/api/host/games/${gameId}`).then(data => {
      const loaded = DraftSchema.parse(data);
      setDraft(loaded); setIssues(loaded.issues); revision.current = loaded.revision; server.current = loaded.definition as Doc; waiting.current = undefined;
      show(fromDoc(loaded.definition as Doc)); setSave('saved'); dirty.current = false;
      setHistory({ undo: [], redo: [] });
    }).catch(() => setLoadError('This game could not be opened. It may have been removed, or the server is not running.'));
  }, [gameId]);
  useEffect(load, [load]);

  const flush = useCallback(async () => {
    const current = latest.current; if (!current.definition || saving.current || !dirty.current) return;
    if (dragging.current) { timer.current = setTimeout(() => { void flush(); }, 300); return; }
    saving.current = true; dirty.current = false; setSave('saving'); let wait = 1500;
    try {
      receive.current(DraftSchema.parse(await roomApi(`/api/host/games/${gameId}/draft`, { expectedRevision: revision.current, definition: toDoc(current as Snapshot) }, 'PUT')));
      setSave(dirty.current ? 'pending' : 'saved');
    } catch (cause) {
      dirty.current = true;
      if (cause instanceof Error && cause.message === 'REVISION_CONFLICT') {
        // Someone else saved first: take their version in, then save ours on top of it.
        wait = 150;
        try { receive.current(DraftSchema.parse(await roomApi(`/api/host/games/${gameId}`))); setSave(dirty.current ? 'pending' : 'saved'); } catch { setSave('error'); wait = 1500; }
      } else setSave('error');
    } finally { saving.current = false; }
    if (dirty.current) { clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(); }, wait); }
  }, [gameId]);
  const schedule = useCallback(() => { dirty.current = true; setSave('pending'); clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(); }, 700); }, [flush]);

  /** Takes in a saved version from the server: our own save coming back, or someone else's. */
  const receive = useRef<(remote: Draft) => void>(() => {});
  receive.current = (remote: Draft) => {
    const current = latest.current; const base = server.current;
    if (!current.definition || !base || remote.revision < revision.current) return;
    // Publishing changes the draft's details but not its content.
    if (remote.revision === revision.current) { setDraft(remote); return; }
    if (dragging.current) { if (!waiting.current || waiting.current.revision < remote.revision) waiting.current = remote; return; }
    const ours = toDoc(current as Snapshot); const theirs = remote.definition as Doc;
    const merged = same(ours, base) ? theirs : combine(base, ours, theirs);
    server.current = theirs; revision.current = remote.revision; setDraft(remote); setIssues(remote.issues);
    const next = fromDoc(merged);
    if (!same(ours, toDoc(next))) { show(next); lastRecord.current = { at: 0, group: '' }; }
    // Edits of ours that this version does not have yet still need saving.
    dirty.current = !same(toDoc(next), theirs);
    if (dirty.current && !saving.current) schedule();
  };
  const adopt = useCallback((remote: Draft) => receive.current(remote), []);
  /** Fetches the latest saved version, for when changes may have been missed (the live connection dropped). */
  const refresh = useCallback(() => { void roomApi(`/api/host/games/${gameId}`).then(data => receive.current(DraftSchema.parse(data))).catch(() => {}); }, [gameId]);
  useEffect(() => {
    const down = () => { dragging.current = true; };
    // After the drag's own handlers have applied its result.
    const up = () => setTimeout(() => { dragging.current = false; const held = waiting.current; waiting.current = undefined; if (held) receive.current(held); }, 0);
    // `blur`: a button released outside the window never reports its release.
    const ends = ['pointerup', 'pointercancel', 'blur'] as const;
    window.addEventListener('pointerdown', down, true); for (const name of ends) window.addEventListener(name, up, true);
    return () => { window.removeEventListener('pointerdown', down, true); for (const name of ends) window.removeEventListener(name, up, true); };
  }, []);

  /**
   * Applies an edit. Each edit is one undo step, except that quick successive
   * edits in the same `group` (typing in one field) are merged.
   */
  const change = useCallback((next: Definition, nextPositions?: Positions, group = '', before?: Positions) => {
    const current = latest.current; const now = Date.now(); if (!current.definition) return;
    // `before`: card positions from before a drag, since the screen already shows the dragged ones.
    const from = { definition: current.definition, positions: before ?? current.positions }; const to = { definition: next, positions: nextPositions ?? current.positions };
    const grouped = Boolean(group) && group === lastRecord.current.group && now - lastRecord.current.at < 1200;
    setHistory(previous => grouped && previous.undo.length
      ? { undo: [...previous.undo.slice(0, -1), { before: previous.undo.at(-1)!.before, after: to }], redo: [] }
      : { undo: [...previous.undo.slice(-HISTORY + 1), { before: from, after: to }], redo: [] });
    lastRecord.current = { at: now, group };
    show(to); schedule();
  }, [schedule]);
  /**
   * Undo and redo touch only what that step of yours changed. Whatever other
   * people did since stays, also where they changed the very same field.
   */
  const restore = (kind: 'undo' | 'redo') => {
    const current = latest.current; const step = history[kind].at(-1);
    if (!current.definition || !step) return;
    const [from, to] = kind === 'undo' ? [step.after, step.before] : [step.before, step.after];
    show(fromDoc(combine(toDoc(from), toDoc(current as Snapshot), toDoc(to)))); lastRecord.current = { at: 0, group: '' };
    setHistory(kind === 'undo' ? { undo: history.undo.slice(0, -1), redo: [...history.redo, step] } : { redo: history.redo.slice(0, -1), undo: [...history.undo, step] });
    schedule();
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current || saving.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const publish = () => { setBusy(true); setNotice(''); void roomApi(`/api/host/games/${gameId}/publish`, { expectedRevision: revision.current }).then(data => { const saved = DraftSchema.parse(data); receive.current(saved); setNotice(`Published as version ${saved.published?.number}.`); }).catch(() => setNotice('Publishing did not work. Fix the problems listed and try again.')).finally(() => setBusy(false)); };
  // The tab opens on the click itself (popup blockers allow that) and is pointed at the room once it exists.
  const openRoom = (path: string, body: object, failure: (code: string) => string) => {
    setBusy(true); setNotice(''); const tab = window.open('about:blank', '_blank');
    void roomApi<{ sessionId: string }>(path, body).then(result => { const url = `/?room=${result.sessionId}`; if (tab) tab.location.href = url; else window.open(url, '_blank'); })
      .catch(cause => { tab?.close(); setNotice(failure(cause instanceof Error ? cause.message : '')); }).finally(() => setBusy(false));
  };
  const play = () => openRoom('/api/host/rooms', { gameId, sessionId: newId(), commandId: newId() }, () => 'Publish the game before playing it.');
  /** Practise the current draft without publishing it, from the start or from one scene. */
  const rehearse = (startNodeKey: string | null) => openRoom(`/api/host/games/${gameId}/rehearse`, { expectedRevision: revision.current, startNodeKey, sessionId: newId(), commandId: newId() },
    code => code === 'INVALID_DEFINITION' ? (startNodeKey ? 'This scene cannot be rehearsed on its own: it needs something earlier in the game, such as the round it votes on or the teams it uses. Try an earlier scene.' : 'Fix the problems listed before rehearsing.')
      : code === 'REVISION_CONFLICT' ? 'Someone just changed the game. Try again in a moment.' : 'Rehearsing did not work. Check the server is running and try again.');

  return { draft, loadError, definition, positions, setPositions, issues, save, notice, setNotice, busy, load, change, publish, play, rehearse, adopt, refresh,
    undo: () => restore('undo'), redo: () => restore('redo'), canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 };
}
export type DraftState = ReturnType<typeof useDraft>;
