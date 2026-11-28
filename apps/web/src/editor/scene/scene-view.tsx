import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DefinitionIssue, EditorPeer } from '@party/contracts';
import { peersOn, PeerTags } from '../live/presence.js';
import { Icon, sceneIcon } from '../controls/icons.js';
import type { SceneTextTarget } from './text-edits.js';
import { StageFields } from './inspector.js';
import { ActionMenu, ContextMenu } from '../controls/action-menu.js';
import { ReplaceSceneDialog, REPLACE_TEXTS } from './replace-scene.js';
import { ConfirmDialog } from '../controls/confirm-dialog.js';
import { ScenePalette, type SceneChoice } from '../controls/scene-palette.js';
import { SpinFields } from '../shell/show-settings.js';
import { Section } from '../controls/section.js';
import { isWheelScene, addDrawGames, addScene, COLUMN_STEP, cardText, connect, deleteScene, duplicateScenes, freeSpot, insertOnEdge, insertTeamsBefore, isRoute, newStage, optionsOf, pasteScenes, prefabFrom, snap, uniqueKey, updateStage, type Definition, type Node, type SceneType } from '../model.js';
import { sceneMenuActions } from '../flow/scene-menu.js';
import { copyScenesToClipboard, readSceneClipboard } from '../flow/scene-clipboard.js';
import { SavePrefab } from '../flow/save-prefab.js';
import { FLOW_TEXTS } from '../flow/flow.text.js';
import { grouped, ungrouped } from '../flow/groups.js';
import { translate, useTexts } from '../../i18n/texts.js';
import { SCENE_PRESENTATION_TEXTS } from './scene-presentation.text.js';
import { ScenePreview, ScenePreviewDialog } from './scene-preview.js';
import { PhoneDevicePicker } from '../../ui/phone-devices.js';
import { FIELDS_TEXTS } from './fields.text.js';
const t = (key: keyof typeof FIELDS_TEXTS.en, values?: Record<string, string | number>) => translate(FIELDS_TEXTS, key, values);
import type { DraftState } from '../shell/use-draft.js';

