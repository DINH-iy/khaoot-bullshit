import { SCENE_TEXT_GRID_COLUMNS, SceneTextBoxesSchema, SceneTextStyleSchema, type SceneTextBox, type SceneTextBoxLayout, type SceneTextStyle } from '@party/contracts';
import type { Stage } from '../model.js';
import { placeTextBoxes, type PlacedTextBox, type TextBoxPosition } from '../../presentation/scene-text-layout.js';
import { moveTextMarks } from './text-marks.js';

export type SceneTextTarget = 'promptStyle' | 'titleStyle' | `box:${string}`;
export const sceneTextBoxes = (stage: Stage) => SceneTextBoxesSchema.safeParse(stage['textBoxes']).data ?? [];
export const sceneTextStyle = (stage: Stage, field: 'promptStyle' | 'titleStyle') => SceneTextStyleSchema.safeParse(stage[field]).data;

export function setSceneTextBoxes(stage: Stage, boxes: SceneTextBox[]): Stage {
  const next = { ...stage };
  if (boxes.length) next['textBoxes'] = boxes;
  else delete next['textBoxes'];
  return next;
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
    const { key, text, layout, ...style } = box;
    return { key, text, ...(layout ? { layout } : {}), ...mergeStyle(style, patch) };
  }));
}

export function updateBoxText(stage: Stage, key: string, text: string, caret: number): Stage {
  return setSceneTextBoxes(stage, sceneTextBoxes(stage).map(box => {
    if (box.key !== key) return box;
    const marks = box.marks && moveTextMarks(box.marks, box.text, text, caret);
    const { marks: _previous, ...rest } = box;
    return { ...rest, text, ...(marks?.length ? { marks } : {}) };
  }));
}

export function positionTextBox(stage: Stage, key: string, position: TextBoxPosition, lines?: number): Stage {
  const placed = placeTextBoxes(sceneTextBoxes(stage));
  const selected = placed.find(entry => entry.box.key === key);
  if (!selected) return stage;
  const { width, column, row } = position;
  const box = lines === undefined ? selected.box : { ...selected.box, lines };
  if (width === selected.width && column === selected.column && row === selected.row) {
    if (box === selected.box || lines === selected.box.lines) return stage;
    return setSceneTextBoxes(stage, placed.map(entry => entry.box.key === key ? box : entry.box));
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
  return setSceneTextBoxes(stage, remaining.flatMap((entries, index) => entries.map((entry, offset) => ({
    ...entry.box,
    layout: { ...entry.box.layout, newRow: undefined, width: entry.width, startColumn: entry.column, ...(index > 0 && offset === 0 ? { newRow: true } : {}) },
  }))));
}

export function updateBoxLayout(stage: Stage, key: string, patch: SceneTextBoxLayout) {
  return setSceneTextBoxes(stage, sceneTextBoxes(stage).map(box =>
    box.key === key ? { ...box, layout: { ...box.layout, ...patch } } : box));
}
