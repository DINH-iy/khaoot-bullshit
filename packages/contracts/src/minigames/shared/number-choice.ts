import { z } from 'zod';

export function numberChoiceSchema(min: number, max: number) {
  const integer = z.number().int().min(min).max(max);
  return z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('exact'), value: integer }),
    z.strictObject({ mode: z.literal('range'), min: integer, max: integer }),
  ]).refine(choice => choice.mode !== 'range' || choice.min <= choice.max, 'The minimum must be at most the maximum');
}

export type NumberChoice = z.infer<ReturnType<typeof numberChoiceSchema>>;

export function chooseNumber(choice: NumberChoice, random: (max: number) => number): number {
  return choice.mode === 'exact' ? choice.value : choice.min + random(choice.max - choice.min + 1);
}
