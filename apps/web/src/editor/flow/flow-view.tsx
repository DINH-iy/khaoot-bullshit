import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { DefinitionIssue } from '@party/contracts';
import { Icon, sceneIcon } from '../controls/icons.js';
import { Inspector } from '../scene/inspector.js';
import { Minimap } from './minimap.js';
import {
  addConnectedScene, addScene, autoLayout, duplicateScenes, pasteScenes, CARD_WIDTH, cardHeight, cardText, connect, connectProblem, curve, deleteScene, disconnect, freeSpot, GRID, inputPort,
  insertOnEdge, insertPrefab, isRoute, prefabFrom, optionsOf, outputPort, pointOnCurve, snap, snapCard, SNAP_RADIUS, type Definition, type Guides, type Point, type Positions,
} from '../model.js';
import { ScenePalette, type SceneChoice } from '../controls/scene-palette.js';
import { SavePrefab } from './save-prefab.js';
import { ConfirmDialog } from '../controls/confirm-dialog.js';
import type { PrefabContent } from '@party/contracts';
import type { DraftState } from '../shell/use-draft.js';
import type { LiveState } from '../live/use-live.js';
import { PeerCursors, peerOutline, peersOn, PeerTags } from '../live/presence.js';

interface Connecting { from: string; option: string | undefined; pointer: Point; target: string | null; blocked: string | null; rewire: string | null }
interface Box { from: Point; to: Point }
// The editor's clipboard: only the copied scenes and the connections between them, kept in this
// browser so they can be pasted into another game after opening it. A convenience; never required.
interface Clip { keys: string[]; from: Definition; positions: Positions; game: string | null }
const CLIP = 'party-editor-clipboard';
function writeClip(clip: Clip) { try { localStorage.setItem(CLIP, JSON.stringify(clip)); return true; } catch { return false; } }
function readClip(): Clip | null { try { const value = JSON.parse(localStorage.getItem(CLIP) ?? 'null') as Clip | null; return value && Array.isArray(value.keys) && value.from && Array.isArray(value.from.nodes) ? value : null; } catch { return null; } }
const blockedText: Record<string, string> = { self: 'A scene cannot lead to itself.', circle: 'That would make the game go round in a circle.', 'same-scene': 'Another option of this choice already leads there.' };

