import { z } from 'zod';
import { GameIdSchema } from './game.js';

/** Admin → Live rooms: every room still open, whose it is and how busy. */
export const AdminRoomsSchema = z.object({ rooms: z.array(z.object({
  sessionId: GameIdSchema, roomCode: z.string().nullable(), title: z.string(), status: z.enum(['LOBBY', 'RUNNING', 'PAUSED', 'FINISHED']),
  // `game`: a room the owner opened; `rehearsal`: an editor's or the owner's practice room; `tryout`: the minigame tryout; `arcade`: an arcade round.
  kind: z.enum(['game', 'rehearsal', 'tryout', 'arcade']), players: z.number().int().min(0),
  openedAt: z.string().datetime(), lastActiveAt: z.string().datetime(), yours: z.boolean(),
}).strict()) }).strict();
export type AdminRooms = z.infer<typeof AdminRoomsSchema>;

/** Admin → Storage: what the server keeps, in bytes, and the free disk space where files are stored. */
export const AdminStorageSchema = z.object({
  library: z.array(z.object({ kind: z.string(), files: z.number().int(), bytes: z.number() }).strict()),
  uploads: z.object({ files: z.number().int(), bytes: z.number(), cleared: z.number().int() }).strict(),
  feedback: z.object({ files: z.number().int(), bytes: z.number() }).strict(), deviceLogs: z.number().int(),
  databaseBytes: z.number(), disk: z.object({ free: z.number(), total: z.number() }).strict().nullable(), retentionDays: z.number().int(),
}).strict();
export type AdminStorage = z.infer<typeof AdminStorageSchema>;

/** Admin → Action log: newest first. */
export const AdminActionListSchema = z.object({ actions: z.array(z.object({
  id: GameIdSchema, at: z.string().datetime(), actor: z.string(), byOwner: z.boolean(), action: z.string(), subject: z.string(),
}).strict()) }).strict();
export type AdminActionList = z.infer<typeof AdminActionListSchema>;

/** Admin → Health: how the server is doing now, each part with a verdict (ok, check, problem) and its numbers. */
export const HEALTH_LEVELS = ['ok', 'check', 'problem'] as const;
export const AdminHealthSchema = z.object({
  checkedAt: z.string().datetime(), version: z.string(), level: z.enum(HEALTH_LEVELS),
  parts: z.array(z.object({ key: z.string(), level: z.enum(HEALTH_LEVELS), facts: z.array(z.object({ label: z.string(), value: z.string() }).strict()) }).strict()),
}).strict();
export type AdminHealth = z.infer<typeof AdminHealthSchema>;
