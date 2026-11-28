import { z } from 'zod';
export * from './game.js';
export * from './scene-text.js';
export * from './rooms.js';
export * from './chat.js';
export * from './authoring.js';
export * from './live-editing.js';
export * from './presentation.js';
export * from './fonts.js';
export * from './styles.js';
export * from './minigames/shared/catalog.js';
export * from './minigames/shared/scoring.js';
export * from './minigames/shared/number-choice.js';
export * from './minigames/cut-the-line/target.js';
export * from './minigames/count-the-dots/dot-pattern.js';
export * from './minigames/shared/reveal-easing.js';
export * from './minigames/draw-the-graph/graph.js';
export * from './minigames/heads-or-tails/coin.js';
export * from './minigames/hangman/hangman.js';
export * from './minigames/undercover/undercover.js';
export * from './minigames/red-or-black-roulette/roulette.js';
export * from './phone-menu.js';
export * from './minigames/speed-run/course.js';
export * from './minigames/brick-rally/brick-rally.js';
export * from './players.js';
export * from './team-colors.js';
export * from './drawing.js';
export * from './feedback.js';
export * from './diagnostics.js';
export * from './people.js';
export * from './packs.js';
export * from './side-games.js';
export * from './prefabs.js';
export * from './save-points.js';
export * from './head-to-head.js';
export * from './minigames/eight-ball/pool.js';
export { shootPool } from './minigames/eight-ball/physics.js';
export * from './arcade.js';
export * from './media.js';
export * from './party-extras.js';
export * from './admin.js';
export * from './roles.js';
export * from './points-at-stake.js';

export const ProblemSchema = z.object({
  error: z.object({
    code: z.enum(['UNAUTHORIZED', 'FORBIDDEN', 'AUTH_UNAVAILABLE', 'INTERNAL_ERROR', 'BAD_REQUEST', 'NOT_FOUND']),
    message: z.string(),
    requestId: z.string().uuid(),
  }).strict(),
}).strict();

export const HealthSchema = z.object({
  status: z.enum(['ok', 'not_ready']),
  service: z.literal('party-server'),
  version: z.string(),
  checks: z.object({ authentication: z.enum(['configured', 'not_configured']), database: z.enum(['available', 'unavailable', 'not_configured', 'not_checked']) }).strict(),
}).strict();
export type Health = z.infer<typeof HealthSchema>;

export const IdentitySchema = z.object({
  subject: z.string().min(1),
  scopes: z.array(z.string()),
}).strict();
export type Identity = z.infer<typeof IdentitySchema>;
export * from './slide-images.js';
