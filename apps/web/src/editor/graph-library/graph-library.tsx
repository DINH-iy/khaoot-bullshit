import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { authoredGraphs, AuthoredGraphsSchema, DraftSchema, type AuthoredGraph, type Draft, type GraphData } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { GraphChart } from '../../minigames/draw-the-graph/graph-chart.js';
import { roomApi } from '../../room/api.js';
import { same } from '../live/merge.js';
import { updateStage, type Definition } from '../model.js';
import { GraphFields } from '../scene/fields/graph-fields.js';
import type { DraftState } from '../shell/use-draft.js';
import { GRAPH_LIBRARY_TEXTS } from './graph-library.text.js';
import './graph-library.css';

const PAGE_SIZE = 12;
type Edit = { entry: AuthoredGraph; original: GraphData; graph: GraphData; source: Draft | null };
const locate = (definition: unknown, entry: AuthoredGraph) => authoredGraphs(definition).find(graph =>
  graph.nodeKey === entry.nodeKey && graph.stageKey === entry.stageKey && graph.inDraw === entry.inDraw);

function replaceGraph(definition: Definition, entry: AuthoredGraph, graph: GraphData) {
  const index = definition.nodes.find(node => node.key === entry.nodeKey)?.stages.findIndex(stage => stage.key === entry.stageKey) ?? -1;
  return updateStage(definition, entry.nodeKey, index, stage => {
    if (!entry.inDraw) return { ...stage, settings: { ...stage['settings'] as object, graph } };
    const draw = stage['draw'] as Record<string, unknown>[];
    const slot = draw.findIndex(game => game?.['game'] === 'draw-the-graph');
    return { ...stage, draw: draw.map((game, index) => index === slot ? { ...game, settings: { ...game['settings'] as object, graph } } : game) };
  });
}

