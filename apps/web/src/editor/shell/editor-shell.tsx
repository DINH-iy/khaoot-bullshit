import { useEffect, useMemo, useRef, useState } from 'react';
import { FlowView } from '../flow/flow-view.js';
import { SceneView, sceneOrder } from '../scene/scene-view.js';
import { useLive } from '../live/use-live.js';
import { PeerBar } from '../live/presence.js';
import { LookView } from '../look/look-view.js';
import { estimateMinutes, isRoute } from '../model.js';
import { useDraft, type SaveState } from './use-draft.js';
import { OwnerNav, useHostRole, type HostRole } from '../../owner/owner-nav.js';
import { GameSettingsPanel } from './game-settings.js';
import { InvitePanel } from './invite-panel.js';
import { FieldLimit } from '../controls/field-limit.js';
import { ActionMenu } from '../controls/action-menu.js';
import { readMemory, rememberPlace } from './editor-memory.js';
import { pendingClaim } from '../../people/use-me.js';
import '../editor.css';

const saveText: Record<SaveState, string> = { saved: 'All changes saved', pending: 'Saving soon…', saving: 'Saving…', error: 'Not saved: the server could not be reached. Retrying…' };
type View = 'flow' | 'scene' | 'look';
const VIEW_NAMES: Record<View, string> = { flow: 'Flow editor', scene: 'Scene editor', look: 'Look & feel' };

/**
 * The editor page: the owner or editor bar (when signed in) above the editors. An
 * invite link (…#person=<key>) signs this device in first; the editor waits for it.
 */
export function EditorShell({ gameId }: { gameId: string }) {
  const [ready, setReady] = useState(() => !pendingClaim());
  useEffect(() => { const claim = pendingClaim(); if (claim) void claim.finally(() => setReady(true)); }, []);
  return ready ? <EditorPage gameId={gameId} /> : <main className="editor-message"><p role="status">Signing you in…</p></main>;
}

function EditorPage({ gameId }: { gameId: string }) {
  const role = useHostRole();
  return <div className="editor-page"><OwnerNav current="editor" role={role} /><EditorBody gameId={gameId} role={role} /><FieldLimit /></div>;
}

