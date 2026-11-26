import { editingAction, type ZoomShortcuts } from './zoom-shortcuts.js';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { DefinitionIssue } from '@party/contracts';
import { Icon, sceneIcon } from '../controls/icons.js';
import { Inspector } from '../scene/inspector.js';
import { Minimap } from './minimap.js';
import { anyGrouped, groupFrame, grouped, groupsIn, isOneGroup, ungrouped, withWholeGroups } from './groups.js';
import {
  addConnectedScene, addDrawGames, addScene, autoLayout, duplicateScenes, pasteScenes, CARD_WIDTH, cardHeight, cardText, connect, connectProblem, deleteScene, disconnect, freeSpot, GRID, inputPort,
  bendsOf, closestPointOnRoute, insertOnEdge, insertPrefab, isBendKey, isGroupKey, isRoute, lineUp, prefabFrom, optionsOf, outputPort, pointOnRoute, routeSegments, routedPath, snap, snapCard, straightenAll, withBends, SNAP_RADIUS, type Definition, type Guides, type Point, type Positions,
} from '../model.js';
import { ActionMenu, ContextMenu } from '../controls/action-menu.js';
import { arrowMenuActions, sceneMenuActions } from './scene-menu.js';
import { InfoTip } from '../controls/info-tip.js';
import { ScenePalette, type SceneChoice } from '../controls/scene-palette.js';
import { SavePrefab } from './save-prefab.js';
import { ConfirmDialog } from '../controls/confirm-dialog.js';
import type { PrefabContent } from '@party/contracts';
import type { DraftState } from '../shell/use-draft.js';
import type { LiveState } from '../live/use-live.js';
import { translate } from '../../i18n/texts.js';
import { marked } from '../../i18n/rich.js';
import { FLOW_TEXTS } from './flow.text.js';
import { PeerCursors, peerOutline, peersOn, PeerTags } from '../live/presence.js';

interface Connecting { from: string; option: string | undefined; pointer: Point; target: string | null; blocked: string | null; rewire: string | null }
interface Box { from: Point; to: Point }
interface BendDrag { edge: string; index: number; anchor: Point; origin: Point; insert: boolean; pointerId: number; moved: boolean }
// The editor's clipboard: only the copied scenes and the connections between them, kept in this
// browser so they can be pasted into another game after opening it. A convenience; never required.
interface Clip { keys: string[]; from: Definition; positions: Positions; game: string | null }
const CLIP = 'party-editor-clipboard';
function writeClip(clip: Clip) { try { localStorage.setItem(CLIP, JSON.stringify(clip)); return true; } catch { return false; } }
function readClip(): Clip | null { try { const value = JSON.parse(localStorage.getItem(CLIP) ?? 'null') as Clip | null; return value && Array.isArray(value.keys) && value.from && Array.isArray(value.from.nodes) ? value : null; } catch { return null; } }
// ⌘ on a Mac, Ctrl elsewhere: how shortcuts are written in the menus.
const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
const t = (key: keyof typeof FLOW_TEXTS.en, values?: Record<string, string | number>) => translate(FLOW_TEXTS, key, values);
const BLOCKED = { self: 'bSelf', circle: 'bCircle', 'same-scene': 'bSame' } as const;
const blockedText = (reason: string) => reason in BLOCKED ? t(BLOCKED[reason as keyof typeof BLOCKED]) : '';

