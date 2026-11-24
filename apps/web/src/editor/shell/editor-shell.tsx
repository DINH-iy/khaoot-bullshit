import { useEffect, useMemo, useRef, useState } from 'react';
import { FlowView } from '../flow/flow-view.js';
import { SceneView, sceneOrder } from '../scene/scene-view.js';
import { useLive } from '../live/use-live.js';
import { PeerBar } from '../live/presence.js';
import { LookView } from '../look/look-view.js';
import { estimateMinutes, isRoute } from '../model.js';
import { useDraft, type SaveState } from './use-draft.js';
import { AppMenu } from '../../owner/owner-nav.js';
import { hostMenuHref, useHostAccess, type HostRole } from '../../owner/use-host-access.js';
import { GameSettingsPanel } from './game-settings.js';
import { InvitePanel } from './invite-panel.js';
import { FieldLimit } from '../controls/field-limit.js';
import { ActionMenu } from '../controls/action-menu.js';
import { readMemory, rememberPlace } from './editor-memory.js';
import { EditorTour, finishEditorTour, needsEditorTour, TOUR_TEXTS } from './editor-tour.js';
import { editingAction, editingLabel, modLabel, readZoomShortcuts, rememberZoomShortcuts, type ZoomShortcuts } from '../flow/zoom-shortcuts.js';
import { HelpPanel } from './help-panel.js';
import { Icon } from '../controls/icons.js';
import { pendingClaim, useMe } from '../../people/use-me.js';
import { chooseTheme, currentTheme } from '../../theme.js';
import { ProblemsPanel } from './problems-panel.js';
import { HistoryPanel } from './history-panel.js';
import { SavePointsPanel } from './save-points-panel.js';
import { SAVE_POINT_TEXTS } from './save-points.text.js';
import { MediaLibraryDialog } from '../scene/fields/media-field.js';
import { MEDIA_TEXTS } from '../scene/fields/media.text.js';
import { useTexts } from '../../i18n/texts.js';
import { SHELL_TEXTS } from './shell.text.js';
import '../editor.css';

const SAVE_TEXT = { saved: 'saved', pending: 'pending', saving: 'saving', error: 'saveError' } as const satisfies Record<SaveState, keyof typeof SHELL_TEXTS.en>;
type View = 'flow' | 'scene' | 'look';
const VIEW_NAMES = { flow: 'viewFlow', scene: 'viewScene', look: 'viewLook' } as const satisfies Record<View, keyof typeof SHELL_TEXTS.en>;
const VIEW_ICONS = { flow: 'route', scene: 'edit', look: 'tidy' } as const satisfies Record<View, string>;
const COMPACT_HEADER = '(max-width: 1320px)';

/**
 * The editor page: the owner or editor bar (when signed in) above the editors. An
 * invite link (…#person=<key>) signs this device in first; the editor waits for it.
 */
export function EditorShell({ gameId }: { gameId: string }) {
  const [ready, setReady] = useState(() => !pendingClaim()); const t = useTexts(SHELL_TEXTS);
  useEffect(() => { const claim = pendingClaim(); if (claim) void claim.finally(() => setReady(true)); }, []);
  return ready ? <EditorPage gameId={gameId} /> : <main className="editor-message"><p role="status">{t('signingIn')}</p></main>;
}

function EditorPage({ gameId }: { gameId: string }) {
  const access = useHostAccess()?.role;
  const role = access === 'owner' || access === 'editor' ? access : null;
  const { person } = useMe();
  const historyIdentity = role === 'owner' ? 'owner' : role === 'editor' ? person?.id : undefined;
  // No separate bar above the editor: its own "p." logo opens the other places (AppMenu), so it keeps one header.
  return <div className="editor-page"><EditorBody key={gameId} gameId={gameId} role={role} historyIdentity={historyIdentity} /><FieldLimit /></div>;
}

