import { ARCADE_MAX_MEMBERS, CreateArcadeSchema, JoinArcadeSchema, PlayerLookSchema, defaultLook, type PlayerLook } from '@party/contracts';
import { hashLobbyPassword, matchesLobbyPassword } from './password.js';
import type { Config } from '../config.js';
import type { PrismaClient, ArcadeMember } from '../generated/prisma/client.js';
import type { Transaction } from '../game/model.js';
import { namedCookie, newToken, roomAssert, tokenHash } from '../rooms/security.js';

// Lobby membership, presence and leadership. A browser is a member of a lobby
// through an HttpOnly cookie holding its member key (only the key's hash is
// stored). Presence is the last time a member's browser checked in: the lobby
// page does so every few seconds, a phone in a round's room every 15 seconds.

/** Seen this recently: present (seated in the next round, can stay leader). */
export const PRESENT_MS = 45_000;
/** Seen this recently: shown as connected. */
export const CONNECTED_MS = 12_000;
/** A lobby nobody was seen in for this long closes. */
export const QUIET_MS = 15 * 60_000;
export const MAX_OPEN_LOBBIES = 40;
const TOUCH_EVERY_MS = 5_000;
const LOBBY_TOUCH_EVERY_MS = 30_000;
const MEMBER_COOKIE_SECONDS = 24 * 60 * 60;

export interface Person { id: string; name: string; look: unknown }
export const memberCookieName = (lobbyId: string) => `party_arcade_${lobbyId.replaceAll('-', '')}`;
export const memberCookie = (config: Config, lobbyId: string, token: string) =>
  `${memberCookieName(lobbyId)}=${token}; Path=/api/arcade; HttpOnly; SameSite=Strict; Max-Age=${MEMBER_COOKIE_SECONDS}${config.PUBLIC_ORIGIN.startsWith('https:') ? '; Secure' : ''}`;
export const lookOf = (member: Pick<ArcadeMember, 'id' | 'look'>): PlayerLook => { const look = PlayerLookSchema.safeParse(member.look); return look.success ? look.data : defaultLook(member.id); };
/** A look as a member keeps it: character parts only, never a picture (that belongs to a room). */
const partsOnly = (look: unknown) => { const parsed = PlayerLookSchema.safeParse(look); if (!parsed.success) return null; const { picture: _picture, ...parts } = parsed.data; return parts; };
export const present = (member: Pick<ArcadeMember, 'leftAt' | 'lastSeenAt'>, now: Date) => !member.leftAt && now.getTime() - member.lastSeenAt.getTime() < PRESENT_MS;

