import type { PrismaClient } from '../generated/prisma/client.js';

/** Who did something: the owner (personId null) or an editor. */
export interface Actor { personId: string | null }

/**
 * Adds one line to Admin → Action log. Never throws: a log line that cannot be written must not undo
 * or block what the person just did (the change itself is already saved).
 */
export async function recordAction(client: PrismaClient, actor: Actor, action: string, subject: string, details?: Record<string, unknown>): Promise<void> {
  try {
    const name = actor.personId ? (await client.person.findUnique({ where: { id: actor.personId }, select: { name: true } }))?.name ?? 'Former editor' : 'Owner';
    await client.adminAction.create({ data: { actorPersonId: actor.personId, actorName: name.slice(0, 60), action: action.slice(0, 40), subject: subject.slice(0, 200), ...(details ? { details: details as object } : {}) } });
  } catch { /* the log is a convenience; the action already happened */ }
}