/** Both editors over one draft: the Flow editor (the map) and the Scene editor (slide by slide). */
function EditorBody({ gameId, role, historyIdentity }: { gameId: string; role: HostRole | null; historyIdentity: string | undefined }) {
  const d = useDraft(gameId, historyIdentity); const t = useTexts(SHELL_TEXTS);
  const mediaText = useTexts(MEDIA_TEXTS); const savePointText = useTexts(SAVE_POINT_TEXTS); const tourText = useTexts(TOUR_TEXTS);
  const [tour, setTour] = useState(needsEditorTour);
  const [zoomShortcuts, setZoomShortcuts] = useState(readZoomShortcuts);
  const changeZoomShortcuts = (shortcuts: ZoomShortcuts) => { setZoomShortcuts(shortcuts); rememberZoomShortcuts(shortcuts); };
  const [rehearsing, setRehearsing] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [compactHeader, setCompactHeader] = useState(() => matchMedia(COMPACT_HEADER).matches);
  useEffect(() => {
    const query = matchMedia(COMPACT_HEADER);
    const update = () => setCompactHeader(query.matches);
    query.addEventListener('change', update);
    update();
    return () => query.removeEventListener('change', update);
  }, []);
  // Coming back opens the same place (K2): the link's view wins, then what was open last time in this browser.
  const [memory] = useState(() => readMemory(gameId)); const [helping, setHelping] = useState(false); const [theme, setTheme] = useState(currentTheme);
  const [view, setViewState] = useState<View>(() => { const wanted = new URLSearchParams(location.search).get('view'); return wanted === 'flow' || wanted === 'scene' || wanted === 'look' ? wanted : memory.view ?? 'flow'; });
  const [selected, setSelected] = useState<string[]>(memory.selected ?? []);
  // A scene to bring into view on the map (from the problems box); `at` makes the same scene count again.
  const [focus, setFocus] = useState<{ key: string; at: number } | null>(null);
  const [exporting, setExporting] = useState(memory.panel === 'export'); const [settings, setSettings] = useState(memory.panel === 'settings'); const [inviting, setInviting] = useState(memory.panel === 'invite');
  const [savePoints, setSavePoints] = useState(memory.panel === 'savePoints');
  // Remembered scenes that no longer exist (deleted meanwhile) are dropped once the game is loaded.
  const checked = useRef(false);
  useEffect(() => { if (!d.definition || checked.current) return; checked.current = true; const keys = new Set(d.definition.nodes.map(node => node.key)); setSelected(current => current.filter(key => keys.has(key))); }, [d.definition]);
  useEffect(() => { rememberPlace(gameId, { view, selected, panel: settings ? 'settings' : inviting ? 'invite' : exporting ? 'export' : savePoints ? 'savePoints' : null }); }, [gameId, view, selected, settings, inviting, exporting, savePoints]);
  const openPanel = (panel: 'settings' | 'invite' | 'export' | 'savePoints') => { setSettings(panel === 'settings'); setInviting(panel === 'invite'); setExporting(panel === 'export'); setSavePoints(panel === 'savePoints'); };
  // What others see of you: the scenes you have selected (in the Scene editor, the one you are on).
  const first = useMemo(() => d.definition ? sceneOrder(d.definition).rows[0]?.node.key : undefined, [d.definition]);
  const working = useMemo(() => view === 'scene' ? [selected[0] ?? first].filter(key => key !== undefined) : selected, [view, selected, first]);
  const live = useLive(gameId, { view, selected: working }, d.adopt, d.refresh);
  const setView = (next: View) => { setViewState(next); const url = new URL(location.href); url.searchParams.set('view', next); history.replaceState(null, '', url); };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      // Ctrl/⌘ + S anywhere (also while typing): the game saves itself, so this opens Save points to keep a copy.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') { event.preventDefault(); openPanel('savePoints'); return; }
      if ((event.target as HTMLElement).closest('input, textarea, select, [role=combobox], dialog, [aria-modal=true], [contenteditable]')) return;
      const action = editingAction(event, zoomShortcuts);
      if (action === 'help') { event.preventDefault(); setHelping(true); }
      if (action === 'undo' || action === 'redo') { event.preventDefault(); d[action](); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  const gamesHref = hostMenuHref(role);
  if (d.loadError) return <main className="editor-message"><p role="alert" className="error">{d.loadError}</p>{gamesHref && <p><a href={gamesHref}>{t('backToGames')}</a></p>}</main>;
  if (!d.definition || !d.draft) return <main className="editor-message"><p role="status">{t('opening')}</p></main>;
  const { definition, draft } = d; const nodes = definition.nodes; const routes = nodes.filter(isRoute).length;
  const gamesLabel = t(draft.builtIn && role === 'owner' ? 'builtInGames' : 'yourGames');
  const ready = d.issues.length === 0 && d.save === 'saved';
  // Problems of the whole game (not on a scene) are fixed in Game settings: the ☰ menu and that item show them.
  const gameIssues = d.issues.filter(issue => !issue.nodeKey || !definition.nodes.some(node => node.key === issue.nodeKey)); const gameProblems = gameIssues.length;
  const problemCount = t(d.issues.length === 1 ? 'problemOne' : 'problemMany', { count: d.issues.length });
  // Rehearsing skips scenes it cannot reach from where it starts (work in progress), as the server does:
  // only problems of the whole game and of the scenes it would play stop it. Publishing needs every problem fixed.
  const blocking = (start: string | undefined) => {
    if (!start) return 0; const reached = new Set<string>(); const queue = [start];
    while (queue.length) { const key = queue.shift()!; if (reached.has(key)) continue; reached.add(key); for (const edge of definition.edges) if (edge.from === key) queue.push(edge.to); }
    return d.issues.filter(issue => !issue.nodeKey || reached.has(issue.nodeKey)).length;
  };
  const fromStart = blocking(definition.startNodeKey); const fromScene = blocking(selected[0]);
  const fix = (count: number) => t(count === 1 ? 'fixFirst' : 'fixFirstMany', { count });
    const toggleMode = () => d.setReadOnly(!d.readOnly);
  const modeLabel = t(d.readOnly ? 'viewingSwitch' : 'editingSwitch');
  const overview = `${t('minutes', { minutes: estimateMinutes(definition) })} · ${t(nodes.length === 1 ? 'sceneOne' : 'sceneMany', { count: nodes.length })}${routes ? `, ${t(routes === 1 ? 'choiceOne' : 'choiceMany', { count: routes })}` : ''} · ${d.issues.length ? problemCount : t('noProblems')}`;
  return <div className={`editor${d.readOnly ? ' viewing' : ''}`}>
    {/* The header holds the game title, save status, and actions. */}
    <header className={`editor-header${compactHeader ? ' compact-header' : ''}`}>
      <h1 className="visually-hidden">{t(VIEW_NAMES[view])}: {definition.title}</h1>
      <div className="editor-title"><AppMenu role={role} />
        <div><label className="visually-hidden" htmlFor="game-title">{t('gameName')}</label>
          <input id="game-title" className="title-input" readOnly={d.readOnly} value={definition.title} maxLength={160} onChange={event => d.change({ ...definition, title: event.target.value }, undefined, 'title')} />
          <p className="crumb" title={overview}>{gamesHref ? <a href={gamesHref}>{gamesLabel}</a> : gamesLabel}{draft.builtIn && <> / <span className="crumb-builtin" title={t('yourVersionTitle', { title: draft.builtIn.title })}>{t('yourVersionOf', { title: draft.builtIn.title })}</span></>} / {t('draft')}{draft.published ? ` · v${draft.published.number}${draft.published.matchesDraft ? '' : t('changes')}` : ''} · <span role="status" className={`save-state save-${d.save}`}>{t(SAVE_TEXT[d.save])}</span>{compactHeader && d.readOnly && <> · {t('viewing')}</>}<span className="game-overview"> · {overview}</span></p></div></div>
      <div className="editor-actions">
        {!compactHeader && <>
        <div className="history-buttons">
          <button type="button" className="icon-only" aria-label={t('undo')} title={`${t('undo')} (${editingLabel('undo', zoomShortcuts.edits.undo)})`} disabled={!d.canUndo} onClick={d.undo}><Icon name="undo" size={18} /></button>
          <button type="button" className="icon-only" aria-label={t('redo')} title={`${t('redo')} (${editingLabel('redo', zoomShortcuts.edits.redo)})`} disabled={!d.canRedo} onClick={d.redo}><Icon name="redo" size={18} /></button></div>
        {/* View mode: look through the game without changing anything by accident. One button switches. */}
        <button type="button" className={`mode-toggle${d.readOnly ? ' viewing' : ''}`} aria-label={modeLabel}
          title={t(d.readOnly ? 'viewingTitle' : 'editingTitle')} onClick={toggleMode}>
          <Icon name={d.readOnly ? 'eye' : 'edit'} size={18} /><span>{t(d.readOnly ? 'viewing' : 'editing')}</span></button>
        </>}
        {/* Trying out, publishing and playing: one menu. Each item says why when it cannot be used yet. */}
        {/* A game with problems cannot be rehearsed or published: the menu says so, and the problems are in the box at the bottom left. */}
        <ActionMenu label={t('playPublish')} text={t('playPublishText')} {...(d.issues.length || compactHeader ? { icon: compactHeader ? 'play' : 'warning' } : {})}
          intro={d.issues.length ? <span className="menu-warning" title={t('problemsTip')}><Icon name="warning" size={16} />{t('toFixFirst', { problems: problemCount })}</span> : t('rehearseIntro')} actions={[
          { label: t('rehearse'), disabled: d.busy || d.save !== 'saved', onSelect: () => setRehearsing(true) },
          // The test bench: the draft from the start, with the host screen and virtual phones side by side in one tab.
          { label: fromStart ? t('benchFix', { fix: fix(fromStart) }) : t('bench'), disabled: d.busy || d.save !== 'saved' || fromStart > 0, onSelect: () => d.rehearse(null, false, true) },
          { label: draft.published?.matchesDraft ? t('publishNothing') : d.issues.length ? t('publishFix', { problems: problemCount }) : d.save !== 'saved' ? t('publishSaving') : t('publish'),
            disabled: d.busy || !ready || Boolean(draft.published?.matchesDraft), onSelect: d.publish },
          // Opening a real room is hosting: the owner's alone. Editors rehearse instead.
          ...(role === 'owner' ? [{ label: draft.published ? t('playPublished') : t('playFirst'), disabled: d.busy || !draft.published, onSelect: d.play }] : []),
        ]} />
        <ActionMenu label={t('gameMenu')} actions={[{ label: t('gameSettings'), icon: 'gear', onSelect: () => openPanel('settings'), problems: gameProblems },
          ...(role ? [{ label: mediaText('library'), icon: 'upload', onSelect: () => setLibraryOpen(true) }] : []),
          ...(compactHeader ? [
            { label: t('undo'), icon: 'undo', disabled: !d.canUndo, onSelect: d.undo },
            { label: t('redo'), icon: 'redo', disabled: !d.canRedo, onSelect: d.redo },
            { label: modeLabel, icon: d.readOnly ? 'eye' : 'edit', onSelect: toggleMode },
          ] : []),
          { label: savePointText('menu'), icon: 'save', shortcut: `${modLabel} + S`, onSelect: () => openPanel('savePoints') },
          { label: t('invitePeople'), icon: 'invite', onSelect: () => openPanel('invite') }, { label: t('exportText'), icon: 'export', onSelect: () => openPanel('export') }, { label: t('help'), icon: 'help', shortcut: editingLabel('help', zoomShortcuts.edits.help), onSelect: () => setHelping(true) },
          { label: tourText('title'), icon: 'help', onSelect: () => setTour(true) },
          { label: t(theme === 'dark' ? 'lightMode' : 'darkMode'), icon: theme === 'dark' ? 'sun' : 'moon', onSelect: () => { const next = theme === 'dark' ? 'light' : 'dark'; chooseTheme(next); setTheme(next); } }]} />
        {/* Who is here, you last: at the far right, as in most editors. */}
        <PeerBar live={live} />
      </div>
    </header>
    {rehearsing && <RehearsalDialog title={t('rehearse')} close={t('close')} onClose={() => setRehearsing(false)} choices={[
      { label: fromStart ? t('rehearseStartFix', { fix: fix(fromStart) }) : t('rehearseStart'), blocked: fromStart > 0, run: () => d.rehearse(null) },
      { label: selected.length !== 1 ? t('rehearseSelectOne') : fromScene ? t('rehearseSceneFix', { fix: fix(fromScene) }) : t('rehearseScene'),
        blocked: selected.length !== 1 || fromScene > 0, run: () => d.rehearse(selected[0]!) },
    ]} />}
    {tour && <EditorTour onClose={() => { finishEditorTour(); setTour(false); }} />}
    {helping && <HelpPanel zoomShortcuts={zoomShortcuts} onZoomShortcuts={changeZoomShortcuts} onClose={() => setHelping(false)} />}
    {libraryOpen && <MediaLibraryDialog readOnly={d.readOnly} onClose={() => setLibraryOpen(false)} />}
    {savePoints && <SavePointsPanel gameId={gameId} d={d} onClose={() => setSavePoints(false)} />}
    {inviting && <InvitePanel gameId={gameId} role={role} onClose={() => setInviting(false)} />}
    {settings && <GameSettingsPanel readOnly={d.readOnly} definition={definition} problems={gameIssues.map(issue => ({ message: issue.message, path: issue.path ?? '' }))} onChange={(next, group) => d.change(next, undefined, group)} onLook={() => setView('look')} onClose={() => setSettings(false)} />}
    {exporting && <ExportPanel text={JSON.stringify({ ...definition, editor: { positions: d.positions } }, null, 2)} title={definition.title} onClose={() => setExporting(false)} />}
    <main className="editor-main" data-view={view}>
      {view === 'flow' ? <FlowView zoomShortcuts={zoomShortcuts} d={d} selected={selected} setSelected={setSelected} focus={focus} live={live} onHelp={() => setHelping(true)} onOpenScene={key => { setSelected([key]); setView('scene'); }} />
        : view === 'scene' ? <SceneView d={d} selected={selected} setSelected={setSelected} peers={live.peers} onOpenFlow={key => { setSelected([key]); setView('flow'); }} /> : <LookView d={d} selected={selected} gameId={gameId} />}
      {/* Bottom left: your edits (History) and every problem of the game; each folds into a small button. A problem goes to its scene. */}
      <div className="editor-bottom-tools">
        <div className="editor-corner">
          <HistoryPanel steps={d.steps} disabled={d.readOnly} onRestore={d.restore} />
          <ProblemsPanel issues={d.issues} definition={definition} onGo={key => { setSelected([key]); if (view === 'look') setView('scene'); setFocus({ key, at: Date.now() }); }} onGame={() => openPanel('settings')} />
        </div>
        <div className="tabs editor-tabs" role="tablist" aria-label={t('editorView')}>
          {(Object.keys(VIEW_NAMES) as View[]).map(key => <button key={key} type="button" role="tab" title={t(VIEW_NAMES[key])} aria-selected={view === key} onClick={() => setView(key)}>
            <span className="editor-tab-icon"><Icon name={VIEW_ICONS[key]} size={18} /></span><span className="editor-tab-label">{t(VIEW_NAMES[key])}</span>
          </button>)}
        </div>
      </div>
    </main>
  </div>;
}

function RehearsalDialog({ title, close, choices, onClose }: {
  title: string; close: string; choices: { label: string; blocked: boolean; run: () => void }[]; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="scene-preview-dialog phone-preview-dialog" aria-labelledby="rehearsal-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="scene-preview-window">
      <header><h2 id="rehearsal-title">{title}</h2><button type="button" className="small-button" onClick={onClose}>{close}</button></header>
      {choices.map(choice => <button key={choice.label} type="button" className="small-button" disabled={choice.blocked}
        onClick={() => { onClose(); choice.run(); }}>{choice.label}</button>)}
    </div>
  </dialog>;
}

/** The whole game as text: to keep a copy, or to give to an AI with a request and import its answer. */
function ExportPanel({ text, title, onClose }: { text: string; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false); const t = useTexts(SHELL_TEXTS);
  const download = () => { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `${title.replace(/[^\w-]+/g, '-').slice(0, 60) || 'game'}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <section className="export-panel" aria-labelledby="export-heading">
    <div className="inspector-head"><h2 id="export-heading">{t('exportText')}</h2><button className="small-button" onClick={onClose}>{t('close')}</button></div>
    <p className="hint">{t('exportIntro')}</p>
    <textarea readOnly value={text} aria-label={t('gameAsText')} onFocus={event => event.currentTarget.select()} />
    <div className="actions"><button onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)); }}>{t(copied ? 'copied' : 'copy')}</button><button onClick={download}>{t('download')}</button></div>
  </section>;
}