export async function lockLobby(tx: Transaction, lobbyId: string) {
  await tx.$executeRaw`SET LOCAL lock_timeout = '1500ms'`;
  await tx.$executeRaw`SET LOCAL statement_timeout = '2500ms'`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`arcade:${lobbyId}`}, 0))::text AS locked`;
}

/**
 * Keeps a leader: the current one while present, otherwise the member who joined
 * first among those present. With nobody present the leader stays as it is.
 */
export async function ensureLeader(tx: Transaction, lobbyId: string, now: Date): Promise<string | null> {
  const lobby = await tx.arcadeLobby.findUniqueOrThrow({ where: { id: lobbyId }, select: { leaderId: true } });
  const members = await tx.arcadeMember.findMany({ where: { lobbyId, leftAt: null, lastSeenAt: { gt: new Date(now.getTime() - PRESENT_MS) } }, orderBy: { joinedAt: 'asc' }, select: { id: true } });
  if (lobby.leaderId && members.some(member => member.id === lobby.leaderId)) return lobby.leaderId;
  const next = members[0]?.id ?? lobby.leaderId;
  if (next !== lobby.leaderId) await tx.arcadeLobby.update({ where: { id: lobbyId }, data: { leaderId: next } });
  return next;
}

export function createLobbies(client: PrismaClient) {
  /** The member this browser is in the lobby, or null. `withLeft`: also a member who left (to come back). */
  async function memberOf(lobbyId: string, cookie: string | undefined, withLeft = false) {
    const token = namedCookie(cookie, memberCookieName(lobbyId)); if (!token) return null;
    const member = await client.arcadeMember.findUnique({ where: { tokenHash: tokenHash(token) } });
    return member && member.lobbyId === lobbyId && (withLeft || !member.leftAt) ? member : null;
  }
  /** Checks a member in: at most one write per member every few seconds, and the lobby's activity every half minute. */
  async function touch(member: ArcadeMember, now = new Date()) {
    if (now.getTime() - member.lastSeenAt.getTime() < TOUCH_EVERY_MS) return;
    await client.arcadeMember.update({ where: { id: member.id }, data: { lastSeenAt: now } });
    await client.arcadeLobby.updateMany({ where: { id: member.lobbyId, closedAt: null, lastActiveAt: { lt: new Date(now.getTime() - LOBBY_TOUCH_EVERY_MS) } }, data: { lastActiveAt: now } });
  }
  const openWhere = (now: Date) => ({ closedAt: null, lastActiveAt: { gt: new Date(now.getTime() - QUIET_MS) } });

  return {
    memberOf, touch, openWhere,
    /** Opens a lobby with its creator as the first member and leader. A retry with the same id gives the same lobby. */
    async create(input: unknown, cookie: string | undefined, person: Person | null, now = new Date()) {
      const parsed = CreateArcadeSchema.safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { lobbyId } = parsed.data;
      const existing = await memberOf(lobbyId, cookie);
      if (existing) return { lobbyId, token: null };
      roomAssert(await client.arcadeLobby.count({ where: { id: lobbyId } }) === 0, 'INVALID_COMMAND');
      const name = person?.name ?? parsed.data.displayName;
      const passwordHash = parsed.data.password ? await hashLobbyPassword(parsed.data.password) : null;
      const token = newToken();
      await client.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('arcade-open', 0))::text AS locked`;
        roomAssert(await tx.arcadeLobby.count({ where: openWhere(now) }) < MAX_OPEN_LOBBIES, 'ARCADE_FULL');
        await tx.arcadeLobby.create({ data: { id: lobbyId, title: parsed.data.title ?? `${name}'s lobby`, passwordHash, createdAt: now, lastActiveAt: now } });
        const look = partsOnly(parsed.data.look) ?? partsOnly(person?.look);
        const member = await tx.arcadeMember.create({ data: { lobbyId, tokenHash: tokenHash(token), displayName: name, personId: person?.id ?? null, joinedAt: now, lastSeenAt: now, ...(look ? { look } : {}) } });
        await tx.arcadeLobby.update({ where: { id: lobbyId }, data: { leaderId: member.id } });
      });
      return { lobbyId, token };
    },
    /**
     * Joins a lobby. A member coming back (this browser, or the same person on any phone) continues as
     * themselves, also when the lobby is locked; someone new needs it unlocked and not full.
     */
    async join(lobbyId: string, input: unknown, cookie: string | undefined, person: Person | null, now = new Date()) {
      const parsed = JoinArcadeSchema.safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND');
      const own = await memberOf(lobbyId, cookie, true);
      // Derive outside the transaction. Compare that same hash under the lobby lock before admitting anyone.
      const candidate = !own && parsed.data.password
        ? await client.arcadeLobby.findFirst({ where: { id: lobbyId, locked: false, ...openWhere(now) }, select: { passwordHash: true } })
        : null;
      const checkedHash = candidate?.passwordHash && await matchesLobbyPassword(parsed.data.password, candidate.passwordHash)
        ? candidate.passwordHash : null;
      return client.$transaction(async tx => {
        await lockLobby(tx, lobbyId);
        const lobby = await tx.arcadeLobby.findUnique({ where: { id: lobbyId } });
        roomAssert(lobby && !lobby.closedAt && now.getTime() - lobby.lastActiveAt.getTime() < QUIET_MS, 'ROOM_NOT_AVAILABLE');
        const verified = own ? await tx.arcadeMember.findUnique({ where: { tokenHash: own.tokenHash } }) : null;
        const returning = verified ?? (person ? await tx.arcadeMember.findUnique({ where: { lobbyId_personId: { lobbyId, personId: person.id } } }) : null);
        if (returning) {
          // Another phone of the same person takes the membership over; this browser keeps its own key.
          const token = verified ? null : newToken();
          await tx.arcadeMember.update({ where: { id: returning.id }, data: { leftAt: null, lastSeenAt: now, ...(token ? { tokenHash: tokenHash(token) } : {}) } });
          await tx.arcadeLobby.update({ where: { id: lobbyId }, data: { lastActiveAt: now } });
          return { token };
        }
        roomAssert(!lobby.locked, 'LOBBY_LOCKED');
        roomAssert(!lobby.passwordHash || lobby.passwordHash === checkedHash, 'LOBBY_PASSWORD_REQUIRED');
        roomAssert(await tx.arcadeMember.count({ where: { lobbyId, leftAt: null } }) < ARCADE_MAX_MEMBERS, 'LOBBY_FULL');
        const token = newToken(); const look = partsOnly(parsed.data.look) ?? partsOnly(person?.look);
        await tx.arcadeMember.create({ data: { lobbyId, tokenHash: tokenHash(token), displayName: person?.name ?? parsed.data.displayName, personId: person?.id ?? null, joinedAt: now, lastSeenAt: now, ...(look ? { look } : {}) } });
        await tx.arcadeLobby.update({ where: { id: lobbyId }, data: { lastActiveAt: now } });
        await ensureLeader(tx, lobbyId, now);
        return { token };
      });
    },
    /** Only the leader locks or unlocks the lobby. */
    async setLocked(member: ArcadeMember, locked: boolean, now = new Date()) {
      await client.$transaction(async tx => {
        await lockLobby(tx, member.lobbyId);
        roomAssert(await ensureLeader(tx, member.lobbyId, now) === member.id, 'FORBIDDEN');
        await tx.arcadeLobby.update({ where: { id: member.lobbyId }, data: { locked } });
      });
    },
    async setPassword(member: ArcadeMember, password: string | null, now = new Date()) {
      const currentLeader = await client.arcadeLobby.findUnique({ where: { id: member.lobbyId }, select: { leaderId: true } });
      roomAssert(currentLeader?.leaderId === member.id, 'FORBIDDEN');
      const passwordHash = password === null ? null : await hashLobbyPassword(password);
      await client.$transaction(async tx => {
        await lockLobby(tx, member.lobbyId);
        const lobby = await tx.arcadeLobby.findFirst({ where: { id: member.lobbyId, ...openWhere(now) }, select: { id: true } });
        roomAssert(lobby, 'ROOM_NOT_AVAILABLE');
        const verified = await tx.arcadeMember.findFirst({ where: { id: member.id, tokenHash: member.tokenHash, leftAt: null }, select: { id: true } });
        roomAssert(verified && await ensureLeader(tx, member.lobbyId, now) === member.id, 'FORBIDDEN');
        await tx.arcadeLobby.update({ where: { id: member.lobbyId }, data: { passwordHash } });
      });
    },
    /** Leaves the lobby; a leader who leaves hands the lobby to the next member. */
    async leave(member: ArcadeMember, now = new Date()) {
      await client.$transaction(async tx => {
        await lockLobby(tx, member.lobbyId);
        await tx.arcadeMember.update({ where: { id: member.id }, data: { leftAt: now } });
        const lobby = await tx.arcadeLobby.findUniqueOrThrow({ where: { id: member.lobbyId }, select: { leaderId: true } });
        if (lobby.leaderId === member.id) await tx.arcadeLobby.update({ where: { id: member.lobbyId }, data: { leaderId: null } });
        await ensureLeader(tx, member.lobbyId, now);
      });
    },
  };
}
export type Lobbies = ReturnType<typeof createLobbies>;
