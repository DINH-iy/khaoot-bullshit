import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { authoredGraphs, AuthoredGraphsSchema, DraftSchema, graphDataKey, type AuthoredGraph, type Draft, type GraphData } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { GRAPH_TEXTS } from '../../minigames/draw-the-graph/graph.text.js';
import { GraphDataImport } from '../scene/fields/graph-data-import.js';
import { addStoredGraphs, storedGraphs } from './stored-graphs.js';
import { PageButtons } from '../../ui/paged-result-list.js';
import { Icon } from '../controls/icons.js';
import { roomApi } from '../../room/api.js';
import { same } from '../live/merge.js';
import { updateStage, type Definition } from '../model.js';
import { GraphPreviewButton, GraphPreviewDialog } from '../scene/fields/graph-preview-button.js';
import { GraphFields } from '../scene/fields/graph-fields.js';
import type { DraftState } from '../shell/use-draft.js';
import { GRAPH_LIBRARY_TEXTS } from './graph-library.text.js';
import './graph-library.css';

const PAGE_SIZE = 12;
type Edit = { entry: AuthoredGraph; original: GraphData; graph: GraphData; question: string; source: Draft | null };
const sameLocation = (left: AuthoredGraph, right: AuthoredGraph) =>
  left.gameId === right.gameId && left.nodeKey === right.nodeKey && left.stageKey === right.stageKey &&
  left.inDraw === right.inDraw && left.stored === right.stored;
const locate = (definition: unknown, entry: AuthoredGraph) => authoredGraphs(definition).find(graph =>
  graph.nodeKey === entry.nodeKey && graph.stageKey === entry.stageKey && graph.inDraw === entry.inDraw && graph.stored === entry.stored);

function replaceGraph(definition: Definition, entry: AuthoredGraph, graph?: GraphData, question?: string) {
  if (entry.stored) return { ...definition, graphLibrary: storedGraphs(definition).flatMap(item => {
    if (item.key !== entry.nodeKey) return [item];
    return graph ? [{ ...item, graph, question: question || item.question }] : [];
  }) };
  const settings = (previous: unknown) => {
    const next = { ...previous as Record<string, unknown> };
    if (graph) next['graph'] = graph;
    else delete next['graph'];
    return next;
  };
  const index = definition.nodes.find(node => node.key === entry.nodeKey)?.stages.findIndex(stage => stage.key === entry.stageKey) ?? -1;
  return updateStage(definition, entry.nodeKey, index, stage => {
    if (!entry.inDraw) return { ...stage, ...(question === undefined ? {} : { prompt: question }), settings: settings(stage['settings']) };
    const draw = stage['draw'] as Record<string, unknown>[];
    return { ...stage, draw: draw.map(game => game['game'] === 'draw-the-graph' ? { ...game, settings: settings(game['settings']) } : game) };
  });
}