/** Both editors over one draft: the Flow editor (the map) and the Scene editor (slide by slide). */
function EditorBody({ gameId, role }: { gameId: string; role: HostRole | null }) {
  const d = useDraft(gameId);
  // Coming back opens the same place (K2): the link's view wins, then what was open last time in this browser.
  const [memory] = useState(() => readMemory(gameId));
  const [view, setViewState] = useState<View>(() => { const wanted = new URLSearchParams(location.search).get('view'); return wanted === 'flow' || wanted === 'scene' || wanted === 'look' ? wanted : memory.view ?? 'flow'; });
  const [selected, setSelected] = useState<string[]>(memory.selected ?? []);
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
      if ((event.target as HTMLElement).closest('input, textarea, select') || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 'y') return;
      event.preventDefault(); if (event.key.toLowerCase() === 'y' || event.shiftKey) d.redo(); else d.undo();
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  if (d.loadError) return <main className="editor-message"><p role="alert" className="error">{d.loadError}</p><p><a href="/?host=1">Back to your games</a></p></main>;
  if (!d.definition || !d.draft) return <main className="editor-message"><p role="status">Opening the editor…</p></main>;
  const { definition, draft } = d; const nodes = definition.nodes; const routes = nodes.filter(isRoute).length;
  const ready = d.issues.length === 0 && d.save === 'saved';
  const openPanel = (panel: 'settings' | 'invite' | 'export') => { setSettings(panel === 'settings'); setInviting(panel === 'invite'); setExporting(panel === 'export'); };
  const overview = `about ${estimateMinutes(definition)} min · ${nodes.length} ${nodes.length === 1 ? 'scene' : 'scenes'}${routes ? `, ${routes} ${routes === 1 ? 'party choice' : 'party choices'}` : ''} · ${d.issues.length ? `${d.issues.length} ${d.issues.length === 1 ? 'problem' : 'problems'}` : 'no problems'}`;
  return <div className={`editor${d.readOnly ? ' viewing' : ''}`}>
    {/* One compact bar: the game and its state, the three editors, and the actions; the rest is in the ☰ menu. */}
    <header className="editor-header">
      <h1 className="visually-hidden">{VIEW_NAMES[view]}: {definition.title}</h1>
      <div className="editor-title"><span className="editor-logo" aria-hidden="true">p.</span>
        <div><label className="visually-hidden" htmlFor="game-title">Game name</label>
          <input id="game-title" className="title-input" readOnly={d.readOnly} value={definition.title} maxLength={160} onChange={event => d.change({ ...definition, title: event.target.value }, undefined, 'title')} />
          <p className="crumb" title={overview}><a href="/?host=1">Your games</a> / Draft{draft.published ? ` · v${draft.published.number}${draft.published.matchesDraft ? '' : ' + changes'}` : ''} · <span role="status" className={`save-state save-${d.save}`}>{saveText[d.save]}</span> · <span className="game-overview">{overview}</span></p></div></div>
      <div className="tabs editor-tabs" role="tablist" aria-label="Editor view">
        {(Object.keys(VIEW_NAMES) as View[]).map(key => <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}>{VIEW_NAMES[key]}</button>)}</div>
      {/* View mode: look through the game without changing anything by accident. */}
      <div className="segmented mode-switch" role="group" aria-label="Mode" title={d.readOnly ? 'Viewing: nothing can be changed' : 'Editing'}>
        <button aria-pressed={!d.readOnly} onClick={() => d.setReadOnly(false)}>Edit</button><button aria-pressed={d.readOnly} onClick={() => d.setReadOnly(true)}>View</button></div>
      <div className="editor-actions">
        <PeerBar live={live} />
        {/* Trying out, publishing and playing: one menu. Each item says why when it cannot be used yet. */}
        <ActionMenu label="Play and publish" text="Play & publish" intro="Rehearse plays the draft in a practice room, without publishing it." actions={[
          { label: 'Rehearse from the start', disabled: d.busy || d.save !== 'saved', onSelect: () => d.rehearse(null) },
          { label: selected.length === 1 ? 'Rehearse from the selected scene' : 'Rehearse from a scene (select one first)', disabled: d.busy || d.save !== 'saved' || selected.length !== 1, onSelect: () => d.rehearse(selected[0]!) },
          { label: draft.published?.matchesDraft ? 'Publish (nothing new to publish)' : d.issues.length ? `Publish (fix ${d.issues.length} ${d.issues.length === 1 ? 'problem' : 'problems'} first)` : d.save !== 'saved' ? 'Publish (saving…)' : 'Publish',
            disabled: d.busy || !ready || Boolean(draft.published?.matchesDraft), onSelect: d.publish },
          // Opening a real room is hosting: the owner's alone. Editors rehearse instead.
          ...(role === 'owner' ? [{ label: draft.published ? 'Play the published version ↗' : 'Play (publish first)', disabled: d.busy || !draft.published, onSelect: d.play }] : []),
        ]} />
        <ActionMenu label="Game menu" actions={[{ label: 'Game settings', onSelect: () => openPanel('settings') }, { label: 'Invite people', onSelect: () => openPanel('invite') }, { label: 'Export as text', onSelect: () => openPanel('export') }]} />
      </div>
    </header>
    {inviting && <InvitePanel gameId={gameId} role={role} onClose={() => setInviting(false)} />}
    {settings && <GameSettingsPanel readOnly={d.readOnly} definition={definition} onChange={(next, group) => d.change(next, undefined, group)} onLook={() => setView('look')} onClose={() => setSettings(false)} />}
    {exporting && <ExportPanel text={JSON.stringify({ ...definition, editor: { positions: d.positions } }, null, 2)} title={definition.title} onClose={() => setExporting(false)} />}
    <main className="editor-main">
      {view === 'flow' ? <FlowView d={d} selected={selected} setSelected={setSelected} live={live} onOpenScene={key => { setSelected([key]); setView('scene'); }} />
        : view === 'scene' ? <SceneView d={d} selected={selected} setSelected={setSelected} peers={live.peers} onOpenFlow={key => { setSelected([key]); setView('flow'); }} /> : <LookView d={d} selected={selected} gameId={gameId} />}
      {d.issues.some(issue => !issue.nodeKey) && <div className="general-problems" role="region" aria-label="Problems in the whole game"><h2>Problems in the whole game</h2><ul>{d.issues.filter(issue => !issue.nodeKey).map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></div>}
    </main>
  </div>;
}

/** The whole game as text: to keep a copy, or to give to an AI with a request and import its answer. */
function ExportPanel({ text, title, onClose }: { text: string; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const download = () => { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `${title.replace(/[^\w-]+/g, '-').slice(0, 60) || 'game'}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <section className="export-panel" aria-labelledby="export-heading">
    <div className="inspector-head"><h2 id="export-heading">Export as text</h2><button className="small-button" onClick={onClose}>Close</button></div>
    <p className="hint">This is the whole game, exactly. Keep it as a backup, or give it to an AI together with what you want changed, and import its answer from Your games as a new game.</p>
    <textarea readOnly value={text} aria-label="The game as text" onFocus={event => event.currentTarget.select()} />
    <div className="actions"><button onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)); }}>{copied ? 'Copied ✓' : 'Copy'}</button><button onClick={download}>Download as a file</button></div>
  </section>;
}
