import { SCENE_TEXT_GRID_COLUMNS, ScenePrimaryTextPlacementSchema, type ScenePrimaryTextPlacement, SceneTextBoxesSchema, SceneTextStyleSchema, type SceneTextBox, type SceneTextBoxLayout, type SceneTextBoxPlacement, type SceneTextStyle } from '@party/contracts';
import type { Stage } from '../model.js';
import { placeTextBoxes, type PlacedTextBox, type TextBoxPosition } from '../../presentation/scene-text-layout.js';
import { moveTextMarks } from './text-marks.js';

export type PrimaryTextTarget = 'promptStyle' | 'titleStyle';
export type SceneTextTarget = PrimaryTextTarget | `box:${string}`;
export const sceneTextBoxes = (stage: Stage) => SceneTextBoxesSchema.safeParse(stage['textBoxes']).data ?? [];
export const sceneTextStyle = (stage: Stage, field: 'promptStyle' | 'titleStyle') => SceneTextStyleSchema.safeParse(stage[field]).data;

export function setSceneTextBoxes(stage: Stage, boxes: SceneTextBox[]): Stage {
  const next = { ...stage };
  if (boxes.length) next['textBoxes'] = boxes;
  else delete next['textBoxes'];
  return next;
}

const primaryPlacementKey = { promptStyle: 'promptPlacement', titleStyle: 'titlePlacement' } as const;

export function primaryTextPlacement(stage: Stage, target: PrimaryTextTarget) {
  return ScenePrimaryTextPlacementSchema.safeParse(stage[primaryPlacementKey[target]]).data;
}

export function placePrimaryText(stage: Stage, target: PrimaryTextTarget, placement?: ScenePrimaryTextPlacement, lines?: number): Stage {
  const next = { ...stage };
  const field = primaryPlacementKey[target];
  if (placement) next[field] = placement;
  else delete next[field];
  return lines === undefined ? next : updateTextFormat(next, target, { lines });
}

function mergeStyle(current: SceneTextStyle | undefined, patch: SceneTextStyle | null): SceneTextStyle {
  if (!patch) return current?.marks?.length ? { marks: current.marks } : {};
  return Object.fromEntries(Object.entries({ ...current, ...patch }).filter(([, value]) => value !== undefined));
}

export function updateTextFormat(stage: Stage, target: SceneTextTarget, patch: SceneTextStyle | null): Stage {
  if (target === 'promptStyle' || target === 'titleStyle') {
    const next = { ...stage };
    const style = mergeStyle(sceneTextStyle(stage, target), patch);
    if (Object.keys(style).length) next[target] = style;
    else delete next[target];
    return next;
  }
  return setSceneTextBoxes(stage, sceneTextBoxes(stage).map(box => {
    if (target !== `box:${box.key}`) return box;
    const { key, text, layout, source, placement, ...style } = box;
    return { key, text, ...(source ? { source } : {}), ...(placement ? { placement } : {}), ...(layout ? { layout } : {}), ...mergeStyle(style, patch) };
  }));
}

export function updateBoxText(stage: Stage, key: string, text: string, caret: number): Stage {
  return setSceneTextBoxes(stage, sceneTextBoxes(stage).map(box => {
    if (box.key !== key || box.source === 'places') return box;
    const marks = box.marks && moveTextMarks(box.marks, box.text, text, caret);
    const { marks: _previous, ...rest } = box;
    return { ...rest, text, ...(marks?.length ? { marks } : {}) };
  }));
}

export function positionTextBox(stage: Stage, key: string, position: TextBoxPosition, lines?: number): Stage {
  const boxes = sceneTextBoxes(stage);
  const placed = placeTextBoxes(boxes);
  const selected = placed.find(entry => entry.box.key === key);
  if (!selected) return stage;
  const { width, column, row } = position;
  const box = lines === undefined ? selected.box : { ...selected.box, lines };
  if (width === selected.width && column === selected.column && row === selected.row) {
    if (box === selected.box || lines === selected.box.lines) return stage;
    return setSceneTextBoxes(stage, boxes.map(entry => entry.key === key ? box : entry));
  }

  const rows: PlacedTextBox[][] = [];
  for (const entry of placed) {
    if (entry.box.key === key) continue;
    (rows[entry.row - 1] ??= []).push(entry);
  }
  const remaining = rows.filter(Boolean);
  const destination = Math.min(Math.max(row - 1, 0), remaining.length);
  const span = Math.min(SCENE_TEXT_GRID_COLUMNS - column + 1, width);
  const moved = { box, row, column, width: span };
  const neighbors = remaining[destination];
  const keepOwnRow = row === selected.row && !rows[selected.row - 1];
  // When a destination is occupied, insert a row at that position and keep the other boxes together.
  if (keepOwnRow || !neighbors || neighbors.some(entry => column < entry.column + entry.width && column + span > entry.column)) {
    remaining.splice(destination, 0, [moved]);
  } else {
    neighbors.push(moved);
    neighbors.sort((left, right) => left.column - right.column);
  }
  const flow = remaining.flatMap((entries, index) => entries.map((entry, offset) => ({
    ...entry.box,
    layout: { ...entry.box.layout, newRow: undefined, width: entry.width, startColumn: entry.column, ...(index > 0 && offset === 0 ? { newRow: true } : {}) },
  })));
  let next = 0;
  return setSceneTextBoxes(stage, boxes.map(box => box.placement ? box : flow[next++]!));
}

export function updateBoxLayout(stage: Stage, key: string, patch: SceneTextBoxLayout) {
  return setSceneTextBoxes(stage, sceneTextBoxes(stage).map(box =>
    box.key === key ? { ...box, layout: { ...box.layout, ...patch } } : box));
}

export function placeSlideTextBox(stage: Stage, key: string, placement: SceneTextBoxPlacement | undefined, lines?: number): Stage {
  const boxes = sceneTextBoxes(stage);
  const selected = boxes.find(box => box.key === key);
  if (!selected) return stage;
  const placements = placement && !selected.placement
    ? placeTextBoxes(boxes).filter(entry => entry.box.key !== key) : [];
  const remaining = new Map(placements.map((entry, index) => [entry.box.key, {
    ...entry.box.layout, width: entry.width, startColumn: entry.column,
    newRow: index > 0 && placements[index - 1]?.row !== entry.row ? true : undefined,
  }]));
  return setSceneTextBoxes(stage, boxes.map(box => {
    if (box.key === key) return { ...box, placement, ...(lines === undefined ? {} : { lines }) };
    const layout = remaining.get(box.key);
    return layout ? { ...box, layout } : box;
  }));
}
