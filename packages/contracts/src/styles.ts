import { z } from 'zod';
import { GameIdSchema } from './game.js';
import { ThemeSchema } from './presentation.js';

/**
 * Saved styles: looks the owner and editors made themselves, shown next to the built-in
 * styles in Look & feel and usable in every game. A game keeps its own copy of the values
 * (as a look layer), so changing or deleting a saved style never changes a game by itself.
 */
export const MAX_SAVED_STYLES = 100;
export const StyleNameSchema = z.string().trim().min(1).max(60);
export const SavedStyleSchema = z.object({ id: GameIdSchema, name: StyleNameSchema, theme: ThemeSchema, updatedAt: z.string() }).strict();
export type SavedStyle = z.infer<typeof SavedStyleSchema>;
export const SavedStyleListSchema = z.array(SavedStyleSchema).max(MAX_SAVED_STYLES);
/** Creates the style with this id, or replaces its name and look when it exists (a retried save is harmless). */
export const SaveStyleSchema = z.object({ styleId: GameIdSchema, name: StyleNameSchema, theme: ThemeSchema }).strict();
