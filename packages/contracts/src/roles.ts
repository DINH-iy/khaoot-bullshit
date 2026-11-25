import { z } from 'zod';

/**
 * Roles: the owner's own roles, each a set of permissions from the fixed list below. A person gets a role
 * (what they may do in the app); a game shared with a person gets a role (what they may do with that game).
 * The server checks every permission on every request. The owner may always do everything, and the admin
 * pages stay the owner's alone (they hold everyone's keys).
 */
export const APP_PERMISSIONS = ['games.make', 'games.all', 'media.manage', 'rooms.rehearse', 'rooms.host'] as const;
export const GAME_PERMISSIONS = ['game.view', 'game.edit', 'game.publish', 'game.savePoints', 'game.rehearse', 'game.copy', 'game.share', 'game.remove'] as const;
export type AppPermission = typeof APP_PERMISSIONS[number];
export type GamePermission = typeof GAME_PERMISSIONS[number];
export type Permission = AppPermission | GamePermission;
export const PERMISSIONS: readonly Permission[] = [...APP_PERMISSIONS, ...GAME_PERMISSIONS];
export const PermissionSchema = z.enum([...APP_PERMISSIONS, ...GAME_PERMISSIONS] as [Permission, ...Permission[]]);

/** The two roles every server starts with. Editor has exactly the rights editors had before roles existed. */
export const EDITOR_ROLE_ID = '00000000-0000-4000-8000-00000000e001';
export const VIEWER_ROLE_ID = '00000000-0000-4000-8000-00000000e002';
export const EDITOR_PERMISSIONS: readonly Permission[] = ['games.make', 'media.manage', 'rooms.rehearse', 'game.view', 'game.edit', 'game.publish', 'game.savePoints', 'game.rehearse', 'game.copy'];
export const VIEWER_PERMISSIONS: readonly Permission[] = ['game.view', 'game.rehearse', 'game.copy'];

export const RoleNameSchema = z.string().trim().min(1).max(40);
export const RoleInputSchema = z.object({ name: RoleNameSchema, permissions: z.array(PermissionSchema).max(PERMISSIONS.length) }).strict();
export const RoleSchema = z.object({
  id: z.uuid(), name: z.string(), permissions: z.array(PermissionSchema), builtIn: z.boolean(),
  // How many people have the role, and on how many shared games it is used.
  people: z.number().int().min(0), shares: z.number().int().min(0),
}).strict();
export type Role = z.infer<typeof RoleSchema>;
export const RoleListSchema = z.object({ roles: z.array(RoleSchema) }).strict();
/** A person's role: one of the roles, or none (a player only). */
export const PersonRoleSchema = z.object({ roleId: z.uuid().nullable() }).strict();
