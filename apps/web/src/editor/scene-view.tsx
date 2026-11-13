import { useEffect, useMemo, useState } from 'react';
import type { DefinitionIssue } from '@party/contracts';
import { Icon, sceneIcon } from './icons.js';
import { FormFields, NextFields, StageFields } from './inspector.js';
import { ScenePalette } from './flow-view.js';
import { addScene, autoLayout, cardText, connect, deleteScene, freeSpot, isRoute, newStage, optionsOf, snap, uniqueKey, type Definition, type Node, type SceneType } from './model.js';
import type { DraftState } from './use-draft.js';

// What a part is, without the scene's own route or rejoin label.
const partLabel = (definition: Definition, stage: Node['stages'][number]) => cardText(definition, { key: '\u0000part', stages: [stage] }).label;
const PART_TYPES: SceneType[] = ['info', 'quiz', 'writing', 'upload', 'drawing', 'order', 'challenge', 'vote', 'scoreboard', 'minigame'];
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

export function SceneView({ d, selected, setSelected }: { d: DraftState; selected: string[]; setSelected: (keys: string[]) => void }) {
  const definition = d.definition!; const { change, positions } = d;
  const { rows, loose } = useMemo(() => sceneOrder(definition), [definition]);
  const current = definition.nodes.find(node => node.key === selected[0]) ?? rows[0]?.node ?? definition.nodes[0]!;
  const [part, setPart] = useState(0); const [adding, setAdding] = useState<'scene' | 'part' | null>(null); const [confirming, setConfirming] = useState(false);
  useEffect(() => { setPart(0); setConfirming(false); }, [current.key]);
  const index = Math.min(part, current.stages.length - 1);
  const problems = d.issues.filter(issue => issue.nodeKey === current.key);
  const problemsFor = (key: string) => d.issues.filter(issue => issue.nodeKey === key).length;
  const onChange = (next: Definition, group?: string) => change(next, undefined, group);

  /** A new scene right after the current one: the current scene now leads to it, and it leads where the current one did. */
  const insertAfter = (type: SceneType) => {
    const added = addScene(definition, type); let next = added.definition;
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
  const addPart = (type: SceneType) => {
    const stage = { ...newStage(type, definition), key: uniqueKey('part', current.stages.map(entry => entry.key)) };
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
      {count > 0 && <span className="row-problems" aria-label={`${count} problems`}>{count}</span>}
    </button></li>;
  };
  return <div className="scene-editor">
    <nav className="scene-list" aria-label="Scenes in play order">
      <div className="scene-list-head"><h2>Scenes</h2><button className="with-icon small-button" onClick={() => setAdding(adding === 'scene' ? null : 'scene')}><Icon name="plus" size={16} />Add after this</button></div>
      {adding === 'scene' && <ScenePalette label="Add a scene after this one" onPick={insertAfter} onCancel={() => setAdding(null)} />}
      <ol>{rows.map(entry => row(entry.node, entry.depth, entry.via))}</ol>
      {loose.length > 0 && <><h3>Not connected</h3><ol>{loose.map(node => row(node, 0, null))}</ol></>}
      <div className="actions"><button className="small-button" onClick={d.undo} disabled={!d.canUndo}>Undo</button><button className="small-button" onClick={d.redo} disabled={!d.canRedo}>Redo</button>
        <button className="small-button" onClick={() => change(definition, autoLayout(definition))}>Tidy the flow</button></div>
    </nav>
    <section className="scene-stage" aria-label="Preview">
      {current.stages.length > 1 && <div className="part-tabs" role="tablist" aria-label="Parts of this scene">{current.stages.map((stage, position) =>
        <button key={stage.key} role="tab" aria-selected={position === index} onClick={() => setPart(position)}>Part {position + 1} · {partLabel(definition, stage)}</button>)}</div>}
      <Preview node={current} index={index} />
      {d.notice && <p role="status" className="flow-notice">{d.notice}</p>}
    </section>
    <aside className="scene-props" aria-labelledby="scene-props-heading">
      <h2 id="scene-props-heading">{cardText(definition, current).label}</h2>
      {problems.length > 0 && <Problems problems={problems} parts={current.stages.length} />}
      {definition.startNodeKey === current.key ? <p className="start-note">The game starts here.</p> : <button onClick={() => change({ ...definition, startNodeKey: current.key })}>Start the game here</button>}
      {!isRoute(current) && <fieldset><legend>Parts of this scene</legend>
        <ol className="part-list">{current.stages.map((stage, position) => <li key={stage.key} className={position === index ? 'current' : undefined}>
          <button className="link-button" onClick={() => setPart(position)}>Part {position + 1}: {partLabel(definition, stage)}</button>
          <button className="small-button" aria-label={`Move part ${position + 1} up`} disabled={position === 0} onClick={() => movePart(position, position - 1)}>↑</button>
          <button className="small-button" aria-label={`Remove part ${position + 1}`} disabled={current.stages.length === 1} onClick={() => removePart(position)}>Remove</button></li>)}</ol>
        <button className="small-button with-icon" onClick={() => setAdding(adding === 'part' ? null : 'part')}><Icon name="plus" size={16} />Add a part</button>
        {adding === 'part' && <div className="part-palette"><PartPalette onPick={addPart} onCancel={() => setAdding(null)} /></div>}
        <p className="hint">Parts play one after another inside this scene, for example a question and then its scoreboard.</p>
      </fieldset>}
      <h3>Part {index + 1}</h3>
      <StageFields definition={definition} node={current} index={index} onChange={onChange} />
      <NextFields definition={definition} node={current} onChange={onChange} />
      <GameSettings definition={definition} onChange={onChange} />
      {confirming ? <div className="actions"><button className="danger" onClick={() => { const kept = { ...positions }; delete kept[current.key]; change(deleteScene(definition, current.key), kept); setSelected([]); }}>Yes, delete this scene</button><button onClick={() => setConfirming(false)}>Keep it</button></div>
        : <button className="danger-outline" onClick={() => setConfirming(true)}>Delete scene</button>}
    </aside>
  </div>;
}

function PartPalette({ onPick, onCancel }: { onPick: (type: SceneType) => void; onCancel: () => void }) {
  return <div className="add-menu inline" role="menu" aria-label="Add a part">
    {PART_TYPES.map(type => <button key={type} role="menuitem" onClick={() => onPick(type)}><Icon name={type === 'quiz' ? 'quiz' : type} /><span><strong>{{ info: 'Cutscene or info', quiz: 'Quiz question', writing: 'Writing round', upload: 'Picture or video round', drawing: 'Drawing round', order: 'Put in order', challenge: 'Host-judged challenge', vote: 'Vote on answers', scoreboard: 'Scoreboard', minigame: 'Minigame', route: '' }[type]}</strong></span></button>)}
    <button role="menuitem" className="add-cancel" onClick={onCancel}>Cancel</button></div>;
}
function Problems({ problems, parts }: { problems: DefinitionIssue[]; parts: number }) {
  return <div role="alert" className="inspector-problems"><h3>Problems in this scene</h3><ul>{problems.map((issue, position) => <li key={position}>{issue.stageIndex !== null && parts > 1 ? `Part ${issue.stageIndex + 1}: ` : ''}{issue.message}</li>)}</ul></div>;
}

/** Game-wide settings: whether the game has teams, and how rounds play by default. */
function GameSettings({ definition, onChange }: { definition: Definition; onChange: (next: Definition, group?: string) => void }) {
  const teams = definition['teams'] as Parameters<typeof FormFields>[0]['form'] | undefined;
  const play = definition['play'] as { kind: string; answers?: string; points?: string } | undefined;
  const set = (key: 'teams' | 'play', value: unknown) => { const next = { ...definition }; if (value === undefined) delete next[key]; else next[key] = value; onChange(next); };
  return <details className="game-settings"><summary>Game settings: teams and default play</summary>
    <label className="choice"><input type="checkbox" checked={Boolean(teams)} onChange={event => set('teams', event.target.checked ? { split: { kind: 'count', teams: 2 }, formation: 'random' } : undefined)} />This game has teams</label>
    {teams && <FormFields form={teams} onChange={form => set('teams', form)} />}
    <label>Rounds play, unless a round says otherwise<select value={play?.kind === 'teams' ? 'teams' : 'solo'} disabled={!teams && play?.kind !== 'teams'}
      onChange={event => set('play', event.target.value === 'solo' ? undefined : { kind: 'teams', lineup: { kind: 'game' }, answers: 'everyone', points: 'both' })}>
      <option value="solo">Everyone for themselves</option><option value="teams">In the game’s teams</option></select></label>
    {play?.kind === 'teams' && <>
      <label>Who answers<select value={play.answers} onChange={event => set('play', { ...play, answers: event.target.value })}><option value="everyone">Everyone</option><option value="captain">One captain per team</option></select></label>
      <label>Points go to<select value={play.points} onChange={event => set('play', { ...play, points: event.target.value })}><option value="both">The team and each member</option><option value="team">The team</option><option value="members">Each member</option></select></label>
    </>}
  </details>;
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
