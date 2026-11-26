import { forgetEditedGame, rememberEditedGame } from '../../owner/last-game.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DraftSchema, type DefinitionIssue, type Draft } from '@party/contracts';
import { newId, roomApi } from '../../room/api.js';
import { isUnavailablePageError, replaceWithHome } from '../../navigation.js';
import { convertLegacyTeams, type Definition, type Positions } from '../model.js';
import { combine, fromDoc, toDoc, type Doc, type Snapshot } from '../live/document.js';
import { same } from '../live/merge.js';
import { useLanguage } from '../../i18n/language.js';
import { localizeDiagnostics } from './diagnostics.js';
import { HISTORY_LIMIT, readEditHistory, writeEditHistory, type EditHistory } from './history-storage.js';
import { describeStep } from './history-labels.js';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';
/**
 * One game draft shared by both editor views: loading, automatic saving, undo/redo,
 * publishing and playing. Several people can edit at once: a save by someone
 * else is merged into this copy (see live/document.ts), never overwritten.
 */
const MODE_KEY = 'party-editor-mode';
export function useDraft(gameId: string, historyIdentity: string | undefined) {
  const [draft, setDraft] = useState<Draft>(); const [loadError, setLoadError] = useState('');
  const [definition, setDefinition] = useState<Definition>(); const [positions, setPositions] = useState<Positions>({});
  const [issues, setIssues] = useState<DefinitionIssue[]>([]); const [save, setSave] = useState<SaveState>('saved');
  const language = useLanguage();
  const displayIssues = useMemo(() => localizeDiagnostics(issues, language), [issues, language]);
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  // View mode: look through the game without changing it by accident. Every edit passes `change` (and undo/redo),
  // so this one switch is what makes viewing safe; the screens also lock their controls. Remembered in this browser.
  const [chosenReadOnly, setReadOnlyState] = useState(() => { try { return localStorage.getItem(MODE_KEY) === 'view'; } catch { return false; } });
  // What one may do with this game (the server says, and checks again on every request): without "change", viewing only.
  const can = (permission: string) => !draft?.can || draft.can.includes(permission);
  const mayEdit = can('game.edit');
  const readOnly = chosenReadOnly || !mayEdit;
  const viewing = useRef(readOnly); viewing.current = readOnly;
  const setReadOnly = (next: boolean) => { if (!mayEdit) return; setReadOnlyState(next); try { localStorage.setItem(MODE_KEY, next ? 'view' : 'edit'); } catch { /* storage blocked: this visit only */ } };
  const [history, setHistory] = useState<EditHistory>({ undo: [], redo: [] });
  const [loadedHistory, setLoadedHistory] = useState<string>();
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
    let mounted = true;
    setLoadError('');
    void roomApi(`/api/host/games/${gameId}`).then(data => {
      if (!mounted) return;
      const loaded = DraftSchema.parse(data);
      rememberEditedGame(gameId);
      setDraft(loaded); setIssues(loaded.issues); revision.current = loaded.revision; server.current = loaded.definition as Doc; waiting.current = undefined;
      show(fromDoc(loaded.definition as Doc)); setSave('saved'); dirty.current = false;
      // A game from before Pick teams scenes gets its teams as a scene at the start (left of the old start), and is saved like that.
      const opened = fromDoc(loaded.definition as Doc); const converted = convertLegacyTeams(opened.definition);
      if (converted) {
        const start = opened.positions[opened.definition.startNodeKey] ?? { x: 0, y: 0 };
        show({ definition: converted.definition, positions: { ...opened.positions, ...(converted.added ? { [converted.added]: { x: start.x - 320, y: start.y } } : {}) } });
        setNotice('The teams of this game are now made in a Pick teams scene at the start.'); schedule();
      }
    }).catch((cause: unknown) => {
      if (!mounted) return;
      forgetEditedGame(gameId);
      if (isUnavailablePageError(cause)) replaceWithHome();
      else setLoadError('This game could not be opened. Try reloading the page.');
    });
    return () => { mounted = false; };
  }, [gameId]);
  useEffect(load, [load]);
  const draftLoaded = draft?.gameId === gameId;
  useEffect(() => {
    if (!draftLoaded || !historyIdentity || loadedHistory === historyIdentity) return;
    setHistory(previous => loadedHistory === undefined && (previous.undo.length || previous.redo.length) ? previous : readEditHistory(historyIdentity, gameId));
    setLoadedHistory(historyIdentity);
  }, [draftLoaded, gameId, historyIdentity, loadedHistory]);
  useEffect(() => {
    if (draftLoaded && historyIdentity && loadedHistory === historyIdentity && save === 'saved') writeEditHistory(historyIdentity, gameId, history);
  }, [draftLoaded, gameId, history, historyIdentity, loadedHistory, save]);

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
    const current = latest.current; const now = Date.now(); if (!current.definition || viewing.current) return;
    // `before`: card positions from before a drag, since the screen already shows the dragged ones.
    const from = { definition: current.definition, positions: before ?? current.positions }; const to = { definition: next, positions: nextPositions ?? current.positions };
    const grouped = Boolean(group) && group === lastRecord.current.group && now - lastRecord.current.at < 1200;
    setHistory(previous => {
      if (grouped && previous.undo.length) { const first = previous.undo.at(-1)!.before; return { undo: [...previous.undo.slice(0, -1), { before: first, after: to, label: describeStep(first as Required<Snapshot>, to as Required<Snapshot>), at: now }], redo: [] }; }
      return { undo: [...previous.undo.slice(-HISTORY_LIMIT + 1), { before: from, after: to, label: describeStep(from as Required<Snapshot>, to as Required<Snapshot>), at: now }], redo: [] };
    });
    lastRecord.current = { at: now, group };
    show(to); schedule();
  }, [schedule]);
  /**
   * Undo and redo touch only what that step of yours changed. Whatever other
   * people did since stays, also where they changed the very same field.
   */
  /** Undoes (or redoes) `count` of your steps at once, newest first: the history list jumps this way. */
  const restore = (kind: 'undo' | 'redo', count = 1) => {
    if (viewing.current) return;
    let current = latest.current as Snapshot; if (!current.definition) return;
    const undo = [...history.undo]; const redo = [...history.redo];
    for (let index = 0; index < count; index++) {
      const step = (kind === 'undo' ? undo : redo).pop(); if (!step) break;
      const [from, to] = kind === 'undo' ? [step.after, step.before] : [step.before, step.after];
      current = fromDoc(combine(toDoc(from), toDoc(current), toDoc(to)));
      (kind === 'undo' ? redo : undo).push(step);
    }
    show(current); lastRecord.current = { at: 0, group: '' };
    setHistory({ undo, redo });
    schedule();
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current || saving.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const publish = () => { setBusy(true); setNotice(''); void roomApi(`/api/host/games/${gameId}/publish`, { expectedRevision: revision.current }).then(data => { const saved = DraftSchema.parse(data); receive.current(saved); setNotice(`Published as version ${saved.published?.number}.`); }).catch(() => setNotice('Publishing did not work. Fix the problems listed and try again.')).finally(() => setBusy(false)); };
  // The tab opens on the click itself (popup blockers allow that) and is pointed at the room once it exists.
  // A named tab (one per game) is reused: rehearsing again shows the new room where the last one was.
  const openRoom = (path: string, body: object, failure: (code: string) => string, tabName = '_blank', page = (sessionId: string) => `/?room=${sessionId}`) => {
    setBusy(true); setNotice(''); const tab = window.open(tabName === '_blank' ? 'about:blank' : '', tabName);
    // Only a tab opened just now (still blank) is closed when it fails; a reused one keeps its room.
    const fresh = (() => { try { return tab?.location.href === 'about:blank'; } catch { return false; } })();
    void roomApi<{ sessionId: string }>(path, body).then(result => { const url = page(result.sessionId); if (tab) tab.location.href = url; else window.open(url, tabName); })
      .catch(cause => { if (fresh) tab?.close(); setNotice(failure(cause instanceof Error ? cause.message : '')); }).finally(() => setBusy(false));
  };
  const play = () => openRoom('/api/host/rooms', { gameId, sessionId: newId(), commandId: newId() }, () => 'Publish the game before playing it.');
  /**
   * Practise the current draft without publishing it, from the start or from one scene (`only`: just that scene).
   * `bench`: open the practice room on the test bench (the host screen with virtual phones beside it) in its own tab.
   */
  const rehearse = (startNodeKey: string | null, only = false, bench = false) => openRoom(`/api/host/games/${gameId}/rehearse`, { expectedRevision: revision.current, startNodeKey, ...(only ? { only: true } : {}), sessionId: newId(), commandId: newId() },
    code => code === 'INVALID_DEFINITION' ? (startNodeKey ? 'This scene cannot be played on its own: it needs something earlier in the game, such as the teams it plays in. Use Rehearse from here on an earlier scene.' : 'Fix the problems listed before rehearsing.')
      : code === 'REVISION_CONFLICT' ? 'Someone just changed the game. Try again in a moment.' : 'Rehearsing did not work. Check the server is running and try again.', `${bench ? 'bench' : 'rehearse'}-${gameId}`,
      bench ? sessionId => `/?bench=${sessionId}` : undefined);

  return { draft, loadError, definition, positions, setPositions, issues: displayIssues, save, saveNow: flush, notice, setNotice, busy, load, change, publish, play, rehearse, adopt, refresh, readOnly, setReadOnly, can, mayEdit,
    undo: () => restore('undo'), redo: () => restore('redo'), restore,
    // Your steps in words, for the history list: done (oldest first) and undone (the next redo last).
    steps: { undo: history.undo.map(step => ({ label: step.label, at: step.at })), redo: history.redo.map(step => ({ label: step.label, at: step.at })) }, canUndo: !readOnly && history.undo.length > 0, canRedo: !readOnly && history.redo.length > 0 };
}
export type DraftState = ReturnType<typeof useDraft>;