// What a part is, without the scene's own route or rejoin label.
const partLabel = (definition: Definition, stage: Node['stages'][number]) => cardText(definition, { key: '\u0000part', stages: [stage] }).label;
const PART_TYPES: SceneType[] = ['info', 'quiz', 'writing', 'upload', 'drawing', 'order', 'challenge', 'vote', 'scoreboard', 'minigame', 'duel'];
const TIMELINE_LAYOUT = '(max-width: 1000px)';
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
  const labels = useTexts(SCENE_PRESENTATION_TEXTS);
  const { rows, loose } = useMemo(() => sceneOrder(definition), [definition]);
  const current = definition.nodes.find(node => node.key === selected[0]) ?? rows[0]?.node ?? definition.nodes[0]!;
  const [part, setPart] = useState(0); const [adding, setAdding] = useState<'scene' | 'part' | null>(null); const [confirming, setConfirming] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const index = Math.min(part, current.stages.length - 1);
  const problems = d.issues.filter(issue => issue.nodeKey === current.key);
  const [rowMenu, setRowMenu] = useState<{ node: Node; at: { x: number; y: number }; button: HTMLButtonElement }>();
  const closeRowMenu = useCallback(() => setRowMenu(undefined), []);
  const [prefabRequest, setPrefabRequest] = useState(0);
  useEffect(() => { setPart(0); setConfirming(false); setPrefabRequest(0); }, [current.key]);
  const openRowMenu = (node: Node, button: HTMLButtonElement, clientX = 0, clientY = 0) => {
    const box = button.getBoundingClientRect();
    setAdding(null); setHoveredScene(undefined); setFocusedScene(undefined); setSelected([node.key]);
    setRowMenu({ node, button, at: clientX || clientY ? { x: clientX, y: clientY } : { x: box.left + 16, y: box.bottom } });
  };
  const actionsFor = (node: Node) => {
    const clip = readSceneClipboard();
    return sceneMenuActions({ count: 1, isStart: definition.startNodeKey === node.key, readOnly, canPaste: Boolean(clip),
      oneGroup: false, anyGrouped: false, openInFlow: t('changeLeads') }, {
      open: () => onOpenFlow(node.key),
      startHere: () => change({ ...definition, startNodeKey: node.key }),
      duplicate: () => {
        const result = duplicateScenes(definition, positions, [node.key]);
        change(result.definition, result.positions);
        setSelected(result.keys);
      },
      copy: () => {
        const copied = copyScenesToClipboard(definition, positions, [node.key], d.draft?.gameId ?? null);
        d.setNotice(translate(FLOW_TEXTS, copied ? 'sceneCopiedFromMenu' : 'noCopy'));
      },
      paste: () => {
        if (!clip) return;
        const source = clip.positions[clip.keys[0]!] ?? { x: 0, y: 0 };
        const target = positions[node.key] ?? { x: 0, y: 0 };
        const result = pasteScenes(definition, positions, clip.from, clip.positions, clip.keys,
          { x: target.x + COLUMN_STEP - source.x, y: target.y - source.y });
        change(result.definition, result.positions);
        setSelected(result.keys);
      },
      replace: () => setReplacing(true),
      savePrefab: () => setPrefabRequest(request => request + 1),
      remove: () => setConfirming(true),
    });
  };
  const replacement = useTexts(REPLACE_TEXTS); const [replacing, setReplacing] = useState(false);
  const [canvasDevice, setCanvasDevice] = useState<'sharedScreen' | 'phone'>('sharedScreen');
  const [previewDevice, setPreviewDevice] = useState<'sharedScreen' | 'phone'>();
  const tryScene = () => {
    const stage = current.stages[index];
    setPreviewDevice(stage?.kind === 'minigame' ? (stage['game'] === 'count-the-dots' ? 'sharedScreen' : 'phone') : canvasDevice);
  };
  const [mediaKey, setMediaKey] = useState<string>();
  const scenePart = `${current.key}:${index}`;
  const [textSelection, setTextSelection] = useState<{ part: string; target: SceneTextTarget }>();
  const selectedText = textSelection?.part === scenePart ? textSelection.target : 'promptStyle';
  const [pictureSelection, setPictureSelection] = useState<{ part: string; key: string }>();
  const selectedImage = pictureSelection?.part === scenePart ? pictureSelection.key : undefined;
  const selectImage = (key?: string) => setPictureSelection(current => key ? { part: scenePart, key } : current?.part === scenePart ? undefined : current);
  const selectText = (target: SceneTextTarget) => {
    selectImage();
    setTextSelection({ part: scenePart, target });
  };
  const editMedia = () => { if (!readOnly) setMediaKey(scenePart); };
  const problemsFor = (key: string) => d.issues.filter(issue => issue.nodeKey === key).length;
  const onChange = (next: Definition, group?: string) => change(next, undefined, group);

  /** A new scene right after the current one: the current scene now leads to it, and it leads where the current one did. */
  const insertAfter = ({ type, variant }: SceneChoice) => {
    const old = isRoute(current) ? undefined : definition.edges.find(edge => edge.from === current.key);
    const insertion = old && type === 'draw-routes' ? insertOnEdge(definition, old.key, type, variant) : null;
    const added = insertion ?? addScene(definition, type, variant);
    let next = added.definition;
    let games = insertion?.games ?? [];
    if (!insertion && !isRoute(current)) {
      next = connect(next, current.key, undefined, added.key);
      if (old) next = connect(next, added.key, optionsOf(next.nodes.find(node => node.key === added.key))[0]?.key, old.to);
    }
    if (!insertion && type === 'draw-routes') {
      const generated = addDrawGames(next, added.key);
      next = generated.definition; games = generated.keys;
    }
    const base = positions[current.key] ?? { x: 0, y: 0 };
    const point = freeSpot(next, positions, added.key, { x: snap(base.x + 360), y: snap(base.y) });
    const placed = { ...positions, [added.key]: point };
    for (const key of games) placed[key] = freeSpot(next, placed, key, { x: point.x + COLUMN_STEP, y: point.y });
    change(next, games.length ? grouped(placed, [added.key, ...games]) : placed);
    setSelected([added.key]); setAdding(null);
  };
  const addPart = ({ type, variant }: SceneChoice) => {
    const stage = { ...newStage(type, definition, variant), key: uniqueKey('part', current.stages.map(entry => entry.key)) };
    change({ ...definition, nodes: definition.nodes.map(node => node.key === current.key ? { ...node, stages: [...node.stages, stage] } : node) });
    setPart(current.stages.length); setAdding(null);
  };
  const addTeamSetup = (configured: Node['stages'][number]) => {
    const added = insertTeamsBefore(updateStage(definition, current.key, index, () => configured), current.key);
    const before = positions[current.key] ?? { x: 0, y: 0 };
    const point = freeSpot(added.definition, positions, added.key, { x: before.x - COLUMN_STEP, y: before.y });
    change(added.definition, { ...positions, [added.key]: point });
    setSelected([added.key]);
    setPart(0);
  };
  const movePart = (from: number, to: number) => {
    const stages = [...current.stages]; const [moved] = stages.splice(from, 1); stages.splice(to, 0, moved!);
    change({ ...definition, nodes: definition.nodes.map(node => node.key === current.key ? { ...node, stages } : node) }); setPart(to);
  };
  const removePart = (at: number) => { change({ ...definition, nodes: definition.nodes.map(node => node.key === current.key ? { ...node, stages: node.stages.filter((_, position) => position !== at) } : node) }); setPart(0); };
  // A party choice's routes fold open and closed in the list; the route of the selected scene always opens.
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [hoveredScene, setHoveredScene] = useState<string>();
  const [focusedScene, setFocusedScene] = useState<string>();
  const selectedMarker = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const compact = matchMedia(TIMELINE_LAYOUT);
    const reveal = () => {
      const button = selectedMarker.current;
      const track = button?.closest('ol');
      if (!compact.matches || !button || !track) return;
      const marker = button.getBoundingClientRect();
      const strip = track.getBoundingClientRect();
      if (marker.left < strip.left) track.scrollLeft += marker.left - strip.left - 6;
      else if (marker.right > strip.right) track.scrollLeft += marker.right - strip.right + 6;
    };
    reveal();
    compact.addEventListener('change', reveal);
    return () => compact.removeEventListener('change', reveal);
  }, [current.key, folded]);
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
      {!open && problemsIn > 0 && <span className="row-problems" aria-label={t('problemsN', { count: problemsIn })}>{problemsIn}</span>}
    </button></li>;
  };
  const row = (node: Node, depth: number, unconnected = false) => {
    const text = cardText(definition, node); const count = problemsFor(node.key);
    const selected = node.key === current.key;
    return <li key={node.key} className={unconnected ? 'scene-unconnected' : undefined}><button type="button" ref={selected ? selectedMarker : null}
      className={`scene-row${selected ? ' current' : ''}${count ? ' has-problems' : ''}`} style={{ paddingLeft: 12 + depth * 18 }} aria-current={selected ? 'true' : undefined}
      onPointerEnter={event => { if (event.pointerType === 'mouse' && matchMedia(TIMELINE_LAYOUT).matches) setHoveredScene(node.key); }}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) { setHoveredScene(undefined); setFocusedScene(node.key); } }} onBlur={() => setFocusedScene(undefined)}
      onContextMenu={event => { event.preventDefault(); openRowMenu(node, event.currentTarget, event.clientX, event.clientY); }}
      onKeyDown={event => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        event.preventDefault(); openRowMenu(node, event.currentTarget);
      }}
      onClick={() => setSelected([node.key])}>
      <span className={`row-icon thumb-${text.kind}${text.input ? ` thumb-${text.input}` : ''}`}><Icon name={sceneIcon(text.kind, text.input)} size={18} /></span>
      <span className="row-text"><small>{definition.startNodeKey === node.key ? t('start') : ''}{text.label}</small><span>{text.banner || text.title}</span></span>
      <PeerTags peers={peersOn(peers, node.key)} className="row-peers" />
      {count > 0 && <span className="row-problems" aria-label={`${count} problems`}>{count}</span>}
    </button></li>;
  };
  const listed = rows.flatMap(entry => {
    const hidden = entry.branch.some(id => folded.has(id));
    // A route's heading shows when the routes around it are open, even while its own scenes are folded away.
    const head = entry.via && !entry.branch.slice(0, -1).some(id => folded.has(id)) ? [routeHead(entry)] : [];
    return [...head, ...(hidden ? [] : [row(entry.node, entry.depth)])];
  });
  const timelineDetail = cardText(definition, definition.nodes.find(node => node.key === (hoveredScene ?? focusedScene)) ?? current);
  const routeIds = [...new Set(rows.flatMap(entry => entry.branch))];
  const allFolded = routeIds.length > 0 && routeIds.every(id => folded.has(id));
  return <div className="scene-editor">
    <nav className="scene-list" aria-label={t('playOrder')} onPointerLeave={() => setHoveredScene(undefined)}>
      <div className="scene-list-head"><h2>{t('scenes')}</h2>
        {routeIds.length > 0 && <button type="button" className="small-button icon-only" aria-label={t(allFolded ? 'unfoldAll' : 'foldAll')} title={t(allFolded ? 'unfoldAll' : 'foldAll')}
          onClick={() => setFolded(allFolded ? new Set() : new Set(routeIds))}><Icon name={allFolded ? 'unfold-all' : 'fold-all'} size={16} /></button>}
        <button ref={addButton} type="button" className="scene-add-after with-icon small-button" title={t('addAfter')} aria-label={t('addAfter')}
          disabled={readOnly} aria-expanded={adding === 'scene'} onClick={() => setAdding(adding === 'scene' ? null : 'scene')}><Icon name="plus" size={16} /><span>{t('addShort')}</span></button></div>
      <ol className="scene-track">{listed}
        {loose.length > 0 && <li className="scene-unconnected-label"><h3>{t('notConnected')}</h3></li>}
        {loose.map(node => row(node, 0, true))}
      </ol>
      <p className="scene-timeline-detail" aria-hidden="true" title={timelineDetail.banner || timelineDetail.title}>
        <strong>{timelineDetail.label}</strong><span>{timelineDetail.banner || timelineDetail.title}</span>
      </p>
    </nav>
    {rowMenu && <ContextMenu label={t('sceneActions')} actions={actionsFor(rowMenu.node)} at={rowMenu.at}
      returnFocus={rowMenu.button} onClose={closeRowMenu} />}
    {/* Floating over the preview, next to the list (on top of everything, so nothing covers it). */}
    {adding === 'scene' && <FloatingMenu anchor={addButton.current} onClose={() => setAdding(null)}><ScenePalette label={t('addAfterLabel')} onPick={insertAfter} onCancel={() => setAdding(null)} /></FloatingMenu>}
    <section className="scene-stage" aria-label={t('preview')}>
      {current.stages.length > 1 && <div className="part-tabs" role="tablist" aria-label={t('partsOf')}>{current.stages.map((stage, position) =>
        <button key={stage.key} role="tab" aria-selected={position === index} onClick={() => setPart(position)}>Part {position + 1} · {partLabel(definition, stage)}</button>)}</div>}
      <div className="scene-canvas-tools">
        <div className="segmented" role="group" aria-label={labels('devices')}>
          {(['sharedScreen', 'phone'] as const).map(device => <button key={device} type="button" aria-pressed={canvasDevice === device}
            onClick={() => setCanvasDevice(device)}>{t(device)}</button>)}
        </div>
        {/* Which phone the preview shows, next to the toggle: only while the phone is shown. */}
        {canvasDevice === 'phone' && <PhoneDevicePicker className="canvas-device-picker" label={t('phoneModel')} />}
      </div>
      <ScenePreview key={`${scenePart}:${canvasDevice}`} definition={definition} node={current} index={index} device={canvasDevice} phonePicker={false}
        canvas={canvasDevice === 'sharedScreen' ? {
          readOnly, selectedText, selectText, selectedImage, selectImage, editMedia, edit: (update, field) => onChange(updateStage(definition, current.key, index, update), `${current.key}:${index}:${field}`),
        } : undefined} />
      {previewDevice && <ScenePreviewDialog definition={definition} node={current} index={index} initialDevice={previewDevice} returnToEditor onClose={() => setPreviewDevice(undefined)} />}
      {d.notice && <p role="status" className="flow-notice">{d.notice}</p>}
    </section>
    <aside className="scene-props" aria-labelledby="scene-props-heading">
      <div className="inspector-head"><h2 id="scene-props-heading">{cardText(definition, current).label}</h2>
        <button type="button" className="small-button with-icon try-scene" aria-haspopup="dialog" title={t('tryScene')} onClick={tryScene}><Icon name="try" size={16} /><span>{t('tryScene')}</span></button>
        <ActionMenu label={t('sceneActions')} actions={[...(definition.startNodeKey === current.key || readOnly ? [] : [{ label: t('startHere'), icon: 'start', onSelect: () => change({ ...definition, startNodeKey: current.key }) }]),
          { label: t('changeLeads'), icon: 'route', onSelect: () => onOpenFlow(current.key) }, ...(readOnly ? [] : [{ label: replacement('action'), icon: 'edit', onSelect: () => setReplacing(true) }, { label: t('deleteScene'), icon: 'trash', danger: true, onSelect: () => setConfirming(true) }])]} /></div>
      {replacing && !readOnly && <ReplaceSceneDialog key={current.key} definition={definition} node={current} onChange={next => { change(next); setPart(0); }} onClose={() => setReplacing(false)} />}
      {prefabRequest > 0 && !readOnly && <SavePrefab key={prefabRequest} startOpen
        content={() => prefabFrom(definition, positions, [current.key])} defaultName={cardText(definition, current).title}
        onClose={() => setPrefabRequest(0)} />}
      {definition.startNodeKey === current.key && <p className="start-note">{t('startsHere')}</p>}
      {problems.length > 0 && <Problems problems={problems} parts={current.stages.length} />}
      <div className="scene-edit-fields">
        {/* A small named group (K4), like the scene's settings: open as left last time. */}
        {!isRoute(current) && <Section title={t('parts')} memory="scene:parts" summary={current.stages.length === 1 ? t('partOne') : t('partsMany', { count: current.stages.length })}>
          <ol className="part-list">{current.stages.map((stage, position) => <li key={stage.key} className={position === index ? 'current' : undefined}>
            <button className="link-button" onClick={() => setPart(position)}>{t('partN', { number: position + 1, label: partLabel(definition, stage) })}</button>
            <button className="icon-button" aria-label={t('movePartUp', { number: position + 1 })} disabled={readOnly || position === 0} onClick={() => movePart(position, position - 1)}>↑</button>
            <button className="icon-button" aria-label={t('removePart', { number: position + 1 })} disabled={readOnly || current.stages.length === 1} onClick={() => removePart(position)}>×</button></li>)}</ol>
          <button className="small-button with-icon" disabled={readOnly} onClick={() => setAdding(adding === 'part' ? null : 'part')}><Icon name="plus" size={16} />{t('addPart')}</button>
          {adding === 'part' && <div className="part-palette"><ScenePalette label={t('addPart')} only={PART_TYPES} inline onPick={addPart} onCancel={() => setAdding(null)} /></div>}
          <p className="hint">{t('partsHint')}</p>
        </Section>}
        {current.stages.length > 1 && <h3>Part {index + 1}</h3>}
        <fieldset className="view-lock" disabled={readOnly}><StageFields definition={definition} node={current} index={index} onChange={onChange}
          textTarget={selectedText} selectText={selectText} selectedImage={selectedImage} selectImage={selectImage} readOnly={readOnly}
          addTeams={addTeamSetup} mediaOpen={!readOnly && mediaKey === scenePart} openMedia={editMedia} closeMedia={() => setMediaKey(undefined)} /></fieldset>
      </div>
      <fieldset className="view-lock" disabled={readOnly}>{!isWheelScene(current.stages[index]) && (definition['wheels'] as unknown[] | undefined)?.length ? <Section key={'spin-' + current.key} title={t('wheel')} memory="Wheel of fortune" summary={t((current.stages[index]?.['spin'] as { wheel?: string } | undefined)?.wheel ? 'spunHere' : 'notHere')}><SpinFields definition={definition} node={current} index={index} onChange={onChange} /></Section> : null}</fieldset>
      {confirming && <ConfirmDialog title={t('deleteAsk', { title: cardText(definition, current).title })} text={t('deleteText')} confirm={t('deleteConfirm')}
        onConfirm={() => { const kept = ungrouped(positions, [current.key]); delete kept[current.key]; setConfirming(false); change(deleteScene(definition, current.key), kept); setSelected([]); }} onCancel={() => setConfirming(false)} />}
    </aside>
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
  const maxLeft = window.innerWidth - Math.min(420, window.innerWidth - 24) - 12;
  const left = Math.max(8, Math.min(rect?.left ?? 8, maxLeft));
  return createPortal(<div ref={box} className="floating-menu" style={{ top, left, maxHeight: `calc(100dvh - ${top + 12}px)` }}>{children}</div>, anchor?.closest('.editor') ?? document.body);
}

function Problems({ problems, parts }: { problems: DefinitionIssue[]; parts: number }) {
  return <div role="alert" className="inspector-problems"><h3>{t('problemsHere')}</h3><ul>{problems.map((issue, position) => <li key={position}>{issue.stageIndex !== null && parts > 1 ? t('part', { number: issue.stageIndex + 1 }) : ''}{issue.message}</li>)}</ul></div>;
}
