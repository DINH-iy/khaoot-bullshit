import { useCallback, useEffect, useRef, useState } from 'react';
import { DraftSchema, type DefinitionIssue, type Draft } from '@party/contracts';
import { newId, roomApi } from '../network/api.js';
import { autoLayout, type Definition, type Positions } from './model.js';

export type SaveState = 'saved' | 'pending' | 'saving' | 'conflict' | 'error';
interface Snapshot { definition: Definition; positions: Positions }
const HISTORY = 100;

/**
 * One game draft shared by both editor views: loading, automatic saving (never
 * over a newer save), undo/redo, publishing and playing.
 */
export function useDraft(gameId: string) {
  const [draft, setDraft] = useState<Draft>(); const [loadError, setLoadError] = useState('');
  const [definition, setDefinition] = useState<Definition>(); const [positions, setPositions] = useState<Positions>({});
  const [issues, setIssues] = useState<DefinitionIssue[]>([]); const [save, setSave] = useState<SaveState>('saved');
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ undo: Snapshot[]; redo: Snapshot[] }>({ undo: [], redo: [] });
  const revision = useRef(0); const dirty = useRef(false); const saving = useRef(false); const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<{ definition?: Definition; positions: Positions }>({ positions: {} });
  latest.current = { ...(definition ? { definition } : {}), positions };
  const lastRecord = useRef<{ at: number; group: string }>({ at: 0, group: '' });

  const load = useCallback(() => {
    setLoadError('');
    void roomApi(`/api/host/games/${gameId}`).then(data => {
      const loaded = DraftSchema.parse(data); const { editor, ...game } = loaded.definition as Definition & { editor?: { positions?: Positions } };
      setDraft(loaded); setDefinition(game as Definition); setIssues(loaded.issues); revision.current = loaded.revision;
      setPositions({ ...autoLayout(game as Definition), ...(editor?.positions ?? {}) }); setSave('saved'); dirty.current = false;
      setHistory({ undo: [], redo: [] });
    }).catch(() => setLoadError('This game could not be opened. It may have been removed, or the server is not running.'));
  }, [gameId]);
  useEffect(load, [load]);

  const flush = useCallback(async () => {
    const current = latest.current; if (!current.definition || saving.current || !dirty.current) return;
    saving.current = true; dirty.current = false; setSave('saving');
    const keys = new Set(current.definition.nodes.map(node => node.key));
    const kept = Object.fromEntries(Object.entries(current.positions).filter(([key]) => keys.has(key)));
    try {
      const saved = DraftSchema.parse(await roomApi(`/api/host/games/${gameId}/draft`, { expectedRevision: revision.current, definition: { ...current.definition, editor: { positions: kept } } }, 'PUT'));
      revision.current = saved.revision; setIssues(saved.issues); setDraft(saved);
      setSave(dirty.current ? 'pending' : 'saved');
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'REVISION_CONFLICT') { setSave('conflict'); return; }
      dirty.current = true; setSave('error');
    } finally { saving.current = false; }
    if (dirty.current) timer.current = setTimeout(() => { void flush(); }, 1500);
  }, [gameId]);
  const schedule = useCallback(() => { dirty.current = true; setSave('pending'); clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(); }, 700); }, [flush]);

  /**
   * Applies an edit. Each edit is one undo step, except that quick successive
   * edits in the same `group` (typing in one field) are merged.
   */
  const change = useCallback((next: Definition, nextPositions?: Positions, group = '', before?: Positions) => {
    if (save === 'conflict') return;
    const current = latest.current; const now = Date.now();
    if (current.definition && !(group && group === lastRecord.current.group && now - lastRecord.current.at < 1200)) {
      // `before`: card positions from before a drag, since the screen already shows the dragged ones.
      const snapshot = { definition: current.definition, positions: before ?? current.positions };
      setHistory(previous => ({ undo: [...previous.undo.slice(-HISTORY + 1), snapshot], redo: [] }));
    }
    lastRecord.current = { at: now, group };
    setDefinition(next); if (nextPositions) setPositions(nextPositions);
    schedule();
  }, [save, schedule]);
  const restore = (from: 'undo' | 'redo') => {
    const current = latest.current; const stack = history[from]; const target = stack.at(-1);
    if (!current.definition || !target || save === 'conflict') return;
    const snapshot = { definition: current.definition, positions: current.positions };
    setDefinition(target.definition); setPositions(target.positions); lastRecord.current = { at: 0, group: '' };
    setHistory(from === 'undo' ? { undo: stack.slice(0, -1), redo: [...history.redo, snapshot] } : { redo: stack.slice(0, -1), undo: [...history.undo, snapshot] });
    schedule();
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current || saving.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const publish = () => { setBusy(true); setNotice(''); void roomApi(`/api/host/games/${gameId}/publish`, { expectedRevision: revision.current }).then(data => { const saved = DraftSchema.parse(data); setDraft(saved); setNotice(`Published as version ${saved.published?.number}.`); }).catch(() => setNotice('Publishing did not work. Fix the problems listed and try again.')).finally(() => setBusy(false)); };
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
      : code === 'REVISION_CONFLICT' ? 'The game was changed in another tab. Load the latest version first.' : 'Rehearsing did not work. Check the server is running and try again.');

  return { draft, loadError, definition, positions, setPositions, issues, save, notice, setNotice, busy, load, change, publish, play, rehearse,
    undo: () => restore('undo'), redo: () => restore('redo'), canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 };
}
export type DraftState = ReturnType<typeof useDraft>;