export function GraphLibraryDialog({ d, onClose }: { d: DraftState; onClose: () => void }) {
  const t = useTexts(GRAPH_LIBRARY_TEXTS);
  const graphText = useTexts(GRAPH_TEXTS);
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [entries, setEntries] = useState<AuthoredGraph[]>();
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [importing, setImporting] = useState(false);
  const [edit, setEdit] = useState<Edit>();
  const [preview, setPreview] = useState<{ definition: Definition; graph: GraphData; question: string }>();
  const [deleting, setDeleting] = useState<AuthoredGraph>();
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<'failed' | 'editFailed' | 'saveFailed' | 'deleteFailed' | 'conflict'>();
  const [notice, setNotice] = useState<'updated' | 'imported' | 'deleted'>();
  const graphOpen = Boolean(edit || deleting) || importing;
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
    ...location, gameId, title: d.definition!.title, label: graph.yLabel, sourceUrl: graph.sourceUrl, sourceSeries: graph.sourceSeries, dataKey: graphDataKey(graph), editable: d.mayEdit,
  }));
  const graphs = [...current, ...(entries ?? []).filter(entry => entry.gameId !== gameId)];
  const term = query.trim().toLocaleLowerCase();
  const filtered = graphs.filter(entry => [entry.question, entry.label, entry.title].some(value => value?.toLocaleLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shownPage = Math.min(page, pages - 1);
  useLayoutEffect(() => { results.current?.scrollTo({ top: 0 }); }, [shownPage, query]);

  const findSource = async (entry: AuthoredGraph) =>
    entry.gameId === gameId ? null : DraftSchema.parse(await roomApi(`/api/host/games/${entry.gameId}`));

  async function persist(entry: AuthoredGraph, next: Definition, source: Draft | null) {
    if (source) await roomApi(`/api/host/games/${entry.gameId}/draft`, { definition: next, expectedRevision: source.revision }, 'PUT');
    else d.change(next);
  }

  async function open(entry: AuthoredGraph, mode: 'edit' | 'preview' = 'edit') {
    if (busy) return;
    setIssue(undefined); setNotice(undefined); setBusy(true);
    try {
      const source = await findSource(entry);
      const definition = (source ? source.definition : d.definition) as Definition;
      const original = locate(definition, entry);
      if (!original) throw new Error('Graph missing');
      if (mode === 'preview') setPreview({ definition, graph: original.graph, question: original.question });
      else setEdit({ entry: { ...entry, question: original.question, editable: source?.can?.includes('game.edit') ?? entry.editable },
        graph: original.graph, original: original.graph, question: original.question, source });
    } catch { setIssue('editFailed'); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!edit || busy || d.readOnly || !edit.entry.editable) return;
    const { entry, graph, original, source } = edit;
    const question = edit.question.trim();
    if (entry.stored && !question) return;
    if (same(graph, original) && question === entry.question) { setEdit(undefined); setIssue(undefined); return; }
    setIssue(undefined); setBusy(true);
    try {
      const definition = (source ? source.definition : d.definition) as Definition;
      const current = locate(definition, entry);
      if (!same(current?.graph, original) || current?.question !== entry.question) throw new Error('REVISION_CONFLICT');
      const next = replaceGraph(definition, entry, graph, question !== entry.question ? question : undefined);
      await persist(entry, next, source);
      if (source) setEntries(list => list?.map(item => sameLocation(item, entry)
        ? { ...item, question, label: graph.yLabel, dataKey: graphDataKey(graph) } : item));
      setEdit(undefined); setNotice('updated');
    } catch (cause) {
      setIssue(cause instanceof Error && cause.message === 'REVISION_CONFLICT' ? 'conflict' : 'saveFailed');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!deleting || busy || d.readOnly || !deleting.editable) return;
    const entry = deleting;
    setIssue(undefined); setBusy(true);
    try {
      const source = await findSource(entry);
      if (source?.can && !source.can.includes('game.edit')) throw new Error('Edit access removed');
      const definition = (source ? source.definition : d.definition) as Definition;
      const current = locate(definition, entry);
      if (!current || current.question !== entry.question || graphDataKey(current.graph) !== entry.dataKey) throw new Error('REVISION_CONFLICT');
      await persist(entry, replaceGraph(definition, entry), source);
      if (source) setEntries(list => list?.filter(item => !sameLocation(item, entry)));
      setDeleting(undefined); setNotice('deleted');
    } catch (cause) {
      setIssue(cause instanceof Error && cause.message === 'REVISION_CONFLICT' ? 'conflict' : 'deleteFailed');
    } finally { setBusy(false); }
  }

  const back = () => { setEdit(undefined); setIssue(undefined); };
  const canEdit = edit?.entry.editable && !d.readOnly;
  const previewRoot = preview && dialog.current?.closest('.editor');
  return <dialog className="scene-preview-dialog graph-library-dialog"
    data-view={deleting ? 'delete' : importing ? 'import' : edit ? 'edit' : 'list'} ref={dialog} aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!busy) { if (deleting) { setDeleting(undefined); setIssue(undefined); } else if (importing) setImporting(false); else if (edit) back(); else onClose(); } }}>
    <header className="graph-library-header">
      <h2 id={title} ref={heading} tabIndex={-1}>{deleting ? t('deleteTitle') : importing ? graphText('importData') : edit ? t(canEdit ? 'edit' : 'viewing') : t('title')}</h2>
      <div className="graph-library-header-actions">
        {!edit && !importing && !deleting && !d.readOnly && <button type="button" className="accent with-icon" onClick={() => { setNotice(undefined); setImporting(true); }}>
          <Icon name="bars" size={18} />{graphText('importShort')}
        </button>}
        {edit && d.definition && <GraphPreviewButton definition={(edit.source?.definition ?? d.definition) as Definition} graph={edit.graph} question={edit.question} />}
        <button type="button" className="small-button" disabled={busy}
          onClick={() => { if (deleting) { setDeleting(undefined); setIssue(undefined); } else if (importing) setImporting(false); else onClose(); }}>
          {importing || deleting ? t('back') : t('close')}</button>
      </div>
    </header>
    {deleting ? <div className="graph-library-list">
      <strong>{deleting.question || t('unnamed')}</strong>
      <p className="hint">{t(deleting.stored ? 'deleteStored' : 'deleteScene')}</p>
      {issue && <p className="hint warn" role="alert">{t(issue)}</p>}
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => { setDeleting(undefined); setIssue(undefined); }}>{t('cancel')}</button>
        <button type="button" className="danger" disabled={busy || issue === 'conflict'} onClick={() => void remove()}>{t(busy ? 'deleting' : 'deleteTitle')}</button>
      </div>
    </div> : importing && d.definition ? <div className="graph-library-import">
      {notice === 'imported' && <p className="graph-library-import-status" role="status">{t('imported')}</p>}
      <GraphDataImport definition={d.definition} gameId={gameId} destination="library" onImport={(picked, others) => {
        d.change(addStoredGraphs(d.definition!, picked ? [picked, ...others] : others));
        setNotice('imported');
      }} />
    </div> : edit ? <form className="graph-library-edit" onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="graph-dialog-body graph-library-edit-body">
        <div className="graph-dialog-surface">
          <fieldset className="view-lock" disabled={!canEdit || busy}>
            <div className="graph-library-edit-title">
              <p className="hint">{edit.entry.title}</p>
              {canEdit && !edit.entry.inDraw ? <label>{t('question')}<input value={edit.question} maxLength={500} required={Boolean(edit.entry.stored)}
                onChange={event => { const question = event.currentTarget.value; setEdit(current => current && ({ ...current, question })); }} /></label>
                : <h3>{edit.entry.question || t('unnamed')}</h3>}
            </div>
            <GraphFields required readOnly={!canEdit || busy} graph={edit.graph} onChange={graph => graph && setEdit(current => current && ({ ...current, graph }))} />
          </fieldset>
        </div>
      </div>
      <footer className="graph-library-footer graph-library-edit-footer">
        {issue && <p className="hint warn" role="alert">{t(issue)}</p>}
        <div className="actions">
          <button type="button" className="small-button" disabled={busy} onClick={back}>{t('back')}</button>
          {canEdit && <button type="submit" className="configuration-apply" disabled={busy || issue === 'conflict'}>{t(busy ? 'saving' : 'save')}</button>}
        </div>
      </footer>
    </form> : <div className="graph-library-browser">
      <div className="graph-library-toolbar">
        <label>{t('search')}<input ref={search} type="search" value={query} onChange={event => { setQuery(event.currentTarget.value); setPage(0); }} /></label>
        {notice && <p className="hint" role="status">{t(notice)}</p>}
        {issue && <p className="hint warn" role="alert">{t(issue)}</p>}
        {issue === 'failed' && <button type="button" className="small-button" onClick={() => { setIssue(undefined); setAttempt(attempt + 1); }}>{t('retry')}</button>}
      </div>
      <div className="graph-library-results" ref={results}>
        {!entries && issue !== 'failed' && <p className="hint" role="status">{t('loading')}</p>}
        {entries && !filtered.length && <p className="hint">{t(term ? 'noMatches' : 'empty')}</p>}
        {filtered.length > 0 && <ul>
          {filtered.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE).map(entry => {
            const name = entry.question || t('unnamed');
            const editable = entry.editable && !d.readOnly;
            return <li className="graph-library-row" key={`${entry.gameId}:${entry.nodeKey}:${entry.stageKey}:${Boolean(entry.stored)}`}>
              <button type="button" disabled={busy} className="graph-library-item" onClick={() => void open(entry)}>
                <strong>{name}</strong>
                <small>{[entry.title, entry.label, editable ? null : t('viewing')].filter(Boolean).join(' · ')}</small>
              </button>
              <div className="graph-library-row-actions">
                <button type="button" className="small-button icon-only" aria-disabled={busy} aria-haspopup="dialog"
                  aria-label={t('previewNamed', { name })} title={t('previewGraph')} onClick={() => void open(entry, 'preview')}>
                  <Icon name="eye" size={16} />
                </button>
                {editable && <>
                  <button type="button" className="small-button icon-only" disabled={busy} aria-label={t('editNamed', { name })} title={t('edit')} onClick={() => void open(entry)}>
                    <Icon name="edit" size={16} />
                  </button>
                  <button type="button" className="small-button icon-only danger-icon" disabled={busy} aria-label={t('deleteNamed', { name })} title={t('deleteTitle')}
                    onClick={() => { setNotice(undefined); setIssue(undefined); setDeleting(entry); }}>
                    <Icon name="trash" size={16} />
                  </button>
                </>}
              </div>
            </li>;
          })}
        </ul>}
      </div>
      {pages > 1 && <footer className="graph-library-footer">
        <PageButtons page={shownPage} pages={pages} onPage={setPage} label={t('page', { page: shownPage + 1, total: pages })} />
      </footer>}
    </div>}
    {preview && previewRoot && <GraphPreviewDialog {...preview} root={previewRoot} onClose={() => setPreview(undefined)} />}
  </dialog>;
}
