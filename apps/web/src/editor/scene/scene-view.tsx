import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DefinitionIssue, EditorPeer } from '@party/contracts';
import { peersOn, PeerTags } from '../live/presence.js';
import { Icon, sceneIcon } from '../controls/icons.js';
import { nextSummary, StageFields } from './inspector.js';
import { ActionMenu } from '../controls/action-menu.js';
import { ConfirmDialog } from '../controls/confirm-dialog.js';
import { ScenePalette, type SceneChoice } from '../controls/scene-palette.js';
import { SpinFields } from '../shell/show-settings.js';
import { Section } from '../controls/section.js';
import { isWheelScene, addScene, cardText, connect, deleteScene, freeSpot, isRoute, newStage, optionsOf, snap, uniqueKey, type Definition, type Node, type SceneType } from '../model.js';
import type { DraftState } from '../shell/use-draft.js';

// What a part is, without the scene's own route or rejoin label.
const partLabel = (definition: Definition, stage: Node['stages'][number]) => cardText(definition, { key: '\u0000part', stages: [stage] }).label;
const PART_TYPES: SceneType[] = ['info', 'quiz', 'writing', 'upload', 'drawing', 'order', 'challenge', 'vote', 'scoreboard', 'minigame', 'duel'];
/**
 * A scene in the list. `via`: the route this scene starts (its first scene); `branch`: the routes
 * it is on, outermost first, as "<party choice>:<option>", so a route can be folded away.
 */
interface Row { node: Node; depth: number; via: string | null; branch: string[] }

/** The scenes in play order: depth-first along the routes, each branch indented under its route, rejoins listed once after them. */
export function sceneOrder(definition: Definition): { rows: Row[]; loose: Node[] } {
  const byKey = new Map(definition.nodes.map(node => [node.key, node]));
  const incoming = (key: string) => definition.edges.filter(edge => edge.to === key).length;
  const placed = new Set<string>(); const rows: Row[] = [];
  const visit = (key: string, depth: number, via: string | null, branch: string[]) => {
    const node = byKey.get(key); if (!node || placed.has(key)) return;
    placed.add(key); rows.push({ node, depth, via, branch });
    const out = definition.edges.filter(edge => edge.from === key);
    if (isRoute(node)) {
      for (const option of optionsOf(node)) { const edge = out.find(candidate => candidate.option === option.key); if (edge && incoming(edge.to) === 1) visit(edge.to, depth + 1, option.label, [...branch, `${key}:${option.key}`]); }
      for (const edge of out) if (incoming(edge.to) > 1) continue; else visit(edge.to, depth + 1, null, branch);
      // After the branches: where they come back together.
      const rejoins = new Set<string>();
      const walk = (from: string, seen: Set<string>) => { for (const edge of definition.edges.filter(candidate => candidate.from === from)) { if (seen.has(edge.to)) continue; seen.add(edge.to); if (incoming(edge.to) > 1) rejoins.add(edge.to); else walk(edge.to, seen); } };
      walk(key, new Set());
      for (const rejoin of rejoins) visit(rejoin, depth, null, branch);
      return;
    }
    // A scene where routes rejoin is listed by its party choice, after all of its branches.
    for (const edge of out) if (incoming(edge.to) === 1) visit(edge.to, depth, null, branch);
  };
  visit(definition.startNodeKey, 0, null, []);
  return { rows, loose: definition.nodes.filter(node => !placed.has(node.key)) };
}

