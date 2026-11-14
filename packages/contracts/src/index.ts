import { z } from 'zod';
export * from './game.js';
export * from './rooms.js';
export * from './authoring.js';
export * from './live-editing.js';
export * from './presentation.js';
export * from './minigames.js';
export * from './players.js';
export * from './drawing.js';
export * from './feedback.js';
export * from './people.js';
export * from './side-games.js';

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