export function FlowView({ d, selected, setSelected, live, onOpenScene }: { d: DraftState; selected: string[]; setSelected: (keys: string[]) => void; live: LiveState; onOpenScene: (key: string) => void }) {
  const readOnly = d.readOnly;
  const definition = d.definition!; const { positions, setPositions, change, setNotice } = d;
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [view, setView] = useState({ x: 48, y: 48, zoom: 1 }); const [guides, setGuides] = useState<Guides>({ x: null, y: null });
  const [connecting, setConnecting] = useState<Connecting | null>(null); const [box, setBox] = useState<Box | null>(null);
  const [pending, setPending] = useState<{ from: string; option: string | undefined } | null>(null);
  // at: where the menu opens; place: where the new scene goes (the right-clicked spot), else beside `at`.
  // `onEdge`: the arrow a new scene goes on (between the two scenes it connects).
  const [adding, setAdding] = useState<{ from: string | null; option: string | undefined; at: Point; place?: Point; onEdge?: string } | null>(null);
  // Delete or Backspace on selected scenes asks first.
  const [askDelete, setAskDelete] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const select = (keys: string[]) => { setSelected(keys); setSelectedEdge(null); };
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const observer = new ResizeObserver(() => { const rect = element.getBoundingClientRect(); setSize({ width: rect.width, height: rect.height }); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  // Copy and paste within the editor (and across games in the same tab), with connections between the copied scenes.
  const duplicate = (keys: string[], offset?: Point) => {
    if (!keys.length) return;
    const copied = duplicateScenes(definition, positions, keys, offset);
    change(copied.definition, copied.positions); select(copied.keys);
    setNotice(`${keys.length === 1 ? 'Scene' : `${keys.length} scenes`} duplicated. Connect ${keys.length === 1 ? 'it' : 'them'} where you want ${keys.length === 1 ? 'it' : 'them'} to play.`);
  };

  const toCanvas = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.zoom, y: (clientY - rect.top - view.y) / view.zoom };
  }, [view]);
  const reveal = useCallback((point: Point) => {
    const rect = canvas.current?.getBoundingClientRect(); if (!rect) return;
    setView(current => {
      const left = point.x * current.zoom + current.x; const top = point.y * current.zoom + current.y;
      const right = left + CARD_WIDTH * current.zoom; const bottom = top + 200 * current.zoom;
      const dx = right > rect.width - 24 ? rect.width - 24 - right : left < 24 ? 24 - left : 0;
      const dy = bottom > rect.height - 24 ? rect.height - 24 - bottom : top < 24 ? 24 - top : 0;
      return dx || dy ? { ...current, x: current.x + dx, y: current.y + dy } : current;
    });
  }, []);

  // ---------- cards: click to select (Shift/Cmd adds), drag to move all selected ----------
  const startCardDrag = (event: ReactPointerEvent<HTMLElement>, key: string) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('.port, .port-plus')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const group = selected.includes(key) && !additive ? selected : [key];
    const origin = toCanvas(event.clientX, event.clientY); const starts = Object.fromEntries(group.map(member => [member, positions[member]!]));
    let moved = false; let latest = positions; const element = event.currentTarget;
    const move = (moveEvent: PointerEvent) => {
      const at = toCanvas(moveEvent.clientX, moveEvent.clientY);
      if (readOnly) return; // viewing: a press only selects
      if (!moved && Math.hypot(at.x - origin.x, at.y - origin.y) < 4 / view.zoom) return;
      moved = true;
      // The grabbed card snaps; the rest of the selection keeps its distance to it.
      const snapped = snapCard(definition, positions, key, { x: starts[key]!.x + at.x - origin.x, y: starts[key]!.y + at.y - origin.y });
      const dx = snapped.point.x - starts[key]!.x; const dy = snapped.point.y - starts[key]!.y;
      latest = { ...positions, ...Object.fromEntries(group.map(member => [member, { x: starts[member]!.x + dx, y: starts[member]!.y + dy }])) };
      setGuides(group.length === 1 ? snapped.guides : { x: null, y: null }); setPositions(latest);
    };
    const up = () => {
      element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up);
      setGuides({ x: null, y: null });
      if (moved) {
        const settled = group.length === 1 ? { ...latest, [key]: freeSpot(definition, latest, key, latest[key]!) } : latest;
        change(definition, settled, '', positions);
        if (group.length === 1 && !selected.includes(key)) select([key]);
      } else if (pending) finishPending(key);
      else if (additive) select(selected.includes(key) ? selected.filter(member => member !== key) : [...selected, key]);
      else select([key]);
    };
    element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up);
  };

  // ---------- connections: drag from an output, or grab the end of an arrow to move it ----------
  const finishPending = (to: string) => {
    if (!pending) return;
    const problem = connectProblem(definition, pending.from, pending.option, to);
    if (problem) setNotice(blockedText[problem] ?? ''); else { change(connect(definition, pending.from, pending.option, to)); setNotice(''); }
    setPending(null);
  };
  const nearestInput = useCallback((point: Point, from: string, option: string | undefined, without: string | null) => {
    let best: { key: string; distance: number } | null = null;
    for (const node of definition.nodes) {
      const position = positions[node.key]; if (!position || node.key === from) continue;
      const port = inputPort(position); const distance = Math.hypot(port.x - point.x, port.y - point.y);
      const inside = point.x >= position.x && point.x <= position.x + CARD_WIDTH && point.y >= position.y && point.y <= position.y + cardHeight(node);
      if ((distance <= SNAP_RADIUS / view.zoom || inside) && (!best || distance < best.distance)) best = { key: node.key, distance };
    }
    if (!best) return { target: null, blocked: null };
    // When moving an existing arrow, judge the new target as if the old arrow were gone.
    const base = without ? disconnect(definition, without) : definition;
    return { target: best.key, blocked: connectProblem(base, from, option, best.key) };
  }, [definition, positions, view.zoom]);
  const startConnect = (event: ReactPointerEvent<Element>, from: string, option: string | undefined, rewire: string | null = null) => {
    event.stopPropagation(); if (event.button !== 0 || readOnly) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const element = event.currentTarget as Element; const origin = toCanvas(event.clientX, event.clientY);
    let state: Connecting = { from, option, pointer: origin, target: null, blocked: null, rewire }; let dragged = false;
    setConnecting(state); setNotice(''); setAdding(null);
    const move = (moveEvent: Event) => {
      const pointerEvent = moveEvent as PointerEvent; const pointer = toCanvas(pointerEvent.clientX, pointerEvent.clientY);
      if (Math.hypot(pointer.x - origin.x, pointer.y - origin.y) > 6 / view.zoom) dragged = true;
      state = { ...state, pointer, ...nearestInput(pointer, from, option, rewire) }; setConnecting(state);
    };
    const finish = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', finish); setConnecting(null); };
    const up = () => {
      finish();
      const base = rewire ? disconnect(definition, rewire) : definition;
      if (!dragged) { if (!rewire) { setPending({ from, option }); setNotice('Now tap the scene to connect to. Press Escape to cancel.'); } return; }
      if (state.target && !state.blocked) { change(connect(base, from, option, state.target)); return; }
      if (state.target && state.blocked) { setNotice(blockedText[state.blocked] ?? ''); return; }
      if (rewire) { change(base); setNotice('Connection removed. Undo brings it back.'); return; }
      setAdding({ from, option, at: state.pointer });
    };
    element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', finish);
  };
  /** Grabbing a card's input pulls the last arrow into it, to move it elsewhere. */
  const grabInput = (event: ReactPointerEvent<Element>, key: string) => {
    const incoming = definition.edges.filter(edge => edge.to === key).at(-1);
    if (incoming) startConnect(event, incoming.from, incoming.option, incoming.key);
  };

  // ---------- canvas: pan, or Shift-drag a selection box ----------
  const startCanvas = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Empty canvas is anything that is not a card, an arrow, a menu or a button.
    if ((event.target as Element).closest('.scene-card, .edge, .add-menu, button')) return;
    // The right button opens the add menu (onContextMenu below) instead of panning.
    if (event.button === 2) return;
    setAdding(null); if (pending) { setPending(null); setNotice(''); }
    const element = event.currentTarget; element.setPointerCapture(event.pointerId);
    if (event.shiftKey) {
      const from = toCanvas(event.clientX, event.clientY); let current: Box = { from, to: from }; setBox(current);
      const move = (moveEvent: PointerEvent) => { current = { from, to: toCanvas(moveEvent.clientX, moveEvent.clientY) }; setBox(current); };
      const up = () => {
        element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); setBox(null);
        const left = Math.min(current.from.x, current.to.x); const right = Math.max(current.from.x, current.to.x);
        const top = Math.min(current.from.y, current.to.y); const bottom = Math.max(current.from.y, current.to.y);
        const inside = definition.nodes.filter(node => { const at = positions[node.key]; return at && at.x < right && at.x + CARD_WIDTH > left && at.y < bottom && at.y + cardHeight(node) > top; }).map(node => node.key);
        select([...new Set([...selected, ...inside])]);
      };
      element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); return;
    }
    select([]);
    const origin = { x: event.clientX - view.x, y: event.clientY - view.y };
    const move = (moveEvent: PointerEvent) => setView(current => ({ ...current, x: moveEvent.clientX - origin.x, y: moveEvent.clientY - origin.y }));
    const up = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); };
    element.addEventListener('pointermove', move); element.addEventListener('pointerup', up);
  };
  const zoomBy = (factor: number, around?: Point) => setView(current => {
    const zoom = Math.min(1.75, Math.max(0.25, current.zoom * factor));
    const rect = canvas.current?.getBoundingClientRect(); const anchor = around ?? { x: (rect?.width ?? 800) / 2, y: (rect?.height ?? 600) / 2 };
    return { zoom, x: anchor.x - (anchor.x - current.x) * (zoom / current.zoom), y: anchor.y - (anchor.y - current.y) * (zoom / current.zoom) };
  });
  const fit = useCallback(() => {
    const rect = canvas.current?.getBoundingClientRect(); const all = Object.values(positions); if (!rect || !all.length) return;
    const minX = Math.min(...all.map(point => point.x)); const minY = Math.min(...all.map(point => point.y));
    const maxX = Math.max(...all.map(point => point.x)) + CARD_WIDTH + 64; const maxY = Math.max(...all.map(point => point.y)) + 320;
    const zoom = Math.min(1, Math.max(0.25, Math.min((rect.width - 64) / (maxX - minX), (rect.height - 64) / (maxY - minY))));
    setView({ zoom, x: 32 - minX * zoom, y: 32 - minY * zoom });
  }, [positions]);
  const fitted = useRef(false);
  useEffect(() => { if (!fitted.current) { fitted.current = true; requestAnimationFrame(fit); } }, [fit]);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    // The scroll wheel zooms around the pointer (no key needed; a trackpad pinch too); Shift + scroll moves the map.
    // Menus and panels on the map keep their own scrolling.
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest('.add-menu, .edge-actions')) return;
      event.preventDefault();
      const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      if (event.shiftKey && !event.ctrlKey && !event.metaKey) { const dx = (event.deltaX || event.deltaY) * lines; const dy = event.deltaX ? event.deltaY * lines : 0; setView(current => ({ ...current, x: current.x - dx, y: current.y - dy })); return; }
      const rect = element.getBoundingClientRect();
      zoomBy(Math.min(1.25, Math.max(0.8, Math.exp(-event.deltaY * lines * 0.002))), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    element.addEventListener('wheel', wheel, { passive: false }); return () => element.removeEventListener('wheel', wheel);
  });

  // ---------- adding scenes ----------
  // A prefab lands with its top-left card where a single scene would, connected after `from` when there is one.
  const addPrefab = (content: PrefabContent) => {
    if (!adding) return;
    const target = adding.place ?? { x: adding.at.x, y: adding.at.y - 72 };
    const result = insertPrefab(definition, positions, content, { x: snap(target.x), y: snap(target.y) }, adding.from ? { key: adding.from, option: adding.option } : undefined);
    change(result.definition, result.positions); setAdding(null); select(result.keys);
    const first = result.positions[result.keys[0]!]; if (first) requestAnimationFrame(() => reveal(first));
    setNotice(`Inserted ${result.keys.length === 1 ? 'a scene' : `${result.keys.length} scenes`} from the prefab.`);
  };
  const addFromMenu = ({ type, variant }: SceneChoice) => {
    if (!adding) return;
    const result = (adding.onEdge ? insertOnEdge(definition, adding.onEdge, type, variant) : null) ?? (adding.from ? addConnectedScene(definition, type, adding.from, adding.option, variant) : addScene(definition, type, variant));
    setSelectedEdge(null);
    const target = adding.place ?? { x: adding.at.x, y: adding.at.y - 72 };
    const raw = { ...positions, [result.key]: { x: snap(target.x), y: snap(target.y) } };
    const spot = freeSpot(result.definition, raw, result.key, raw[result.key]!);
    change(result.definition, { ...raw, [result.key]: spot }); setAdding(null); select([result.key]); requestAnimationFrame(() => reveal(spot));
  };
  // The middle of the selected arrow, where its menu sits (add a scene on it, or remove it).
  const edgeMid = (() => {
    const edge = selectedEdge ? definition.edges.find(entry => entry.key === selectedEdge) : undefined; if (!edge) return null;
    const fromNode = definition.nodes.find(node => node.key === edge.from); const from = positions[edge.from]; const to = positions[edge.to];
    return fromNode && from && to ? pointOnCurve(outputPort(fromNode, from, edge.option), inputPort(to), 0.5) : null;
  })();
  // Right-click (or the menu key) on empty canvas: the add menu, and the new scene lands where you clicked.
  const contextMenu = (event: React.MouseEvent) => {
    if ((event.target as Element).closest('.scene-card, .edge, .add-menu, button, input, textarea, select')) return;
    event.preventDefault(); if (readOnly) return; setPending(null); setConnecting(null);
    const rect = canvas.current?.getBoundingClientRect();
    // From the keyboard there is no pointer position: use the same spot as the toolbar button.
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const at = fromKeyboard || !rect ? { x: (-view.x + (rect?.width ?? 800) / 3) / view.zoom, y: (-view.y + 120) / view.zoom } : toCanvas(event.clientX, event.clientY);
    select([]); setAdding({ from: null, option: undefined, at, place: { x: at.x - CARD_WIDTH / 2, y: at.y - 24 } });
  };
  const menuSpot = (at: Point) => {
    const rect = canvas.current?.getBoundingClientRect(); if (!rect) return { left: at.x, top: at.y };
    const screenX = Math.min(Math.max(8, at.x * view.zoom + view.x), rect.width - 300);
    const screenY = Math.min(Math.max(8, at.y * view.zoom + view.y), rect.height - 560);
    return { left: (screenX - view.x) / view.zoom, top: (Math.max(8, screenY) - view.y) / view.zoom, transform: `scale(${1 / view.zoom})`, transformOrigin: '0 0' };
  };

  // ---------- keyboard ----------
  const cardKey = (event: React.KeyboardEvent, key: string) => {
    const step = event.shiftKey ? GRID * 4 : GRID; const moves: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const delta = moves[event.key];
    if (delta) {
      event.preventDefault(); const group = selected.includes(key) ? selected : [key];
      change(definition, { ...positions, ...Object.fromEntries(group.map(member => [member, { x: snap(positions[member]!.x + delta.x), y: snap(positions[member]!.y + delta.y) }])) });
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (pending) finishPending(key); else select(event.shiftKey ? [...new Set([...selected, key])] : [key]); }
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      if (askDelete || readOnly) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdge) { event.preventDefault(); change(disconnect(definition, selectedEdge)); setSelectedEdge(null); }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length) { event.preventDefault(); setAskDelete(true); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); select(definition.nodes.map(node => node.key)); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selected.length) { event.preventDefault(); duplicate(selected); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selected.length) {
        const keys = new Set(selected);
        const from = { ...definition, nodes: definition.nodes.filter(node => keys.has(node.key)), edges: definition.edges.filter(edge => keys.has(edge.from) && keys.has(edge.to)) };
        if (!writeClip({ keys: [...selected], from, positions: Object.fromEntries(selected.map(key => [key, positions[key]!])), game: d.draft?.gameId ?? null })) { setNotice('This browser does not allow copying here. Use Duplicate instead.'); return; }
        setNotice(`Copied ${selected.length === 1 ? 'a scene' : `${selected.length} scenes`}. Paste with ${navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+V.`); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') { const clip = readClip(); if (clip) { event.preventDefault(); paste(clip); } }
      if (event.key === 'Escape') { setConnecting(null); setSelectedEdge(null); setPending(null); setAdding(null); setNotice(''); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });

  const paste = (clip: Clip) => {
    // In the same game the copies land a little offset; from another game, near the top left of the view.
    const first = clip.positions[clip.keys[0]!] ?? { x: 0, y: 0 };
    const offset = clip.game === d.draft?.gameId ? { x: GRID * 3, y: GRID * 3 } : { x: (-view.x + 160) / view.zoom - first.x, y: (-view.y + 160) / view.zoom - first.y };
    const pasted = pasteScenes(definition, positions, clip.from, clip.positions, clip.keys, offset);
    change(pasted.definition, pasted.positions); select(pasted.keys);
    setNotice(`Pasted ${pasted.keys.length === 1 ? 'a scene' : `${pasted.keys.length} scenes`}. Connect ${pasted.keys.length === 1 ? 'it' : 'them'} where you want ${pasted.keys.length === 1 ? 'it' : 'them'} to play.`);
  };
  const problemsBy = useMemo(() => { const map = new Map<string, DefinitionIssue[]>(); for (const issue of d.issues) if (issue.nodeKey) map.set(issue.nodeKey, [...(map.get(issue.nodeKey) ?? []), issue]); return map; }, [d.issues]);
  const nodes = definition.nodes; const single = selected.length === 1 ? nodes.find(node => node.key === selected[0]) : undefined;
  const sceneTitle = (key: string) => { const node = definition.nodes.find(entry => entry.key === key); if (!node) return key; const text = cardText(definition, node); return text.banner || text.title; };
  const deleteSelected = () => { let next = definition; for (const key of selected) next = deleteScene(next, key); const kept = { ...positions }; for (const key of selected) delete kept[key]; change(next, kept); select([]); };
  return <div className={`editor-body${selected.length ? ' with-inspector' : ''}${readOnly ? ' viewing' : ''}`}>
    <div className="flow-tools" role="toolbar" aria-label="Flow tools">
      <button className="with-icon" aria-label="Add a scene" disabled={readOnly} onClick={() => { const rect = canvas.current?.getBoundingClientRect(); setAdding({ from: null, option: undefined, at: { x: (-view.x + (rect?.width ?? 800) / 3) / view.zoom, y: (-view.y + 120) / view.zoom } }); }}><Icon name="plus" /><span className="tool-label">Add a scene</span></button>
      <button className="with-icon" aria-label="Undo" disabled={!d.canUndo} onClick={d.undo}><Icon name="undo" /><span className="tool-label">Undo</span></button>
      <button className="with-icon" aria-label="Redo" disabled={!d.canRedo} onClick={d.redo}><Icon name="redo" /><span className="tool-label">Redo</span></button>
      <span className="tool-gap" />
      <button disabled={readOnly} onClick={() => change(definition, autoLayout(definition))}>Tidy up</button>
      <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>−</button><button aria-label="Zoom in" onClick={() => zoomBy(1.2)}>+</button><button onClick={fit}>Fit</button>
      {selectedEdge && !readOnly && <button onClick={() => { change(disconnect(definition, selectedEdge)); setSelectedEdge(null); }}>Remove connection</button>}
      <span className="flow-hint">{readOnly ? 'Viewing: nothing can be changed. Choose Edit at the top to make changes.' : `Right-click to add a scene · click an arrow to add a scene on it · drag from ● to connect · drag an arrow’s end to move it · Shift-drag to select several`}</span>
    </div>
    {d.notice && <p role="status" className="flow-notice">{d.notice}</p>}
    <div className="flow-canvas" ref={canvas} onPointerDown={startCanvas} onContextMenu={contextMenu}onPointerMove={event => live.sendCursor(toCanvas(event.clientX, event.clientY))} onPointerLeave={() => live.sendCursor(null)} aria-label="Game flow" role="application" aria-roledescription="flow canvas">
      <div className="flow-surface" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className="flow-lines" width="1" height="1" overflow="visible" aria-hidden="true">
          <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head" /></marker>
            <marker id="arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head on" /></marker></defs>
          {guides.x !== null && <line className="guide" x1={guides.x} y1={-5000} x2={guides.x} y2={5000} />}
          {guides.y !== null && <line className="guide" x1={-5000} y1={guides.y} x2={5000} y2={guides.y} />}
          {box && <rect className="select-box" x={Math.min(box.from.x, box.to.x)} y={Math.min(box.from.y, box.to.y)} width={Math.abs(box.to.x - box.from.x)} height={Math.abs(box.to.y - box.from.y)} />}
          {definition.edges.map(edge => {
            const fromNode = nodes.find(node => node.key === edge.from); const from = positions[edge.from]; const to = positions[edge.to];
            if (!fromNode || !from || !to) return null;
            const start = outputPort(fromNode, from, edge.option); const end = inputPort(to); const path = curve(start, end);
            const label = edge.option ? optionsOf(fromNode).find(option => option.key === edge.option)?.label : undefined; const on = selectedEdge === edge.key;
            const grip = pointOnCurve(start, end, 0.82);
            // While an arrow is being moved it stays mounted (the pointer is captured by its handle), just hidden.
            return <g key={edge.key} data-edge={edge.key} className={`edge${on ? ' selected' : ''}${connecting?.rewire === edge.key ? ' moving' : ''}`} onPointerDown={event => { event.stopPropagation(); setSelectedEdge(edge.key); setSelected([]); }}>
              <path d={path} className="edge-hit" /><path d={path} className="edge-line" markerEnd={on ? 'url(#arrow-on)' : 'url(#arrow)'} />
              {label && <text x={end.x - 12} y={end.y - 12} textAnchor="end" className="edge-label">{label}</text>}
              <circle cx={grip.x} cy={grip.y} r={10} className="edge-end" onPointerDown={event => { setSelectedEdge(edge.key); startConnect(event, edge.from, edge.option, edge.key); }}><title>Drag to move this arrow to another scene</title></circle>
            </g>;
          })}
          {connecting && (() => {
            const fromNode = nodes.find(node => node.key === connecting.from)!; const start = outputPort(fromNode, positions[connecting.from]!, connecting.option);
            const end = connecting.target && !connecting.blocked ? inputPort(positions[connecting.target]!) : connecting.pointer;
            return <path d={curve(start, end)} markerEnd="url(#arrow-on)" className={`edge-line drafting${connecting.target && !connecting.blocked ? ' snapped' : ''}${connecting.blocked ? ' blocked' : ''}`} />;
          })()}
        </svg>
        {nodes.map(node => {
          const position = positions[node.key]; if (!position) return null;
          const text = cardText(definition, node); const problems = problemsBy.get(node.key) ?? []; const isTarget = connecting?.target === node.key; const on = selected.includes(node.key);
          const incoming = definition.edges.some(edge => edge.to === node.key); const others = peersOn(live.peers, node.key);
          return <div key={node.key} className={`scene-card kind-${text.kind}${others.length ? ' peer-selected' : ''}${pending && pending.from !== node.key ? ' tap-target' : ''}${on ? ' selected' : ''}${isTarget ? (connecting?.blocked ? ' drop-blocked' : ' drop-target') : ''}`}
            style={{ ...peerOutline(others), left: position.x, top: position.y, width: CARD_WIDTH, height: cardHeight(node) }} tabIndex={0} role="group" aria-roledescription="scene card"
            aria-label={`${text.label}: ${text.banner ? `${text.banner}. ` : ''}${text.title}. ${text.line}.${definition.startNodeKey === node.key ? ' Start scene.' : ''}${on ? ' Selected.' : ''}${others.length ? ` ${others.map(peer => peer.name).join(', ')} working here.` : ''}${problems.length ? ` ${problems.length} problems.` : ''}`}
            onPointerDown={event => startCardDrag(event, node.key)} onKeyDown={event => cardKey(event, node.key)} onDoubleClick={() => onOpenScene(node.key)}>
            <PeerTags peers={others} />
            <p className="card-label">{definition.startNodeKey === node.key && <span className="start-flag">Start · </span>}{text.label}</p>
            <div className={`card-thumb thumb-${text.kind}${text.input ? ` thumb-${text.input}` : ''}`} aria-hidden="true">{text.banner ?? <Icon name={sceneIcon(text.kind, text.input)} size={26} />}</div>
            <p className="card-title">{text.title}</p><p className="card-line">{text.line}</p>
            {problems.length > 0 && <p className="card-problems">{problems.length} {problems.length === 1 ? 'problem' : 'problems'}</p>}
            <span className={`port port-in${incoming ? ' grabbable' : ''}${isTarget && !connecting?.blocked ? ' port-hot' : ''}`} style={{ top: inputPort(position).y - position.y }} aria-hidden="true"
              onPointerDown={incoming ? event => grabInput(event, node.key) : undefined} title={incoming ? 'Drag to move the arrow into this scene' : undefined} />
            {isRoute(node) ? optionsOf(node).map(option => <span key={option.key} className="port-row" style={{ top: outputPort(node, position, option.key).y - position.y }}>
              <span className="port-label">{option.label} →</span>
              <span className="port port-out" aria-hidden="true" onPointerDown={event => startConnect(event, node.key, option.key)} title={`Drag to connect “${option.label}”`} />
              {!definition.edges.some(edge => edge.from === node.key && edge.option === option.key) && <button className="port-plus" onPointerDown={event => event.stopPropagation()} onClick={() => setAdding({ from: node.key, option: option.key, at: { x: position.x + CARD_WIDTH + GRID * 4, y: outputPort(node, position, option.key).y } })}>+<span className="visually-hidden"> Add a scene after “{option.label}”</span></button>}</span>)
              : <><span className="port port-out" style={{ top: outputPort(node, position).y - position.y }} aria-hidden="true" onPointerDown={event => startConnect(event, node.key, undefined)} title="Drag to connect the next scene" />
                {!definition.edges.some(edge => edge.from === node.key) && <button className="port-plus" style={{ top: outputPort(node, position).y - position.y }} onPointerDown={event => event.stopPropagation()} onClick={() => setAdding({ from: node.key, option: undefined, at: { x: position.x + CARD_WIDTH + GRID * 4, y: outputPort(node, position).y } })}>+<span className="visually-hidden"> Add a scene after {text.title}</span></button>}</>}
          </div>;
        })}
        <PeerCursors live={live} zoom={view.zoom} />
        {selectedEdge && !adding && !readOnly && edgeMid && <div className="edge-actions" style={{ left: edgeMid.x, top: edgeMid.y, transform: `translate(-50%, -50%) scale(${1 / view.zoom})` }} onPointerDown={event => event.stopPropagation()}>
          <button type="button" onClick={() => setAdding({ from: null, option: undefined, at: { x: edgeMid.x + 24, y: edgeMid.y + 24 }, place: { x: edgeMid.x - CARD_WIDTH / 2, y: edgeMid.y + GRID * 2 }, onEdge: selectedEdge })}>+ Add a scene here</button>
          <button type="button" className="danger-outline" aria-label="Remove this connection" onClick={() => { change(disconnect(definition, selectedEdge)); setSelectedEdge(null); }}>Remove</button>
        </div>}
        {adding && <div className="add-menu-anchor" style={menuSpot(adding.at)}><ScenePalette label={adding.onEdge ? 'Add a scene on this arrow' : adding.from ? 'Add a connected scene' : 'Add a scene'} onPick={addFromMenu} onPrefab={adding.onEdge ? undefined : addPrefab} onCancel={() => setAdding(null)} /></div>}
      </div>
      <Minimap definition={definition} positions={positions} view={view} canvas={size} selected={selected}
        onMove={center => setView(current => ({ ...current, x: size.width / 2 - center.x * current.zoom, y: size.height / 2 - center.y * current.zoom }))} />
    </div>
    {single && <Inspector definition={definition} node={single} problems={problemsBy.get(single.key) ?? []} onChange={(next, group) => change(next, undefined, group)} onOpen={() => onOpenScene(single.key)}
      onDelete={next => { const kept = { ...positions }; delete kept[single.key]; change(next, kept); select([]); }} onClose={() => select([])} onDuplicate={() => duplicate([single.key])}
      readOnly={readOnly} prefab={{ content: () => prefabFrom(definition, positions, [single.key]), defaultName: cardText(definition, single).banner || cardText(definition, single).title }} />}
    {askDelete && selected.length > 0 && <ConfirmDialog title={selected.length === 1 ? `Delete “${sceneTitle(selected[0]!)}”?` : `Delete ${selected.length} scenes?`}
      text={`${selected.length === 1 ? 'The scene and its connections go' : 'The scenes and their connections go'}. Undo (Ctrl/Cmd+Z) brings ${selected.length === 1 ? 'it' : 'them'} back.`}
      confirm={selected.length === 1 ? 'Delete scene' : `Delete ${selected.length} scenes`} onConfirm={() => { setAskDelete(false); deleteSelected(); }} onCancel={() => setAskDelete(false)} />}
    {selected.length > 1 && <MultiPanel count={selected.length} onDelete={deleteSelected} onClear={() => select([])} onDuplicate={() => duplicate(selected)}
      savePrefab={<SavePrefab key={selected.join()} content={() => prefabFrom(definition, positions, selected)} defaultName={`${selected.length} scenes`} />} />}
  </div>;
}

function MultiPanel({ count, onDelete, onClear, onDuplicate, savePrefab }: { count: number; onDelete: () => void; onClear: () => void; onDuplicate: () => void; savePrefab: React.ReactNode }) {
  const [confirming, setConfirming] = useState(false);
  return <aside className="inspector" aria-labelledby="multi-heading">
    <div className="inspector-head"><h2 id="multi-heading">{count} scenes selected</h2><button className="small-button" onClick={onClear}>Clear selection</button></div>
    <p className="hint">Drag any of them to move them together, or use the arrow keys. Shift-click a scene to add or remove it.</p>
    <button onClick={onDuplicate}>Duplicate {count} scenes</button>
    {savePrefab}
    <p className="hint">Copy and paste also work: Ctrl/Cmd+C, then Ctrl/Cmd+V, even in another game.</p>
    {confirming ? <div className="actions"><button className="danger" onClick={onDelete}>Yes, delete {count} scenes</button><button onClick={() => setConfirming(false)}>Keep them</button></div>
      : <button className="danger-outline" onClick={() => setConfirming(true)}>Delete {count} scenes</button>}
  </aside>;
}