export function SceneView({ d, selected, setSelected, peers, onOpenFlow }: { d: DraftState; selected: string[]; setSelected: (keys: string[]) => void; peers: EditorPeer[]; onOpenFlow: (key: string) => void }) {
  const definition = d.definition!; const { change, positions } = d; const readOnly = d.readOnly;
  const { rows, loose } = useMemo(() => sceneOrder(definition), [definition]);
  const current = definition.nodes.find(node => node.key === selected[0]) ?? rows[0]?.node ?? definition.nodes[0]!;
  const [part, setPart] = useState(0); const [adding, setAdding] = useState<'scene' | 'part' | null>(null); const [confirming, setConfirming] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setPart(0); setConfirming(false); }, [current.key]);
  const index = Math.min(part, current.stages.length - 1);
  const problems = d.issues.filter(issue => issue.nodeKey === current.key);
  const problemsFor = (key: string) => d.issues.filter(issue => issue.nodeKey === key).length;
  const onChange = (next: Definition, group?: string) => change(next, undefined, group);

  /** A new scene right after the current one: the current scene now leads to it, and it leads where the current one did. */
  const insertAfter = ({ type, variant }: SceneChoice) => {
    const added = addScene(definition, type, variant); let next = added.definition;
    if (!isRoute(current)) {
      const old = definition.edges.find(edge => edge.from === current.key);
      next = connect(next, current.key, undefined, added.key);
      if (old && type !== 'route') next = connect(next, added.key, undefined, old.to);
      else if (old && type === 'route') { const first = optionsOf(next.nodes.find(node => node.key === added.key)).at(0); if (first) next = connect(next, added.key, first.key, old.to); }
    }
    const base = positions[current.key] ?? { x: 0, y: 0 };
    const raw = { ...positions, [added.key]: { x: snap(base.x + 360), y: snap(base.y) } };
    change(next, { ...raw, [added.key]: freeSpot(next, raw, added.key, raw[added.key]!) });
    setSelected([added.key]); setAdding(null);
  };
  const addPart = ({ type, variant }: SceneChoice) => {
    const stage = { ...newStage(type, definition, variant), key: uniqueKey('part', current.stages.map(entry => entry.key)) };
    change({ ...definition, nodes: definition.nodes.map(node => node.key === current.key ? { ...node, stages: [...node.stages, stage] } : node) });
    setPart(current.stages.length); setAdding(null);
  };
  const movePart = (from: number, to: number) => {
    const stages = [...current.stages]; const [moved] = stages.splice(from, 1); stages.splice(to, 0, moved!);
    change({ ...definition, nodes: definition.nodes.map(node => node.key === current.key ? { ...node, stages } : node) }); setPart(to);
  };
  const removePart = (at: number) => { change({ ...definition, nodes: definition.nodes.map(node => node.key === current.key ? { ...node, stages: node.stages.filter((_, position) => position !== at) } : node) }); setPart(0); };
  // A party choice's routes fold open and closed in the list; the route of the selected scene always opens.
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const currentBranch = rows.find(entry => entry.node.key === current.key)?.branch;
  // Only when another scene is selected (folding the selected scene's own route by hand stays folded).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (currentBranch?.some(id => folded.has(id))) setFolded(now => new Set([...now].filter(id => !currentBranch.includes(id)))); }, [current.key]);
  const toggleRoute = (id: string) => setFolded(now => { const next = new Set(now); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const routeHead = (entry: Row) => {
    const id = entry.branch.at(-1)!; const open = !folded.has(id); const count = rows.filter(other => other.branch.includes(id)).length;
    const problemsIn = rows.filter(other => other.branch.includes(id)).reduce((sum, other) => sum + problemsFor(other.node.key), 0);
    return <li key={`route-${id}`} className="route-group-item"><button type="button" className="route-group" aria-expanded={open} style={{ paddingLeft: 12 + (entry.depth - 1) * 18 }} onClick={() => toggleRoute(id)}>
      <svg className="ed-chevron" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="route-group-name">Route: {entry.via}</span>
      <small>{count === 1 ? '1 scene' : `${count} scenes`}</small>
      {!open && problemsIn > 0 && <span className="row-problems" aria-label={`${problemsIn} problems`}>{problemsIn}</span>}
    </button></li>;
  };
  const row =(node: Node, depth: number, _via: string | null) => {
    const text = cardText(definition, node); const count = problemsFor(node.key);
    return <li key={node.key}><button className={`scene-row${node.key === current.key ? ' current' : ''}`} style={{ paddingLeft: 12 + depth * 18 }} aria-current={node.key === current.key ? 'true' : undefined} onClick={() => setSelected([node.key])}>
      <span className={`row-icon thumb-${text.kind}${text.input ? ` thumb-${text.input}` : ''}`}><Icon name={sceneIcon(text.kind, text.input)} size={18} /></span>
      <span className="row-text"><small>{definition.startNodeKey === node.key ? 'Start · ' : ''}{text.label}</small><span>{text.banner || text.title}</span></span>
      <PeerTags peers={peersOn(peers, node.key)} className="row-peers" />
      {count > 0 && <span className="row-problems" aria-label={`${count} problems`}>{count}</span>}
    </button></li>;
  };
  const listed = rows.flatMap(entry => {
    const hidden = entry.branch.some(id => folded.has(id));
    // A route's heading shows when the routes around it are open, even while its own scenes are folded away.
    const head = entry.via && !entry.branch.slice(0, -1).some(id => folded.has(id)) ? [routeHead(entry)] : [];
    return [...head, ...(hidden ? [] : [row(entry.node, entry.depth, entry.via)])];
  });
  const routeIds = [...new Set(rows.flatMap(entry => entry.branch))];
  const allFolded = routeIds.length > 0 && routeIds.every(id => folded.has(id));
  return <div className="scene-editor">
    <nav className="scene-list" aria-label="Scenes in play order">
      <div className="scene-list-head"><h2>Scenes</h2>
        {routeIds.length > 0 && <button type="button" className="small-button icon-only" aria-label={allFolded ? 'Unfold all routes' : 'Fold all routes'} title={allFolded ? 'Unfold all routes' : 'Fold all routes'}
          onClick={() => setFolded(allFolded ? new Set() : new Set(routeIds))}><Icon name={allFolded ? 'unfold-all' : 'fold-all'} size={16} /></button>}
        <button ref={addButton} className="with-icon small-button" disabled={readOnly} aria-expanded={adding === 'scene'} onClick={() => setAdding(adding === 'scene' ? null : 'scene')}><Icon name="plus" size={16} />Add after this</button></div>
      <ol>{listed}</ol>
      {loose.length > 0 && <><h3>Not connected</h3><ol>{loose.map(node => row(node, 0, null))}</ol></>}
    </nav>
    {/* Floating over the preview, next to the list (on top of everything, so nothing covers it). */}
    {adding === 'scene' && <FloatingMenu anchor={addButton.current} onClose={() => setAdding(null)}><ScenePalette label="Add a scene after this one" onPick={insertAfter} onCancel={() => setAdding(null)} /></FloatingMenu>}
    <section className="scene-stage" aria-label="Preview">
      {current.stages.length > 1 && <div className="part-tabs" role="tablist" aria-label="Parts of this scene">{current.stages.map((stage, position) =>
        <button key={stage.key} role="tab" aria-selected={position === index} onClick={() => setPart(position)}>Part {position + 1} · {partLabel(definition, stage)}</button>)}</div>}
      <Preview node={current} index={index} />
      {d.notice && <p role="status" className="flow-notice">{d.notice}</p>}
    </section>
    <aside className="scene-props" aria-labelledby="scene-props-heading">
      <div className="inspector-head"><h2 id="scene-props-heading">{cardText(definition, current).label}</h2>
        {/* Try just this scene in a practice room (a minigame, a round), without playing the whole game. */}
        <button type="button" className="small-button with-icon try-scene" disabled={d.busy || d.save !== 'saved'} title="Plays only this scene in a practice room (opens in a new tab)" onClick={() => d.rehearse(current.key, true)}><Icon name="try" size={16} />Try this scene</button>
        <ActionMenu label="Scene actions" actions={[...(definition.startNodeKey === current.key || readOnly ? [] : [{ label: 'Start the game here', icon: 'start', onSelect: () => change({ ...definition, startNodeKey: current.key }) }]),
          { label: 'Rehearse from here', icon: 'play', disabled: d.busy || d.save !== 'saved', onSelect: () => d.rehearse(current.key) },
          { label: 'Change where it leads (Flow editor)', icon: 'route', onSelect: () => onOpenFlow(current.key) }, ...(readOnly ? [] : [{ label: 'Delete scene…', icon: 'trash', danger: true, onSelect: () => setConfirming(true) }])]} /></div>
      {definition.startNodeKey === current.key && <p className="start-note">The game starts here.</p>}
      {problems.length > 0 && <Problems problems={problems} parts={current.stages.length} />}
      {/* A small named group (K4), like the scene's settings: open as left last time. */}
      {!isRoute(current) && <Section title="Parts" memory="scene:parts" summary={current.stages.length === 1 ? '1 part' : `${current.stages.length} parts`}>
        <ol className="part-list">{current.stages.map((stage, position) => <li key={stage.key} className={position === index ? 'current' : undefined}>
          <button className="link-button" onClick={() => setPart(position)}>Part {position + 1}: {partLabel(definition, stage)}</button>
          <button className="icon-button" aria-label={`Move part ${position + 1} up`} disabled={readOnly || position === 0} onClick={() => movePart(position, position - 1)}>↑</button>
          <button className="icon-button" aria-label={`Remove part ${position + 1}`} disabled={readOnly || current.stages.length === 1} onClick={() => removePart(position)}>×</button></li>)}</ol>
        <button className="small-button with-icon" disabled={readOnly} onClick={() => setAdding(adding === 'part' ? null : 'part')}><Icon name="plus" size={16} />Add a part</button>
        {adding === 'part' && <div className="part-palette"><ScenePalette label="Add a part" only={PART_TYPES} inline onPick={addPart} onCancel={() => setAdding(null)} /></div>}
        <p className="hint">Parts play one after another inside this scene, for example a question and then its scoreboard.</p>
      </Section>}
      {current.stages.length > 1 && <h3>Part {index + 1}</h3>}
      <fieldset className="view-lock" disabled={readOnly}><StageFields definition={definition} node={current} index={index} onChange={onChange} /></fieldset>
      {/* Where it leads: a button to go there (changing it is the Flow editor's business, in the ☰ menu). */}
      <NextScenes definition={definition} node={current} onGo={key => setSelected([key])} />
      <fieldset className="view-lock" disabled={readOnly}>{!isWheelScene(current.stages[index]) && (definition['wheels'] as unknown[] | undefined)?.length ? <Section key={'spin-' + current.key} title="Wheel of fortune" summary={(current.stages[index]?.['spin'] as { wheel?: string } | undefined)?.wheel ? 'Spun here' : 'Not on this scene'}><SpinFields definition={definition} node={current} index={index} onChange={onChange} /></Section> : null}</fieldset>
      {confirming && <ConfirmDialog title={`Delete “${cardText(definition, current).title}”?`} text="The scene and its connections go. Undo (Ctrl/Cmd+Z) brings it back." confirm="Delete scene"
        onConfirm={() => { const kept = { ...positions }; delete kept[current.key]; setConfirming(false); change(deleteScene(definition, current.key), kept); setSelected([]); }} onCancel={() => setConfirming(false)} />}
    </aside>
  </div>;
}

/** Where this scene leads, one button per way out (a party choice has one per route), to go there. */
function NextScenes({ definition, node, onGo }: { definition: Definition; node: Node; onGo: (key: string) => void }) {
  const out = definition.edges.filter(edge => edge.from === node.key);
  const name = (key: string) => { const target = definition.nodes.find(entry => entry.key === key); if (!target) return key; const text = cardText(definition, target); return text.banner || text.title; };
  const via = (option: string | undefined) => option ? optionsOf(node).find(entry => entry.key === option)?.label : undefined;
  return <div className="scene-next" role="group" aria-label="Next">
    <span className="scene-next-title">Next</span>
    {out.length === 0 ? <span className="scene-next-end">{nextSummary(definition, node)}</span>
      : out.map(edge => <button key={edge.key} type="button" className="scene-next-go" onClick={() => onGo(edge.to)}>
        <span>{via(edge.option) && <small>{via(edge.option)}</small>}{name(edge.to)}</span><Icon name="next" size={16} /></button>)}
  </div>;
}

/** A menu floating next to a button, drawn over the page (a fixed layer, so no panel cuts it off). Escape or a click elsewhere closes it. */
function FloatingMenu({ anchor, onClose, children }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const rect = anchor?.getBoundingClientRect();
  useEffect(() => {
    const outside = (event: PointerEvent) => { const target = event.target as globalThis.Node; if (!box.current?.contains(target) && !anchor?.contains(target)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { onClose(); anchor?.focus(); } };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key); };
  }, [anchor, onClose]);
  const top = rect ? Math.min(rect.bottom + 6, window.innerHeight - 200) : 120;
  return createPortal(<div ref={box} className="floating-menu" style={{ top, left: rect ? Math.max(8, rect.left) : 8, maxHeight: `calc(100dvh - ${top + 12}px)` }}>{children}</div>, anchor?.closest('.editor') ?? document.body);
}

