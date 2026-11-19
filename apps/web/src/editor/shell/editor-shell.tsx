import { useEffect, useMemo, useRef, useState } from 'react';
import { FlowView } from '../flow/flow-view.js';
import { SceneView, sceneOrder } from '../scene/scene-view.js';
import { useLive } from '../live/use-live.js';
import { PeerBar } from '../live/presence.js';
import { LookView } from '../look/look-view.js';
import { estimateMinutes, isRoute } from '../model.js';
import { useDraft, type SaveState } from './use-draft.js';
import { AppMenu, useHostRole, type HostRole } from '../../owner/owner-nav.js';
import { GameSettingsPanel } from './game-settings.js';
import { InvitePanel } from './invite-panel.js';
import { FieldLimit } from '../controls/field-limit.js';
import { ActionMenu } from '../controls/action-menu.js';
import { readMemory, rememberPlace } from './editor-memory.js';
import { HelpPanel } from './help-panel.js';
import { Icon } from '../controls/icons.js';
import { pendingClaim } from '../../people/use-me.js';
import { chooseTheme, currentTheme } from '../../theme.js';
import { ProblemsPanel } from './problems-panel.js';
import { HistoryPanel } from './history-panel.js';
import { useTexts } from '../../i18n/texts.js';
import { SHELL_TEXTS } from './shell.text.js';
import '../editor.css';

const SAVE_TEXT = { saved: 'saved', pending: 'pending', saving: 'saving', error: 'saveError' } as const satisfies Record<SaveState, keyof typeof SHELL_TEXTS.en>;
type View = 'flow' | 'scene' | 'look';
const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
const VIEW_NAMES = { flow: 'viewFlow', scene: 'viewScene', look: 'viewLook' } as const satisfies Record<View, keyof typeof SHELL_TEXTS.en>;

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
  const role = useHostRole();
  // No separate bar above the editor: its own "p." logo opens the other places (AppMenu), so it keeps one header.
  return <div className="editor-page"><EditorBody gameId={gameId} role={role} /><FieldLimit /></div>;
}

