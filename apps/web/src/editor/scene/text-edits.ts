import { SceneTextBoxesSchema, SceneTextStyleSchema, type SceneTextBox, type SceneTextStyle } from '@party/contracts';
import type { Stage } from '../model.js';
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
