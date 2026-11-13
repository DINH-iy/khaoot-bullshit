import { useEffect, useMemo, useState } from 'react';
import { FlowView } from './flow-view.js';
import { SceneView, sceneOrder } from './scene-view.js';
import { useLive } from './live/use-live.js';
import { PeerBar } from './live/presence.js';
import { LookView } from './look/look-view.js';
import { estimateMinutes, isRoute } from './model.js';
import { useDraft, type SaveState } from './use-draft.js';
import './editor.css';

const saveText: Record<SaveState, string> = { saved: 'All changes saved', pending: 'Saving soon…', saving: 'Saving…', error: 'Not saved: the server could not be reached. Retrying…' };
type View = 'flow' | 'scene' | 'look';
const VIEW_NAMES: Record<View, string> = { flow: 'Flow editor', scene: 'Scene editor', look: 'Look & feel' };

/** Both editors over one draft: the Flow editor (the map) and the Scene editor (slide by slide). */
export function EditorShell({ gameId }: { gameId: string }) {
  const d = useDraft(gameId);
  const [view, setViewState] = useState<View>(() => { const wanted = new URLSearchParams(location.search).get('view'); return wanted === 'scene' || wanted === 'look' ? wanted : 'flow'; });
  const [selected, setSelected] = useState<string[]>([]); const [rehearsing, setRehearsing] = useState(false); const [exporting, setExporting] = useState(false);
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
  return <div className="editor">
    <header className="editor-header">
      <h1 className="visually-hidden">{VIEW_NAMES[view]}: {definition.title}</h1>
      <div className="editor-title"><span className="editor-logo" aria-hidden="true">p.</span>
        <div><label className="visually-hidden" htmlFor="game-title">Game name</label>
          <input id="game-title" className="title-input" value={definition.title} maxLength={160} onChange={event => d.change({ ...definition, title: event.target.value }, undefined, 'title')} />
          <p className="crumb"><a href="/?host=1">Your games</a> / Draft{draft.published ? ` · published version ${draft.published.number}${draft.published.matchesDraft ? '' : ', draft has newer changes'}` : ''}</p></div></div>
      <div className="editor-actions">
        <p role="status" className={`save-state save-${d.save}`}>{saveText[d.save]}</p>
        <PeerBar live={live} />
        <button onClick={() => setExporting(!exporting)} aria-expanded={exporting}>Export as text</button>
        <div className="rehearse">
          <button aria-expanded={rehearsing} disabled={d.busy || d.save !== 'saved'} onClick={() => setRehearsing(!rehearsing)}>Rehearse ▾</button>
          {rehearsing && <div className="rehearse-menu" role="menu" aria-label="Rehearse this draft">
            <p>Play the draft in a practice room, without publishing it.</p>
            <button role="menuitem" onClick={() => { setRehearsing(false); d.rehearse(null); }}>From the start</button>
            <button role="menuitem" disabled={selected.length !== 1} onClick={() => { setRehearsing(false); d.rehearse(selected[0]!); }}>{selected.length === 1 ? 'From the selected scene' : 'From a scene (select one first)'}</button>
          </div>}
        </div>
        <button disabled={d.busy || !ready || Boolean(draft.published?.matchesDraft)} onClick={d.publish}>Publish</button>
        <button className="accent" disabled={d.busy || !draft.published} onClick={d.play}>Play published version ↗</button>
      </div>
    </header>
    {exporting && <ExportPanel text={JSON.stringify({ ...definition, editor: { positions: d.positions } }, null, 2)} title={definition.title} onClose={() => setExporting(false)} />}
    <main className="editor-main">
      <div className="editor-bar">
        <div className="tabs" role="tablist" aria-label="Editor view">
          {(Object.keys(VIEW_NAMES) as View[]).map(key => <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}>{VIEW_NAMES[key]}</button>)}</div>
        <p>Game overview · about {estimateMinutes(definition)} min · {nodes.length} {nodes.length === 1 ? 'scene' : 'scenes'}{routes ? `, ${routes} ${routes === 1 ? 'party choice' : 'party choices'}` : ''} · {d.issues.length ? `${d.issues.length} ${d.issues.length === 1 ? 'problem' : 'problems'}` : 'no problems'}</p>
      </div>
      {view === 'flow' ? <FlowView d={d} selected={selected} setSelected={setSelected} live={live} /> : view === 'scene' ? <SceneView d={d} selected={selected} setSelected={setSelected} peers={live.peers} /> : <LookView d={d} selected={selected} />}
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