export function FlowView({ d, selected, setSelected, focus = null, live, onOpenScene, onHelp, zoomShortcuts }: { zoomShortcuts: ZoomShortcuts; d: DraftState; selected: string[]; setSelected: (keys: string[]) => void; focus?: { key: string; at: number } | null; live: LiveState; onOpenScene: (key: string) => void; onHelp: () => void }) {
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
  // A scene card's right-click menu: where it opens (client pixels), the scenes it acts on, and the card to focus after Escape.
  const [sceneMenu, setSceneMenu] = useState<{ at: Point; keys: string[]; card: HTMLElement } | null>(null);
  const closeSceneMenu = useCallback(() => setSceneMenu(null), []);
  // An arrow's right-click menu: where it opens and which arrow.
  const [arrowMenu, setArrowMenu] = useState<{ at: Point; edge: string } | null>(null);
  const closeArrowMenu = useCallback(() => setArrowMenu(null), []);
  // Replace or Save as prefab picked in that menu: opened in the scene panel (or the several-selected panel).
  const [asked, setAsked] = useState<'replace' | 'prefab' | null>(null);
  const clearAsked = useCallback(() => setAsked(null), []);
  const canvas = useRef<HTMLDivElement>(null);
  const bendDrag = useRef<BendDrag | null>(null);
  const [bendPreview, setBendPreview] = useState<{ edge: string; points: Point[] } | null>(null);
  const cancelBend = useCallback(() => { bendDrag.current = null; setBendPreview(null); }, []);
  useEffect(() => {
    window.addEventListener('blur', cancelBend);
    return () => window.removeEventListener('blur', cancelBend);
  }, [cancelBend]);
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
    // A copy of a whole group is a group of its own.
    change(copied.definition, isOneGroup(definition, positions, keys) ? grouped(copied.positions, copied.keys) : copied.positions); select(copied.keys);
    setNotice(t(keys.length === 1 ? 'duplicatedOne' : 'duplicatedMany', { count: keys.length }));
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

  // ---------- cards: click to select (Shift/Cmd adds; a grouped scene brings its group, Alt takes it alone), drag to move all selected ----------
  const startCardDrag = (event: ReactPointerEvent<HTMLElement>, key: string) => {
    // Ctrl-click on a Mac is a right-click: it opens the scene's menu instead.
    if (event.button !== 0 || (event.ctrlKey && MOD === '⌘')) return;
    if ((event.target as HTMLElement).closest('.port, .port-plus')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const clicked = event.altKey ? [key] : withWholeGroups(definition, positions, [key]);
    const group = selected.includes(key) && !additive && !event.altKey ? selected : clicked;
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
        if (!selected.includes(key) || event.altKey) select(group);
      } else if (pending) finishPending(key);
      else if (additive) select(clicked.every(member => selected.includes(member)) ? selected.filter(member => !clicked.includes(member)) : [...new Set([...selected, ...clicked])]);
      else select(clicked);
    };
    element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up);
  };

  // ---------- connections: drag from an output, or grab the end of an arrow to move it ----------
  const finishPending = (to: string) => {
    if (!pending) return;
    const problem = connectProblem(definition, pending.from, pending.option, to);
    if (problem) setNotice(blockedText(problem)); else { change(connect(definition, pending.from, pending.option, to)); setNotice(''); }
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
      if (!dragged) { if (!rewire) { setPending({ from, option }); setNotice(t('tapTarget')); } return; }
      if (state.target && !state.blocked) { change(connect(base, from, option, state.target)); return; }
      if (state.target && state.blocked) { setNotice(blockedText(state.blocked)); return; }
      if (rewire) { change(base); setNotice(t('removed')); return; }
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
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const from = toCanvas(event.clientX, event.clientY); let current: Box = { from, to: from }; setBox(current);
      const move = (moveEvent: PointerEvent) => { current = { from, to: toCanvas(moveEvent.clientX, moveEvent.clientY) }; setBox(current); };
      const finish = () => {
        element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up);
        element.removeEventListener('pointercancel', finish); setBox(null);
      };
      const up = () => {
        finish();
        const left = Math.min(current.from.x, current.to.x); const right = Math.max(current.from.x, current.to.x);
        const top = Math.min(current.from.y, current.to.y); const bottom = Math.max(current.from.y, current.to.y);
        const inside = definition.nodes.filter(node => { const at = positions[node.key]; return at && at.x < right && at.x + CARD_WIDTH > left && at.y < bottom && at.y + cardHeight(node) > top; }).map(node => node.key);
        select(withWholeGroups(definition, positions, [...new Set([...selected, ...inside])]));
      };
      element.addEventListener('pointermove', move); element.addEventListener('pointerup', up);
      element.addEventListener('pointercancel', finish); return;
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
  /** Shows these scenes (all of them when none are given) as large as fits, up to full size. */
  // A scene asked for from outside (the problems box): centred on the map, zoomed in enough to read it.
  useEffect(() => {
    const point = focus ? positions[focus.key] : undefined; const rect = canvas.current?.getBoundingClientRect();
    if (!point || !rect) return;
    setView(current => { const zoom = Math.max(current.zoom, 0.8); return { zoom, x: rect.width / 2 - (point.x + CARD_WIDTH / 2) * zoom, y: rect.height / 2 - (point.y + 96) * zoom }; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  const fitTo = useCallback((keys?: string[]) => {
    const rect = canvas.current?.getBoundingClientRect(); const all = keys?.length ? keys.map(key => positions[key]).filter((point): point is Point => Boolean(point)) : Object.entries(positions).filter(([key]) => !isGroupKey(key)).map(([, point]) => point);
    if (!rect || !all.length) return;
    const minX = Math.min(...all.map(point => point.x)); const minY = Math.min(...all.map(point => point.y));
    const maxX = Math.max(...all.map(point => point.x)) + CARD_WIDTH + 64; const maxY = Math.max(...all.map(point => point.y)) + 320;
    const zoom = Math.min(1, Math.max(0.25, Math.min((rect.width - 64) / (maxX - minX), (rect.height - 64) / (maxY - minY))));
    setView({ zoom, x: 32 - minX * zoom, y: 32 - minY * zoom });
  }, [positions]);
  const fit = useCallback(() => fitTo(), [fitTo]);
  // Tidying the map (the Tidy up menu and its shortcuts). Each is one change, so Undo takes it back.
  // Tidying moves the cards; the groups stay.
  const keepGroups = (next: Positions): Positions => ({ ...next, ...Object.fromEntries(Object.entries(positions).filter(([key]) => isGroupKey(key))) });
  const tidy = {
    rows: () => { change(definition, keepGroups(autoLayout(definition))); setNotice(t('tidiedRows')); },
    line: () => { change(definition, keepGroups(autoLayout(definition, { oneRow: true }))); setNotice(t('tidiedLine')); },
    lineUp: (direction: 'row' | 'column') => { if (selected.length > 1) change(definition, lineUp(definition, positions, selected, direction)); },
    straighten: () => change(definition, straightenAll(positions)),
  };
  // Grouping: Ctrl/⌘ + G groups the selected scenes, Ctrl/⌘ + Shift + G takes them out of their groups.
  const groupSelected = () => {
    if (selected.length < 2) { setNotice(t('selectTwoGroup')); return; }
    change(definition, grouped(positions, selected)); setNotice(t('groupedN', { count: selected.length }));
  };
  const ungroupSelected = () => {
    if (!anyGrouped(definition, positions, selected)) return;
    change(definition, ungrouped(positions, selected)); setNotice(t('ungroupedNotice'));
  };
  const groups = useMemo(() => [...groupsIn(definition, positions).values()], [definition, positions]);
  const fitted = useRef(false);
  useEffect(() => { if (!fitted.current) { fitted.current = true; requestAnimationFrame(fit); } }, [fit]);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    // The scroll wheel zooms around the pointer (no key needed; a trackpad pinch too); Shift + scroll moves the map.
    // Menus and panels on the map keep their own scrolling.
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest('.add-menu, .edge-actions')) return;
      event.preventDefault();
      if (bendDrag.current) return;
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
    change(result.definition, result.keys.length > 1 ? grouped(result.positions, result.keys) : result.positions); setAdding(null); select(result.keys);
    const first = result.positions[result.keys[0]!]; if (first) requestAnimationFrame(() => reveal(first));
    setNotice(t(result.keys.length === 1 ? 'insertedOne' : 'insertedMany', { count: result.keys.length }));
  };
  const addFromMenu = ({ type, variant }: SceneChoice) => {
    if (!adding) return;
    const result = (adding.onEdge ? insertOnEdge(definition, adding.onEdge, type, variant) : null) ?? (adding.from ? addConnectedScene(definition, type, adding.from, adding.option, variant) : addScene(definition, type, variant));
    setSelectedEdge(null);
    const target = adding.place ?? { x: adding.at.x, y: adding.at.y - 72 };
    const raw = { ...positions, [result.key]: { x: snap(target.x), y: snap(target.y) } };
    const spot = freeSpot(result.definition, raw, result.key, raw[result.key]!);
    // A minigame draw comes with a scene for each of its games, in a column to its right.
    const inserted: string[] | undefined = 'games' in result ? (result.games as string[] | undefined) : undefined;
    const games = inserted ? { definition: result.definition, keys: inserted } : type === 'draw-routes' ? addDrawGames(result.definition, result.key) : { definition: result.definition, keys: [] as string[] };
    let placed: Positions = { ...raw, [result.key]: spot };
    games.keys.forEach((key, index) => { placed = { ...placed, [key]: freeSpot(games.definition, placed, key, { x: snap(spot.x + CARD_WIDTH + GRID * 4), y: snap(spot.y + index * (192 + GRID)) }) }; });
    // The draw and its games are one group: selected and moved together, Alt-click takes one scene.
    if (games.keys.length) placed = grouped(placed, [result.key, ...games.keys]);
    change(games.definition, placed); setAdding(null); select([result.key]); requestAnimationFrame(() => reveal(spot));
  };
  // The middle of the selected arrow, where its menu sits (add a scene on it, or remove it).
  const edgeMid = (() => {
    const edge = selectedEdge ? definition.edges.find(entry => entry.key === selectedEdge) : undefined; if (!edge) return null;
    const fromNode = definition.nodes.find(node => node.key === edge.from); const from = positions[edge.from]; const to = positions[edge.to];
    return fromNode && from && to ? pointOnRoute(routeSegments(outputPort(fromNode, from, edge.option), inputPort(to), bendsOf(positions, edge.key), from.y + cardHeight(fromNode)), 0.5) : null;
  })();
  const selectedBends = selectedEdge ? bendsOf(positions, selectedEdge) : [];
  // The selected arrow's actions (its toolbar and its right-click menu).
  const addOnSelectedArrow = () => { if (selectedEdge && edgeMid) setAdding({ from: null, option: undefined, at: { x: edgeMid.x + 24, y: edgeMid.y + 24 }, place: { x: edgeMid.x - CARD_WIDTH / 2, y: edgeMid.y + GRID * 2 }, onEdge: selectedEdge }); };
  const straightenArrow = (edge: string) => change(definition, withBends(positions, edge, []));
  const removeArrow = (edge: string) => { change(disconnect(definition, edge)); setSelectedEdge(null); };
  const startBend = (event: ReactPointerEvent<Element>, edge: string, index: number, anchor: Point, insert: boolean, capture = event.currentTarget) => {
    if (readOnly || event.button !== 0 || !(event.buttons & 1) || (event.ctrlKey && MOD === '⌘') || bendDrag.current) return;
    event.preventDefault();
    capture.setPointerCapture(event.pointerId);
    bendDrag.current = { edge, index, anchor, origin: { x: event.clientX, y: event.clientY }, insert, pointerId: event.pointerId, moved: false };
  };
  const bendAt = (event: ReactPointerEvent<HTMLDivElement>, drag: BendDrag) => {
    const dx = event.clientX - drag.origin.x; const dy = event.clientY - drag.origin.y;
    if (Math.hypot(dx, dy) < 4) return null;
    const point = { x: snap(drag.anchor.x + dx / view.zoom), y: snap(drag.anchor.y + dy / view.zoom) };
    const points = bendsOf(positions, drag.edge);
    points.splice(drag.index, drag.insert ? 0 : 1, point);
    return points;
  };
  const moveBend = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = bendDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const points = bendAt(event, drag);
    if (!points) { if (drag.moved) setBendPreview(null); return; }
    // The canvas stays mounted even when selecting the arrow reorders it or its handles move.
    if (!drag.moved) event.currentTarget.setPointerCapture(event.pointerId);
    drag.moved = true;
    setBendPreview({ edge: drag.edge, points });
  };
  const endBend = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = bendDrag.current;
    if (!drag || event.pointerId !== drag.pointerId || (event.type === 'lostpointercapture' && event.target !== event.currentTarget)) return;
    cancelBend();
    if (event.type !== 'pointerup') return;
    const points = bendAt(event, drag);
    if (!points) return;
    const original = bendsOf(positions, drag.edge);
    if (!drag.insert && points[drag.index]?.x === original[drag.index]?.x && points[drag.index]?.y === original[drag.index]?.y) return;
    change(definition, withBends(positions, drag.edge, points));
  };
  const removeBend = (edge: string, index: number) => { if (!readOnly) change(definition, withBends(positions, edge, bendsOf(positions, edge).filter((_, at) => at !== index))); };
  // Right-click (or the menu key) on empty canvas: the add menu, and the new scene lands where you clicked.
  const contextMenu = (event: React.MouseEvent) => {
    const target = event.target as Element;
    // On a scene card: its own menu (text fields in a card keep the browser's).
    const card = target.closest<HTMLElement>('.scene-card');
    if (card && !target.closest('input, textarea, select')) { event.preventDefault(); openSceneMenu(event, card); return; }
    // On an arrow: its own menu (selecting it, as a click does).
    const edge = target.closest<SVGGElement>('.edge')?.dataset.edge;
    if (edge) { event.preventDefault(); if (!readOnly) { setAdding(null); setPending(null); setSelectedEdge(edge); setSelected([]); setArrowMenu({ at: { x: event.clientX, y: event.clientY }, edge }); } return; }
    if (target.closest('.add-menu, button, input, textarea, select')) return;
    event.preventDefault(); if (readOnly || event.ctrlKey) return; setPending(null); setConnecting(null);
    const rect = canvas.current?.getBoundingClientRect();
    // From the keyboard there is no pointer position: use the same spot as the toolbar button.
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const at = fromKeyboard || !rect ? { x: (-view.x + (rect?.width ?? 800) / 3) / view.zoom, y: (-view.y + 120) / view.zoom } : toCanvas(event.clientX, event.clientY);
    select([]); setAdding({ from: null, option: undefined, at, place: { x: at.x - CARD_WIDTH / 2, y: at.y - 24 } });
  };
  // Right-clicking a scene in the selection acts on the whole selection; another scene is selected first (with its group, as a click does).
  const openSceneMenu = (event: React.MouseEvent, card: HTMLElement) => {
    const key = card.dataset.scene; if (!key || connecting) return;
    const keys = selected.includes(key) ? selected : event.altKey ? [key] : withWholeGroups(definition, positions, [key]);
    setPending(null); setAdding(null); select(keys);
    // From the keyboard (the menu key, Shift + F10) there is no pointer position: open it at the card.
    const rect = card.getBoundingClientRect();
    const at = event.clientX === 0 && event.clientY === 0 ? { x: rect.left + 24, y: rect.top + 24 } : { x: event.clientX, y: event.clientY };
    setSceneMenu({ at, keys, card });
  };
  // The palette lives outside the zoomed surface. Its list can change size when a category opens.
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuSize, setMenuSize] = useState({ width: 0, height: 0 });
  const menuOpen = adding !== null;
  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current) return;
    const menu = menuRef.current;
    const measure = () => {
      const { offsetWidth: width, offsetHeight: height } = menu;
      setMenuSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(menu);
    const resize = () => setMenuSize({ width: menu.offsetWidth, height: menu.offsetHeight });
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [menuOpen]);
  const menuSpot = (at: Point): CSSProperties => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return { left: 8, top: 8 };
    const upper = Math.max(8, 8 - rect.top);
    // Keep the palette above the floating editor tabs, even when the map has a larger minimum height.
    const lower = Math.min(rect.height, window.innerHeight - rect.top) - 76;
    const right = Math.min(rect.width, window.innerWidth - rect.left) - 8;
    return {
      left: Math.max(8, Math.min(at.x * view.zoom + view.x, right - menuSize.width)),
      top: Math.max(upper, Math.min(at.y * view.zoom + view.y, lower - menuSize.height)),
      '--flow-menu-width': `${Math.max(0, right - 8)}px`,
      '--flow-menu-height': `${Math.max(0, lower - upper)}px`,
    } as CSSProperties;
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
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (pending) finishPending(key); else { const whole = withWholeGroups(definition, positions, [key]); select(event.shiftKey ? [...new Set([...selected, ...whole])] : whole); } }
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (bendDrag.current) {
        if (event.key === 'Escape') { event.preventDefault(); cancelBend(); }
        return;
      }
      if ((event.target as HTMLElement).closest('input, textarea, select, [role=combobox], dialog, [aria-modal=true], [contenteditable=true]')) return;
      if (askDelete) return;
      const fitAll = event.code === `Digit${zoomShortcuts.all}`;
      const fitSelection = event.code === `Digit${zoomShortcuts.selection}`;
      if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && (fitAll || fitSelection)) {
        event.preventDefault(); if (fitAll) fit(); else if (selected.length) fitTo(selected); return;
      }
      if (readOnly) return;
      // Tidying: Ctrl/⌘ + Shift + L tidies into rows; Alt + Shift + H / V lines up the selected scenes (by key position, so any layout and a Mac's Option work).
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.code === `Key${zoomShortcuts.tidy}`) { event.preventDefault(); tidy.rows(); return; }
      const row = event.code === `Key${zoomShortcuts.row}`;
      const column = event.code === `Key${zoomShortcuts.column}`;
      if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && (row || column)) {
        event.preventDefault(); if (selected.length > 1) tidy.lineUp(row ? 'row' : 'column'); else setNotice(t('selectTwo')); return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.code === 'KeyG') { event.preventDefault(); if (event.shiftKey) ungroupSelected(); else groupSelected(); return; }
      const action = editingAction(event, zoomShortcuts);
      if (action === 'remove' && selectedEdge) { event.preventDefault(); change(disconnect(definition, selectedEdge)); setSelectedEdge(null); }
      else if (action === 'remove' && selected.length) { event.preventDefault(); setAskDelete(true); }
      if (action === 'selectAll') { event.preventDefault(); select(definition.nodes.map(node => node.key)); }
      if (action === 'duplicate' && selected.length) { event.preventDefault(); duplicate(selected); }
      if (action === 'copy' && selected.length) copyScenes(selected);
      if (action === 'paste') { const clip = readClip(); if (clip) { event.preventDefault(); paste(clip); } }
      if (event.key === 'Escape') { setConnecting(null); setSelectedEdge(null); setPending(null); setAdding(null); setNotice(''); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });

  const copyScenes = (copied: string[]) => {
    const keys = new Set(copied);
    const from = { ...definition, nodes: definition.nodes.filter(node => keys.has(node.key)), edges: definition.edges.filter(edge => keys.has(edge.from) && keys.has(edge.to)) };
    if (!writeClip({ keys: [...copied], from, positions: Object.fromEntries(copied.map(key => [key, positions[key]!])), game: d.draft?.gameId ?? null })) { setNotice(t('noCopy')); return; }
    setNotice(t(copied.length === 1 ? 'copiedOne' : 'copiedMany', { count: copied.length, key: navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl' }));
  };
  const paste = (clip: Clip) => {
    // In the same game the copies land a little offset; from another game, near the top left of the view.
    const first = clip.positions[clip.keys[0]!] ?? { x: 0, y: 0 };
    const offset = clip.game === d.draft?.gameId ? { x: GRID * 3, y: GRID * 3 } : { x: (-view.x + 160) / view.zoom - first.x, y: (-view.y + 160) / view.zoom - first.y };
    const pasted = pasteScenes(definition, positions, clip.from, clip.positions, clip.keys, offset);
    change(pasted.definition, pasted.positions); select(pasted.keys);
    setNotice(t(pasted.keys.length === 1 ? 'pastedOne' : 'pastedMany', { count: pasted.keys.length }));
  };
  const problemsBy = useMemo(() => { const map = new Map<string, DefinitionIssue[]>(); for (const issue of d.issues) if (issue.nodeKey) map.set(issue.nodeKey, [...(map.get(issue.nodeKey) ?? []), issue]); return map; }, [d.issues]);
  const nodes = definition.nodes; const single = selected.length === 1 ? nodes.find(node => node.key === selected[0]) : undefined;
  const sceneTitle = (key: string) => { const node = definition.nodes.find(entry => entry.key === key); if (!node) return key; const text = cardText(definition, node); return text.banner || text.title; };
  const deleteSelected = () => { let next = definition; for (const key of selected) next = deleteScene(next, key); const kept = ungrouped(positions, selected); for (const key of selected) delete kept[key]; change(next, kept); select([]); };
  return <div className={`editor-body${selected.length ? ' with-inspector' : ''}${readOnly ? ' viewing' : ''}`}>
    <div className="flow-tools" role="toolbar" aria-label={t('flowTools')}>
      <button className="with-icon" aria-label={t('addScene')} disabled={readOnly} onClick={() => { const rect = canvas.current?.getBoundingClientRect(); setAdding({ from: null, option: undefined, at: { x: (-view.x + (rect?.width ?? 800) / 3) / view.zoom, y: (-view.y + 120) / view.zoom } }); }}><Icon name="plus" /><span className="tool-label">{t('addScene')}</span></button>
      {/* Everything that tidies the map, in one menu; each item says its shortcut (also in Help & shortcuts). */}
      <ActionMenu label={t('tidyUp')} text={t('tidyUp')} icon="tidy" align="start" actions={[
        { label: t('tidyRows'), icon: 'rows', shortcut: `${MOD} + Shift + ${zoomShortcuts.tidy}`, disabled: readOnly, onSelect: () => tidy.rows() },
        { label: t('tidyLine'), icon: 'line', disabled: readOnly, onSelect: () => tidy.line() },
        // Shown greyed out until two or more scenes are selected (the intro says how).
        { label: t('lineRow'), icon: 'align-row', shortcut: `Alt + Shift + ${zoomShortcuts.row}`, disabled: readOnly || selected.length < 2, onSelect: () => tidy.lineUp('row') },
        { label: t('lineColumn'), icon: 'align-column', shortcut: `Alt + Shift + ${zoomShortcuts.column}`, disabled: readOnly || selected.length < 2, onSelect: () => tidy.lineUp('column') },
        { label: t('straightenAll'), icon: 'straighten', disabled: readOnly || !Object.keys(positions).some(isBendKey), onSelect: () => tidy.straighten() },
      ]} intro={selected.length > 1 ? undefined : t('lineUpIntro')} />
      {/* Zooming, as in design tools: the zoom level opens the menu. */}
      <ActionMenu label={t('zoom')} text={`${Math.round(view.zoom * 100)}%`} icon="zoom" align="start" actions={[
        { label: t('zoomIn'), icon: 'zoom-in', onSelect: () => zoomBy(1.2) },
        { label: t('zoomOut'), icon: 'zoom-out', onSelect: () => zoomBy(1 / 1.2) },
        { label: t('zoom100'), icon: 'actual-size', onSelect: () => zoomBy(1 / view.zoom) },
        { label: t('showAll'), icon: 'fit', shortcut: `Shift + ${zoomShortcuts.all}`, onSelect: fit },
        { label: t('zoomSelected'), icon: 'zoom', shortcut: `Shift + ${zoomShortcuts.selection}`, disabled: !selected.length, onSelect: () => fitTo(selected) },
      ]} />
      {/* The ways to work the map, behind one ⓘ instead of a line of text (A selected arrow's actions are on the arrow itself). */}
      <InfoTip label={t('tipsLabel')} icon="tips" text={t('tips')} align="start" clickOnly>
        {close => <span className="tip-list">
          {readOnly && <strong>{t('viewingLong')}</strong>}
          {(['tip1', 'tip2', 'tip3', 'tip4', 'tip5', 'tip6'] as const).map(key => <span key={key}>{marked(t(key))}</span>)}
          <button type="button" className="small-button" onClick={() => { close(); onHelp(); }}>{t('allShortcuts')}</button>
        </span>}
      </InfoTip>
      {readOnly && <span className="flow-hint">{t('viewingShort')}</span>}
    </div>
    {d.notice && <p role="status" className="flow-notice">{d.notice}</p>}
    <div className="flow-canvas" ref={canvas} style={{ backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px`, backgroundPosition: `${view.x - GRID * view.zoom / 2}px ${view.y - GRID * view.zoom / 2}px` }} onPointerDown={startCanvas} onContextMenu={contextMenu}
      onPointerMove={event => { moveBend(event); live.sendCursor(toCanvas(event.clientX, event.clientY)); }} onPointerUp={endBend} onPointerCancel={endBend} onLostPointerCapture={endBend}
      onPointerLeave={() => live.sendCursor(null)} aria-label={t('gameFlow')} role="application" aria-roledescription="flow canvas">
      <div className="flow-surface" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {/* Groups: a frame behind their cards; its name selects the whole group. */}
        {groups.map(members => {
          const frame = groupFrame(definition, positions, members); const on = members.every(member => selected.includes(member));
          return <div key={members.join()} className={`flow-group${on ? ' selected' : ''}`} style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}>
            <button type="button" className="flow-group-name" onPointerDown={event => event.stopPropagation()} onClick={() => select(members)}
              title={t('groupTitle')}><Icon name="group" size={14} />{t('groupName', { title: sceneTitle(frame.first), count: members.length })}</button>
          </div>;
        })}
        <svg className="flow-lines" width="1" height="1" overflow="visible" aria-hidden="true">
          <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head" /></marker>
            <marker id="arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head on" /></marker></defs>
          {guides.x !== null && <line className="guide" x1={guides.x} y1={-5000} x2={guides.x} y2={5000} />}
          {guides.y !== null && <line className="guide" x1={-5000} y1={guides.y} x2={5000} y2={guides.y} />}
          {box && <rect className="select-box" x={Math.min(box.from.x, box.to.x)} y={Math.min(box.from.y, box.to.y)} width={Math.abs(box.to.x - box.from.x)} height={Math.abs(box.to.y - box.from.y)} />}
          {[...definition.edges].sort((a, b) => Number(a.key === selectedEdge) - Number(b.key === selectedEdge)).map(edge => {
            const fromNode = nodes.find(node => node.key === edge.from); const from = positions[edge.from]; const to = positions[edge.to];
            if (!fromNode || !from || !to) return null;
            const start = outputPort(fromNode, from, edge.option); const end = inputPort(to);
            const bends = bendPreview?.edge === edge.key ? bendPreview.points : bendsOf(positions, edge.key);
            const segments = routeSegments(start, end, bends, from.y + cardHeight(fromNode)); const path = routedPath(segments);
            const label = edge.option ? optionsOf(fromNode).find(option => option.key === edge.option)?.label : undefined; const on = selectedEdge === edge.key;
            // Incoming paths can share their last leg at a rejoin. Keep the grip on this arrow's own leg there.
            const rejoins = definition.edges.some(other => other.key !== edge.key && other.to === edge.to);
            const grip = pointOnRoute(segments, rejoins ? 0.25 : 0.82);
            // While an arrow is being moved it stays mounted (the pointer is captured by its handle), just hidden.
            return <g key={edge.key} data-edge={edge.key} className={`edge${on ? ' selected' : ''}${connecting?.rewire === edge.key ? ' moving' : ''}`} onPointerDown={event => { event.stopPropagation(); setSelectedEdge(edge.key); setSelected([]); }}>
              <path d={path} className="edge-hit" onPointerDown={event => {
                if (readOnly || event.button !== 0 || !(event.buttons & 1)) return;
                const { index, point } = closestPointOnRoute(segments, toCanvas(event.clientX, event.clientY));
                startBend(event, edge.key, index, point, true, canvas.current!);
              }} /><path d={path} className="edge-line" markerEnd={on ? 'url(#arrow-on)' : 'url(#arrow)'} />
              {label && <text x={end.x - 12} y={end.y - 12} textAnchor="end" className="edge-label">{label}</text>}
              {(!readOnly && (on || connecting?.rewire === edge.key)) && <rect x={grip.x - 6} y={grip.y - 6} width={12} height={12} rx={2} className="edge-end" onPointerDown={event => { setSelectedEdge(edge.key); startConnect(event, edge.from, edge.option, edge.key); }}><title>{t('moveArrow')}</title></rect>}
              {on && !readOnly && <>
                {segments.map((points, index) => {
                  const mid = pointOnRoute([points], 0.5);
                  return <circle key={`add-${index}`} cx={mid.x} cy={mid.y} r={7} className="edge-bend-add" onPointerDown={event => startBend(event, edge.key, index, mid, true)}><title>{t('bendHere')}</title></circle>;
                })}
                {bends.map((point, index) => <circle key={`bend-${index}`} cx={point.x} cy={point.y} r={8} className="edge-bend" onPointerDown={event => startBend(event, edge.key, index, point, false)} onDoubleClick={event => { event.stopPropagation(); removeBend(edge.key, index); }}><title>{t('moveBend')}</title></circle>)}
              </>}
            </g>;
          })}
          {connecting && (() => {
            const fromNode = nodes.find(node => node.key === connecting.from)!; const start = outputPort(fromNode, positions[connecting.from]!, connecting.option);
            const end = connecting.target && !connecting.blocked ? inputPort(positions[connecting.target]!) : connecting.pointer;
            return <path d={routedPath(routeSegments(start, end, [], positions[connecting.from]!.y + cardHeight(fromNode)))} markerEnd="url(#arrow-on)" className={`edge-line drafting${connecting.target && !connecting.blocked ? ' snapped' : ''}${connecting.blocked ? ' blocked' : ''}`} />;
          })()}
        </svg>
        {nodes.map(node => {
          const position = positions[node.key]; if (!position) return null;
          const text = cardText(definition, node); const problems = problemsBy.get(node.key) ?? []; const isTarget = connecting?.target === node.key; const on = selected.includes(node.key);
          const incoming = definition.edges.some(edge => edge.to === node.key); const others = peersOn(live.peers, node.key);
          return <div key={node.key} className={`scene-card kind-${text.kind}${problems.length ? ' has-problems' : ''}${others.length ? ' peer-selected' : ''}${pending && pending.from !== node.key ? ' tap-target' : ''}${on ? ' selected' : ''}${isTarget ? (connecting?.blocked ? ' drop-blocked' : ' drop-target') : ''}`}
            style={{ ...peerOutline(others), left: position.x, top: position.y, width: CARD_WIDTH, height: cardHeight(node) }} tabIndex={0} role="group" aria-roledescription="scene card"
            aria-label={`${text.label}: ${text.banner ? `${text.banner}. ` : ''}${text.title}. ${text.line}.${definition.startNodeKey === node.key ? t('startScene') : ''}${on ? t('selected') : ''}${others.length ? t('workingHere', { names: others.map(peer => peer.name).join(', ') }) : ''}${problems.length ? t('problemsN', { count: problems.length }) : ''}`}
            data-scene={node.key} onPointerDown={event => startCardDrag(event, node.key)} onKeyDown={event => cardKey(event, node.key)} onDoubleClick={() => onOpenScene(node.key)}>
            <PeerTags peers={others} />
            <p className="card-label">{definition.startNodeKey === node.key && <span className="start-flag">{t('start')}</span>}{text.label}</p>
            <div className={`card-thumb thumb-${text.kind}${text.input ? ` thumb-${text.input}` : ''}`} aria-hidden="true">{text.banner ?? <Icon name={sceneIcon(text.kind, text.input)} size={26} />}</div>
            <p className="card-title">{text.title}</p><p className="card-line">{text.line}</p>
            {problems.length > 0 && <p className="card-problems" title={problems.map(issue => issue.message).join('\n')}>{problems.length} {problems.length === 1 ? 'problem' : 'problems'}</p>}
            <span className={`port port-in${incoming ? ' grabbable' : ''}${isTarget && !connecting?.blocked ? ' port-hot' : ''}`} style={{ top: inputPort(position).y - position.y }} aria-hidden="true"
              onPointerDown={incoming ? event => grabInput(event, node.key) : undefined} title={incoming ? t('arrowInto') : undefined} />
            {isRoute(node) ? optionsOf(node).map(option => <span key={option.key} className="port-row" style={{ top: outputPort(node, position, option.key).y - position.y }}>
              <span className="port-label">{option.label} →</span>
              <span className="port port-out" aria-hidden="true" onPointerDown={event => startConnect(event, node.key, option.key)} title={t('connectOption', { option: option.label })} />
              {!definition.edges.some(edge => edge.from === node.key && edge.option === option.key) && <button className="port-plus" onPointerDown={event => event.stopPropagation()} onClick={() => setAdding({ from: node.key, option: option.key, at: { x: position.x + CARD_WIDTH + GRID * 4, y: outputPort(node, position, option.key).y } })}>+<span className="visually-hidden"> Add a scene after “{option.label}”</span></button>}</span>)
              : <><span className="port port-out" style={{ top: outputPort(node, position).y - position.y }} aria-hidden="true" onPointerDown={event => startConnect(event, node.key, undefined)} title={t('connectNext')} />
                {!definition.edges.some(edge => edge.from === node.key) && <button className="port-plus" style={{ top: outputPort(node, position).y - position.y }} onPointerDown={event => event.stopPropagation()} onClick={() => setAdding({ from: node.key, option: undefined, at: { x: position.x + CARD_WIDTH + GRID * 4, y: outputPort(node, position).y } })}>+<span className="visually-hidden"> Add a scene after {text.title}</span></button>}</>}
          </div>;
        })}
        <PeerCursors live={live} zoom={view.zoom} />
      </div>
      {adding && <div className="add-menu-anchor" ref={menuRef} style={menuSpot(adding.at)}><ScenePalette label={t(adding.onEdge ? 'addOnArrow' : adding.from ? 'addConnected' : 'addScene')} onPick={addFromMenu} onPrefab={adding.onEdge ? undefined : addPrefab} onCancel={() => setAdding(null)} /></div>}
      {/* A selected arrow's actions float at the top of the map (never on the line, which keeps its bend handles free; never in the toolbar, which would jump). */}
      {selectedEdge && !adding && !readOnly && edgeMid && <div className="edge-actions" role="toolbar" aria-label={t('selectedArrow')} onPointerDown={event => event.stopPropagation()}>
        <button type="button" onClick={addOnSelectedArrow}>+ {t('addOnArrow')}</button>
        {selectedBends.length > 0 && <button type="button" onClick={() => straightenArrow(selectedEdge)}>{t('straighten')}</button>}
        <button type="button" className="danger-outline" aria-label={t('removeConnection')} onClick={() => removeArrow(selectedEdge)}>{t('remove')}</button>
      </div>}
      <Minimap definition={definition} positions={positions} view={view} canvas={size} selected={selected}
        onMove={center => setView(current => ({ ...current, x: size.width / 2 - center.x * current.zoom, y: size.height / 2 - center.y * current.zoom }))} />
    </div>
    {single && <Inspector definition={definition} node={single} problems={problemsBy.get(single.key) ?? []} onChange={(next, group) => change(next, undefined, group)} onOpen={() => onOpenScene(single.key)}
      onDelete={next => { const kept = ungrouped(positions, [single.key]); delete kept[single.key]; change(next, kept); select([]); }} onClose={() => select([])} onDuplicate={() => duplicate([single.key])}
      readOnly={readOnly} prefab={{ content: () => prefabFrom(definition, positions, [single.key]), defaultName: cardText(definition, single).banner || cardText(definition, single).title }} asked={asked} onAsked={clearAsked} />}
    {arrowMenu && (() => {
      const actions = arrowMenuActions({ readOnly, bent: bendsOf(positions, arrowMenu.edge).length > 0 },
        { addHere: addOnSelectedArrow, straighten: () => straightenArrow(arrowMenu.edge), remove: () => removeArrow(arrowMenu.edge) });
      return actions.length > 0 && <ContextMenu label={t('arrowMenu')} actions={actions} at={arrowMenu.at} onClose={closeArrowMenu} />;
    })()}
    {sceneMenu && (() => {
      const { keys } = sceneMenu; const one = keys.length === 1 ? keys[0]! : null;
      const actions = sceneMenuActions(
        { count: keys.length, isStart: definition.startNodeKey === one, readOnly, canPaste: readClip() !== null, oneGroup: isOneGroup(definition, positions, keys), anyGrouped: anyGrouped(definition, positions, keys) },
        {
          open: () => { if (one) onOpenScene(one); }, startHere: () => { if (one) change({ ...definition, startNodeKey: one }); },
          duplicate: () => duplicate(keys), copy: () => copyScenes(keys), paste: () => { const clip = readClip(); if (clip) paste(clip); },
          replace: () => setAsked('replace'), savePrefab: () => setAsked('prefab'), group: groupSelected, ungroup: ungroupSelected, remove: () => setAskDelete(true),
        }, zoomShortcuts);
      return actions.length > 0 && <ContextMenu label={one ? t('sceneMenu') : t('scenesMenu', { count: keys.length })} actions={actions} at={sceneMenu.at} onClose={closeSceneMenu} returnFocus={sceneMenu.card} />;
    })()}
    {askDelete && selected.length > 0 && <ConfirmDialog title={selected.length === 1 ? t('deleteOne', { title: sceneTitle(selected[0]!) }) : t('deleteMany', { count: selected.length })}
      text={t(selected.length === 1 ? 'deleteTextOne' : 'deleteTextMany')}
      confirm={selected.length === 1 ? t('deleteScene') : t('deleteScenes', { count: selected.length })} onConfirm={() => { setAskDelete(false); deleteSelected(); }} onCancel={() => setAskDelete(false)} />}
    {selected.length > 1 && <MultiPanel count={selected.length} asked={asked === 'prefab'} onAsked={clearAsked} onDelete={deleteSelected} onClear={() => select([])} onDuplicate={() => duplicate(selected)}
      onGroup={readOnly || isOneGroup(definition, positions, selected) ? undefined : groupSelected} onUngroup={readOnly || !anyGrouped(definition, positions, selected) ? undefined : ungroupSelected}
      savePrefab={opened => <SavePrefab key={`${selected.join()}-${opened}`} content={() => prefabFrom(definition, positions, selected)} defaultName={`${selected.length} scenes`} startOpen={opened > 0} />} />}
  </div>;
}

function MultiPanel({ count, asked, onAsked, onDelete, onClear, onDuplicate, onGroup, onUngroup, savePrefab }: { count: number; asked: boolean; onAsked: () => void; onDelete: () => void; onClear: () => void; onDuplicate: () => void; onGroup: (() => void) | undefined; onUngroup: (() => void) | undefined; savePrefab: (opened: number) => React.ReactNode }) {
  const [confirming, setConfirming] = useState(false);
  // Save as prefab picked in the right-click menu: the form opens here, already filled in.
  // Counted, so picking it again opens a fresh form.
  const [opened, setOpened] = useState(0);
  useEffect(() => { if (asked) { setOpened(times => times + 1); onAsked(); } }, [asked, onAsked]);
  return <aside className="inspector" aria-labelledby="multi-heading">
    <div className="inspector-head"><h2 id="multi-heading">{t('selectedN', { count })}</h2><button className="small-button" onClick={onClear}>{t('clear')}</button></div>
    <p className="hint">{t('multiHint')}</p>
    {(onGroup || onUngroup) && <div className="actions">
      {onGroup && <button type="button" className="with-icon" onClick={onGroup} title={`${MOD} + G`}><Icon name="group" />{t('groupThese')}</button>}
      {onUngroup && <button type="button" className="with-icon" onClick={onUngroup} title={`${MOD} + Shift + G`}><Icon name="ungroup" />{t('ungroup')}</button>}
    </div>}
    <button onClick={onDuplicate}>{t('duplicateN', { count })}</button>
    {savePrefab(opened)}
    <p className="hint">{t('copyHint')}</p>
    {confirming ? <div className="actions"><button className="danger" onClick={onDelete}>{t('yesDelete', { count })}</button><button onClick={() => setConfirming(false)}>{t('keepThem')}</button></div>
      : <button className="danger-outline" onClick={() => setConfirming(true)}>{t('deleteScenes', { count })}</button>}
  </aside>;
}