function Problems({ problems, parts }: { problems: DefinitionIssue[]; parts: number }) {
  return <div role="alert" className="inspector-problems"><h3>Problems in this scene</h3><ul>{problems.map((issue, position) => <li key={position}>{issue.stageIndex !== null && parts > 1 ? `Part ${issue.stageIndex + 1}: ` : ''}{issue.message}</li>)}</ul></div>;
}

/** A rough picture of what the shared screen and a phone show for this part. Not the final game look. */
function Preview({ node, index }: { node: Node; index: number }) {
  const stage = node.stages[index]!; const input = stage['input'] as { kind?: string; options?: { key: string; label: string }[]; items?: { key: string; label: string }[]; layout?: string } | undefined;
  const timer = typeof stage.durationMs === 'number' ? `${Math.round(stage.durationMs / 1000)} s` : null;
  const options = stage.kind === 'route' ? optionsOf(node) : input?.options ?? input?.items ?? [];
  const phone = stage.kind === 'info' || stage.kind === 'scoreboard' ? 'Watching the shared screen'
    : stage.kind === 'challenge' ? 'Follow the host' : stage.kind === 'minigame' ? 'Minigame controls: big buttons to play'
    : stage.kind === 'vote' ? 'Vote for an answer' : input?.kind === 'text' ? 'Type an answer' : input?.kind === 'media' ? 'Upload a picture or video' : input?.kind === 'drawing' ? 'Draw on the phone' : input?.kind === 'order' ? 'Put the items in order' : 'Choose an answer';
  return <div className="preview">
    <figure className="tv"><figcaption>Shared screen</figcaption>
      <div className={`tv-screen tv-${stage.kind}`}>
        {stage.kind === 'info' && <p className="tv-banner">{String(stage.title ?? '')}</p>}
        <p className="tv-prompt">{String(stage.prompt ?? '')}</p>
        {options.length > 0 && <ul className={`tv-options${input?.kind === 'order' ? ' order' : ''}`}>{options.map((option, position) => <li key={option.key}><span>{input?.kind === 'order' ? position + 1 : String.fromCharCode(65 + position)}</span>{option.label}</li>)}</ul>}
        {stage.kind === 'scoreboard' && <ol className="tv-scores"><li>Player one <b>30</b></li><li>Player two <b>20</b></li><li>Player three <b>10</b></li></ol>}
        {timer && <p className="tv-timer">{timer}</p>}
      </div></figure>
    <figure className="phone"><figcaption>Phone</figcaption>
      <div className="phone-screen"><p className="phone-prompt">{stage.kind === 'info' ? String(stage.title ?? '') : String(stage.prompt ?? '')}</p>
        {['collect', 'vote', 'route'].includes(stage.kind) && options.length > 0 && input?.kind !== 'order'
          ? <div className={input?.layout === 'tiles' || stage.kind === 'route' ? 'phone-tiles' : 'phone-list'}>{options.map(option => <span key={option.key}>{option.label}</span>)}</div>
          : <p className="phone-hint">{phone}</p>}
      </div></figure>
  </div>;
}