export function GraphLibraryDialog({ d, onClose }: { d: DraftState; onClose: () => void }) {
  const t = useTexts(GRAPH_LIBRARY_TEXTS);
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [entries, setEntries] = useState<AuthoredGraph[]>();
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<Edit>();
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<'failed' | 'editFailed' | 'saveFailed' | 'conflict'>();
  const [updated, setUpdated] = useState(false);
  const graphOpen = Boolean(edit);
  const gameId = d.draft!.gameId;

  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); opener?.focus(); };
  }, []);
  useLayoutEffect(() => { if (graphOpen) heading.current?.focus(); else search.current?.focus(); }, [graphOpen]);
  useEffect(() => {
    let active = true;
    void roomApi('/api/host/graphs').then(value => {
      if (active) setEntries(AuthoredGraphsSchema.parse(value));
    }).catch(() => { if (active) setIssue('failed'); });
    return () => { active = false; };
  }, [attempt]);

  const current: AuthoredGraph[] = authoredGraphs(d.definition).map(({ graph, ...location }) => ({
    ...location, gameId, title: d.definition!.title, label: graph.yLabel, editable: d.mayEdit,
  }));
  const graphs = [...current, ...(entries ?? []).filter(entry => entry.gameId !== gameId)];
  const term = query.trim().toLocaleLowerCase();
  const filtered = graphs.filter(entry => [entry.question, entry.label, entry.title].some(value => value?.toLocaleLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shownPage = Math.min(page, pages - 1);

  async function open(entry: AuthoredGraph) {
    setIssue(undefined); setUpdated(false); setBusy(true);
    try {
      const source = entry.gameId === gameId ? null : DraftSchema.parse(await roomApi(`/api/host/games/${entry.gameId}`));
      const graph = locate(source ? source.definition : d.definition, entry)?.graph;
      if (!graph) throw new Error('Graph missing');
      setEdit({ entry: { ...entry, editable: source?.can?.includes('game.edit') ?? entry.editable }, graph, original: graph, source });
    } catch { setIssue('editFailed'); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!edit || busy || d.readOnly || !edit.entry.editable) return;
    const { entry, graph, original, source } = edit;
    if (same(graph, original)) { setEdit(undefined); setIssue(undefined); return; }
    setIssue(undefined); setBusy(true);
    try {
      const definition = (source ? source.definition : d.definition) as Definition;
      if (!same(locate(definition, entry)?.graph, original)) throw new Error('REVISION_CONFLICT');
      const next = replaceGraph(definition, entry, graph);
      if (!source) d.change(next);
      else {
        await roomApi(`/api/host/games/${entry.gameId}/draft`, { definition: next, expectedRevision: source.revision }, 'PUT');
        setEntries(list => list?.map(item => item.gameId === entry.gameId && item.nodeKey === entry.nodeKey && item.stageKey === entry.stageKey && item.inDraw === entry.inDraw
          ? { ...item, label: graph.yLabel } : item));
      }
      setEdit(undefined); setUpdated(true);
    } catch (cause) {
      setIssue(cause instanceof Error && cause.message === 'REVISION_CONFLICT' ? 'conflict' : 'saveFailed');
    } finally { setBusy(false); }
  }

  const back = () => { setEdit(undefined); setIssue(undefined); };
  const canEdit = edit?.entry.editable && !d.readOnly;
  return <dialog className="scene-preview-dialog graph-library-dialog" ref={dialog} aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!busy) edit ? back() : onClose(); }}>
    <header className="graph-library-header">
      <h2 id={title} ref={heading} tabIndex={-1}>{edit ? t(canEdit ? 'edit' : 'viewing') : t('title')}</h2>
      <button type="button" className="small-button" disabled={busy} onClick={onClose}>{t('close')}</button>
    </header>
    {edit ? <form className="graph-library-edit" onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="graph-library-edit-body">
        <div>
          <h3>{edit.entry.question || t('unnamed')}</h3>
          <p className="hint">{edit.entry.title}</p>
          <fieldset className="view-lock" disabled={!canEdit || busy}>
            <GraphFields required graph={edit.graph} onChange={graph => graph && setEdit(current => current && ({ ...current, graph }))} />
          </fieldset>
        </div>
        <GraphChart chart={edit.graph} answer={edit.graph.hidden} accessibleLabel={edit.entry.question || t('unnamed')} />
      </div>
      <footer className="graph-library-footer">
        {issue && <p className="hint warn" role="alert">{t(issue)}</p>}
        <div className="actions">
          <button type="button" className="small-button" disabled={busy} onClick={back}>{t('back')}</button>
          {canEdit && <button type="submit" className="configuration-apply" disabled={busy || issue === 'conflict'}>{t(busy ? 'saving' : 'save')}</button>}
        </div>
      </footer>
    </form> : <div className="graph-library-list">
      <label>{t('search')}<input ref={search} type="search" value={query} onChange={event => { setQuery(event.currentTarget.value); setPage(0); }} /></label>
      {updated && <p className="hint" role="status">{t('updated')}</p>}
      {issue && <p className="hint warn" role="alert">{t(issue)}</p>}
      {issue === 'failed' && <button type="button" className="small-button" onClick={() => { setIssue(undefined); setAttempt(attempt + 1); }}>{t('retry')}</button>}
      {!entries && issue !== 'failed' && <p className="hint" role="status">{t('loading')}</p>}
      {entries && !filtered.length && <p className="hint">{t(term ? 'noMatches' : 'empty')}</p>}
      {filtered.length > 0 && <ul>
        {filtered.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE).map(entry => <li key={`${entry.gameId}:${entry.nodeKey}:${entry.stageKey}`}>
          <button type="button" disabled={busy} className="graph-library-item" onClick={() => void open(entry)}>
            <strong>{entry.question || t('unnamed')}</strong>
            <small>{[entry.title, entry.label, entry.editable && !d.readOnly ? null : t('viewing')].filter(Boolean).join(' · ')}</small>
          </button>
        </li>)}
      </ul>}
      {pages > 1 && <div className="graph-library-pager">
        <button type="button" disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}>{t('prev')}</button>
        <span>{t('page', { page: shownPage + 1, total: pages })}</span>
        <button type="button" disabled={shownPage === pages - 1} onClick={() => setPage(shownPage + 1)}>{t('next')}</button>
      </div>}
    </div>}
  </dialog>;
}
