import { z } from 'zod';

export const RevealEasingSchema = z.enum(['ease-in', 'ease-out', 'ease-in-out', 'linear', 'instant']);
export type RevealEasing = z.infer<typeof RevealEasingSchema>;
export const DEFAULT_REVEAL_EASING = 'ease-in' satisfies RevealEasing;
