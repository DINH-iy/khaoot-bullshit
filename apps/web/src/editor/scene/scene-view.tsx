import { useEffect, useMemo, useState } from 'react';
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
interface Row { node: Node; depth: number; via: string | null }

/** The scenes in play order: depth-first along the routes, each branch indented under its route, rejoins listed once after them. */
export function sceneOrder(definition: Definition): { rows: Row[]; loose: Node[] } {
  const byKey = new Map(definition.nodes.map(node => [node.key, node]));
  const incoming = (key: string) => definition.edges.filter(edge => edge.to === key).length;
  const placed = new Set<string>(); const rows: Row[] = [];
  const visit = (key: string, depth: number, via: string | null) => {
    const node = byKey.get(key); if (!node || placed.has(key)) return;
    placed.add(key); rows.push({ node, depth, via });
    const out = definition.edges.filter(edge => edge.from === key);
    if (isRoute(node)) {
      for (const option of optionsOf(node)) { const edge = out.find(candidate => candidate.option === option.key); if (edge && incoming(edge.to) === 1) visit(edge.to, depth + 1, option.label); }
      for (const edge of out) if (incoming(edge.to) > 1) continue; else visit(edge.to, depth + 1, null);
      // After the branches: where they come back together.
      const rejoins = new Set<string>();
      const walk = (from: string, seen: Set<string>) => { for (const edge of definition.edges.filter(candidate => candidate.from === from)) { if (seen.has(edge.to)) continue; seen.add(edge.to); if (incoming(edge.to) > 1) rejoins.add(edge.to); else walk(edge.to, seen); } };
      walk(key, new Set());
      for (const rejoin of rejoins) visit(rejoin, depth, null);
      return;
    }
    // A scene where routes rejoin is listed by its party choice, after all of its branches.
    for (const edge of out) if (incoming(edge.to) === 1) visit(edge.to, depth, null);
  };
  visit(definition.startNodeKey, 0, null);
  return { rows, loose: definition.nodes.filter(node => !placed.has(node.key)) };
}

export function SceneView({ d, selected, setSelected, peers, onOpenFlow }: { d: DraftState; selected: string[]; setSelected: (keys: string[]) => void; peers: EditorPeer[]; onOpenFlow: (key: string) => void }) {
  const definition = d.definition!; const { change, positions } = d; const readOnly = d.readOnly;
  const { rows, loose } = useMemo(() => sceneOrder(definition), [definition]);
  const current = definition.nodes.find(node => node.key === selected[0]) ?? rows[0]?.node ?? definition.nodes[0]!;
  const [part, setPart] = useState(0); const [adding, setAdding] = useState<'scene' | 'part' | null>(null); const [confirming, setConfirming] = useState(false);
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
  const row = (node: Node, depth: number, _via: string | null) => {
    const text = cardText(definition, node); const count = problemsFor(node.key);
    return <li key={node.key}><button className={`scene-row${node.key === current.key ? ' current' : ''}`} style={{ paddingLeft: 12 + depth * 18 }} aria-current={node.key === current.key ? 'true' : undefined} onClick={() => setSelected([node.key])}>
      <span className={`row-icon thumb-${text.kind}${text.input ? ` thumb-${text.input}` : ''}`}><Icon name={sceneIcon(text.kind, text.input)} size={18} /></span>
      <span className="row-text"><small>{definition.startNodeKey === node.key ? 'Start · ' : ''}{text.label}</small><span>{text.banner || text.title}</span></span>
      <PeerTags peers={peersOn(peers, node.key)} className="row-peers" />
      {count > 0 && <span className="row-problems" aria-label={`${count} problems`}>{count}</span>}
    </button></li>;
  };
  return <div className="scene-editor">
    <nav className="scene-list" aria-label="Scenes in play order">
      <div className="scene-list-head"><h2>Scenes</h2><button className="with-icon small-button" disabled={readOnly} onClick={() => setAdding(adding === 'scene' ? null : 'scene')}><Icon name="plus" size={16} />Add after this</button></div>
      {adding === 'scene' && <ScenePalette label="Add a scene after this one" onPick={insertAfter} onCancel={() => setAdding(null)} />}
      <ol>{rows.map(entry => row(entry.node, entry.depth, entry.via))}</ol>
      {loose.length > 0 && <><h3>Not connected</h3><ol>{loose.map(node => row(node, 0, null))}</ol></>}
      <div className="actions"><button className="small-button" onClick={d.undo} disabled={!d.canUndo}>Undo</button><button className="small-button" onClick={d.redo} disabled={!d.canRedo}>Redo</button></div>
    </nav>
    <section className="scene-stage" aria-label="Preview">
      {current.stages.length > 1 && <div className="part-tabs" role="tablist" aria-label="Parts of this scene">{current.stages.map((stage, position) =>
        <button key={stage.key} role="tab" aria-selected={position === index} onClick={() => setPart(position)}>Part {position + 1} · {partLabel(definition, stage)}</button>)}</div>}
      <Preview node={current} index={index} />
      {d.notice && <p role="status" className="flow-notice">{d.notice}</p>}
    </section>
    <aside className="scene-props" aria-labelledby="scene-props-heading">
      <div className="inspector-head"><h2 id="scene-props-heading">{cardText(definition, current).label}</h2>
        <ActionMenu label="Scene actions" actions={[...(definition.startNodeKey === current.key || readOnly ? [] : [{ label: 'Start the game here', onSelect: () => change({ ...definition, startNodeKey: current.key }) }]),
          { label: 'Show in the Flow editor', onSelect: () => onOpenFlow(current.key) }, ...(readOnly ? [] : [{ label: 'Delete scene…', danger: true, onSelect: () => setConfirming(true) }])]} /></div>
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
      {/* Where it leads is the flow's business: shown here, changed in the Flow editor. */}
      <p className="scene-next"><span>Next: {nextSummary(definition, current).replace(/^→ /, '')}</span> <button className="link-button" onClick={() => onOpenFlow(current.key)}>Change in the Flow editor</button></p>
      <fieldset className="view-lock" disabled={readOnly}>{!isWheelScene(current.stages[index]) && (definition['wheels'] as unknown[] | undefined)?.length ? <Section key={'spin-' + current.key} title="Wheel of fortune" summary={(current.stages[index]?.['spin'] as { wheel?: string } | undefined)?.wheel ? 'Spun here' : 'Not on this scene'}><SpinFields definition={definition} node={current} index={index} onChange={onChange} /></Section> : null}</fieldset>
      {confirming && <ConfirmDialog title={`Delete “${cardText(definition, current).title}”?`} text="The scene and its connections go. Undo (Ctrl/Cmd+Z) brings it back." confirm="Delete scene"
        onConfirm={() => { const kept = { ...positions }; delete kept[current.key]; setConfirming(false); change(deleteScene(definition, current.key), kept); setSelected([]); }} onCancel={() => setConfirming(false)} />}
    </aside>
  </div>;
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