/** Both editors over one draft: the Flow editor (the map) and the Scene editor (slide by slide). */
function EditorBody({ gameId, role }: { gameId: string; role: HostRole | null }) {
  const d = useDraft(gameId); const t = useTexts(SHELL_TEXTS);
  // Coming back opens the same place (K2): the link's view wins, then what was open last time in this browser.
  const [memory] = useState(() => readMemory(gameId)); const [helping, setHelping] = useState(false); const [theme, setTheme] = useState(currentTheme);
  const [view, setViewState] = useState<View>(() => { const wanted = new URLSearchParams(location.search).get('view'); return wanted === 'flow' || wanted === 'scene' || wanted === 'look' ? wanted : memory.view ?? 'flow'; });
  const [selected, setSelected] = useState<string[]>(memory.selected ?? []);
  // A scene to bring into view on the map (from the problems box); `at` makes the same scene count again.
  const [focus, setFocus] = useState<{ key: string; at: number } | null>(null);
  const [exporting, setExporting] = useState(memory.panel === 'export'); const [settings, setSettings] = useState(memory.panel === 'settings'); const [inviting, setInviting] = useState(memory.panel === 'invite');
  // Remembered scenes that no longer exist (deleted meanwhile) are dropped once the game is loaded.
  const checked = useRef(false);
  useEffect(() => { if (!d.definition || checked.current) return; checked.current = true; const keys = new Set(d.definition.nodes.map(node => node.key)); setSelected(current => current.filter(key => keys.has(key))); }, [d.definition]);
  useEffect(() => { rememberPlace(gameId, { view, selected, panel: settings ? 'settings' : inviting ? 'invite' : exporting ? 'export' : null }); }, [gameId, view, selected, settings, inviting, exporting]);
  // What others see of you: the scenes you have selected (in the Scene editor, the one you are on).
  const first = useMemo(() => d.definition ? sceneOrder(d.definition).rows[0]?.node.key : undefined, [d.definition]);
  const working = useMemo(() => view === 'scene' ? [selected[0] ?? first].filter(key => key !== undefined) : selected, [view, selected, first]);
  const live = useLive(gameId, { view, selected: working }, d.adopt, d.refresh);
  const setView = (next: View) => { setViewState(next); const url = new URL(location.href); url.searchParams.set('view', next); history.replaceState(null, '', url); };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      // ? opens Help & shortcuts (not while typing).
      if (event.key === '?' && !(event.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) { event.preventDefault(); setHelping(true); return; }
      if ((event.target as HTMLElement).closest('input, textarea, select') || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 'y') return;
      event.preventDefault(); if (event.key.toLowerCase() === 'y' || event.shiftKey) d.redo(); else d.undo();
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  if (d.loadError) return <main className="editor-message"><p role="alert" className="error">{d.loadError}</p><p><a href="/?host=1">{t('backToGames')}</a></p></main>;
  if (!d.definition || !d.draft) return <main className="editor-message"><p role="status">{t('opening')}</p></main>;
  const { definition, draft } = d; const nodes = definition.nodes; const routes = nodes.filter(isRoute).length;
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
  const openPanel = (panel: 'settings' | 'invite' | 'export') => { setSettings(panel === 'settings'); setInviting(panel === 'invite'); setExporting(panel === 'export'); };
  const overview = `${t('minutes', { minutes: estimateMinutes(definition) })} · ${t(nodes.length === 1 ? 'sceneOne' : 'sceneMany', { count: nodes.length })}${routes ? `, ${t(routes === 1 ? 'choiceOne' : 'choiceMany', { count: routes })}` : ''} · ${d.issues.length ? problemCount : t('noProblems')}`;
  return <div className={`editor${d.readOnly ? ' viewing' : ''}`}>
    {/* One compact bar: the game and its state, the three editors, and the actions; the rest is in the ☰ menu. */}
    <header className="editor-header">
      <h1 className="visually-hidden">{t(VIEW_NAMES[view])}: {definition.title}</h1>
      <div className="editor-title"><AppMenu role={role} />
        <div><label className="visually-hidden" htmlFor="game-title">{t('gameName')}</label>
          <input id="game-title" className="title-input" readOnly={d.readOnly} value={definition.title} maxLength={160} onChange={event => d.change({ ...definition, title: event.target.value }, undefined, 'title')} />
          <p className="crumb" title={overview}>{draft.builtIn ? <><a href="/?host=1">{t('builtInGames')}</a> / <span className="crumb-builtin" title={t('yourVersionTitle', { title: draft.builtIn.title })}>{t('yourVersionOf', { title: draft.builtIn.title })}</span></> : <a href="/?host=1">{t('yourGames')}</a>} / {t('draft')}{draft.published ? ` · v${draft.published.number}${draft.published.matchesDraft ? '' : t('changes')}` : ''} · <span role="status" className={`save-state save-${d.save}`}>{t(SAVE_TEXT[d.save])}</span> · <span className="game-overview">{overview}</span></p></div></div>
      <div className="tabs editor-tabs" role="tablist" aria-label={t('editorView')}>
        {(Object.keys(VIEW_NAMES) as View[]).map(key => <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}>{t(VIEW_NAMES[key])}</button>)}</div>
      <div className="editor-actions">
        {/* Undo and Redo up here, so they are in reach in every editor, however long the scene list. */}
        <div className="history-buttons">
          <button type="button" className="icon-only" aria-label={t('undo')} title={t('undoTitle', { key: MOD })} disabled={!d.canUndo} onClick={d.undo}><Icon name="undo" size={18} /></button>
          <button type="button" className="icon-only" aria-label={t('redo')} title={t('redoTitle', { key: MOD })} disabled={!d.canRedo} onClick={d.redo}><Icon name="redo" size={18} /></button></div>
        {/* View mode: look through the game without changing anything by accident. One button switches. */}
        <button type="button" className={`mode-toggle${d.readOnly ? ' viewing' : ''}`} aria-label={t(d.readOnly ? 'viewingSwitch' : 'editingSwitch')}
          title={t(d.readOnly ? 'viewingTitle' : 'editingTitle')} onClick={() => d.setReadOnly(!d.readOnly)}>
          <Icon name={d.readOnly ? 'eye' : 'edit'} size={18} /><span>{t(d.readOnly ? 'viewing' : 'editing')}</span></button>
        {/* Trying out, publishing and playing: one menu. Each item says why when it cannot be used yet. */}
        {/* A game with problems cannot be rehearsed or published: the menu says so, and the problems are in the box at the bottom left. */}
        <ActionMenu label={t('playPublish')} text={t('playPublishText')} {...(d.issues.length ? { icon: 'warning' } : {})}
          intro={d.issues.length ? <span className="menu-warning" title={t('problemsTip')}><Icon name="warning" size={16} />{t('toFixFirst', { problems: problemCount })}</span> : t('rehearseIntro')} actions={[
          { label: fromStart ? t('rehearseStartFix', { fix: fix(fromStart) }) : t('rehearseStart'), disabled: d.busy || d.save !== 'saved' || fromStart > 0, onSelect: () => d.rehearse(null) },
          { label: selected.length !== 1 ? t('rehearseSelectOne') : fromScene ? t('rehearseSceneFix', { fix: fix(fromScene) }) : t('rehearseScene'), disabled: d.busy || d.save !== 'saved' || selected.length !== 1 || fromScene > 0, onSelect: () => d.rehearse(selected[0]!) },
          { label: draft.published?.matchesDraft ? t('publishNothing') : d.issues.length ? t('publishFix', { problems: problemCount }) : d.save !== 'saved' ? t('publishSaving') : t('publish'),
            disabled: d.busy || !ready || Boolean(draft.published?.matchesDraft), onSelect: d.publish },
          // Opening a real room is hosting: the owner's alone. Editors rehearse instead.
          ...(role === 'owner' ? [{ label: draft.published ? t('playPublished') : t('playFirst'), disabled: d.busy || !draft.published, onSelect: d.play }] : []),
        ]} />
        <ActionMenu label={t('gameMenu')} actions={[{ label: t('gameSettings'), icon: 'gear', onSelect: () => openPanel('settings'), problems: gameProblems }, { label: t('invitePeople'), icon: 'invite', onSelect: () => openPanel('invite') }, { label: t('exportText'), icon: 'export', onSelect: () => openPanel('export') }, { label: t('help'), icon: 'help', shortcut: '?', onSelect: () => setHelping(true) },
          { label: t(theme === 'dark' ? 'lightMode' : 'darkMode'), icon: theme === 'dark' ? 'sun' : 'moon', onSelect: () => { const next = theme === 'dark' ? 'light' : 'dark'; chooseTheme(next); setTheme(next); } }]} />
        {/* Who is here, you last: at the far right, as in most editors. */}
        <PeerBar live={live} />
      </div>
    </header>
    {helping && <HelpPanel onClose={() => setHelping(false)} />}
    {inviting && <InvitePanel gameId={gameId} role={role} onClose={() => setInviting(false)} />}
    {settings && <GameSettingsPanel readOnly={d.readOnly} definition={definition} problems={gameIssues.map(issue => ({ message: issue.message, path: issue.path ?? '' }))} onChange={(next, group) => d.change(next, undefined, group)} onLook={() => setView('look')} onClose={() => setSettings(false)} />}
    {exporting && <ExportPanel text={JSON.stringify({ ...definition, editor: { positions: d.positions } }, null, 2)} title={definition.title} onClose={() => setExporting(false)} />}
    <main className="editor-main">
      {view === 'flow' ? <FlowView d={d} selected={selected} setSelected={setSelected} focus={focus} live={live} onHelp={() => setHelping(true)} onOpenScene={key => { setSelected([key]); setView('scene'); }} />
        : view === 'scene' ? <SceneView d={d} selected={selected} setSelected={setSelected} peers={live.peers} onOpenFlow={key => { setSelected([key]); setView('flow'); }} /> : <LookView d={d} selected={selected} gameId={gameId} />}
      {/* Bottom left: your edits (History) and every problem of the game; each folds into a small button. A problem goes to its scene. */}
      <div className="editor-corner">
        <HistoryPanel steps={d.steps} disabled={d.readOnly} onRestore={d.restore} />
        <ProblemsPanel issues={d.issues} definition={definition} onGo={key => { setSelected([key]); if (view === 'look') setView('scene'); setFocus({ key, at: Date.now() }); }} onGame={() => openPanel('settings')} />
      </div>
    </main>
  </div>;
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
