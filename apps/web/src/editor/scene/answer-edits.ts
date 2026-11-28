import type { AnswerOption, AnswerPlacement, SceneTextMark } from '@party/contracts';
import type { Stage } from '../model.js';
import { moveTextMarks } from './text-marks.js';

function editAnswer(stage: Stage, key: string, change: (option: AnswerOption) => AnswerOption): Stage {
  const input = stage['input'] as { kind?: string; options?: AnswerOption[] } | undefined;
  if (input?.kind !== 'choice' || !input.options?.some(option => option.key === key)) return stage;
  const options = input.options.map(option => option.key === key ? change(option) : option);
  return { ...stage, input: { ...input, options } };
}

export function setAnswerPlacement(stage: Stage, key: string, placement: AnswerPlacement | undefined): Stage {
  return editAnswer(stage, key, ({ placement: _old, ...answer }) => placement ? { ...answer, placement } : answer);
}

export function setAnswerMarks(stage: Stage, key: string, marks: SceneTextMark[]): Stage {
  return editAnswer(stage, key, ({ marks: _old, ...answer }) => marks.length ? { ...answer, marks } : answer);
}

export function setAnswerLabel(stage: Stage, key: string, label: string, caret: number | null): Stage {
  return editAnswer(stage, key, ({ label: before, marks, ...answer }) => {
    const next = marks && moveTextMarks(marks, before, label, caret ?? label.length);
    return { ...answer, label, ...(next?.length ? { marks: next } : {}) };
  });
}
