import { z } from 'zod';
import { chooseNumber, numberChoiceSchema } from '../shared/number-choice.js';

export const CutTargetSchema = z.number().int().min(0).max(100);
/** A cut as phones send it: tenths of a percent (473 is 47.3%), so the bar never snaps to countable whole steps. */
export const CutGuessSchema = z.number().int().min(0).max(1000);
export const CutSettingsSchema = z.strictObject({ target: numberChoiceSchema(0, 100).optional() });
export const CUT_TARGETS = Array.from({ length: 79 }, (_, index) => 11 + index).filter(target => target % 5 !== 0);

export function chooseCutTarget({ target }: z.infer<typeof CutSettingsSchema>, random: (max: number) => number): number {
  return target ? chooseNumber(target, random) : CUT_TARGETS[random(CUT_TARGETS.length)]!;
}
