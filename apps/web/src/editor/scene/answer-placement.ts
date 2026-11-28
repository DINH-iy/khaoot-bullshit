import type { AnswerOption, AnswerPlacement } from '@party/contracts';
import type { Stage } from '../model.js';

export function setAnswerPlacement(stage: Stage, key: string, placement: AnswerPlacement | undefined): Stage {
  const input = stage['input'] as { kind?: string; options?: AnswerOption[] } | undefined;
  if (input?.kind !== 'choice' || !input.options?.some(option => option.key === key)) return stage;
  const options: AnswerOption[] = input.options.map(option => {
    if (option.key !== key) return option;
    const { placement: _old, ...answer } = option;
    return placement ? { ...answer, placement } : answer;
  });
  return { ...stage, input: { ...input, options } };
}
