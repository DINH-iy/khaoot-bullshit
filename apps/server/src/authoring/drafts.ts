import { GAME_PERMISSIONS, type GamePermission, UpdateGameSharingSchema, type GameSharing, CreateGameSchema, ImportGameSchema, MAX_DRAFT_BYTES, PublishSchema, RehearseSchema, SaveDraftSchema, type DefinitionIssue, type Draft, type GameEditor, type GameSummary } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { contentHash, GameDefinitionSchema, unplayable, type GameDefinition } from '../game/definition.js';
import { requireGame } from '../game/errors.js';
import { builtInGames } from '../game/templates.js';
import { friendlyMessage } from './messages.js';
import { importDefinition, parseText } from './import.js';
import { EditorLayoutSchema } from '@party/contracts';

// Drafts and publishing. A draft may be incomplete or invalid while someone
// edits it; it is saved as is, with its problems listed per scene. Publishing
// freezes a fully valid draft into an immutable, numbered GameVersion; rooms
// always play a published version, never the draft.

/** Every problem in a draft, located on its scene (node) and stage where possible. */
/** The draft without its editor layout: the part that is validated and published. */
export function gamePart(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const { editor: _layout, ...rest } = raw as Record<string, unknown>;
  return rest;
}
export function inspectDefinition(draft: unknown): { issues: DefinitionIssue[]; definition: GameDefinition | null } {
  const raw = gamePart(draft);
  const parsed = GameDefinitionSchema.safeParse(raw);
  if (parsed.success) {
    // Valid, but some parts cannot be played yet: listed on their scene, and not publishable.
    const blocked = unplayable(parsed.data);
    if (!blocked.length) return { issues: [], definition: parsed.data };
    return { definition: null, issues: blocked.map(({ nodeKey, index }) => {
      const code = 'Choose a minigame';
      const nodeIndex = parsed.data.nodes.findIndex(node => node.key === nodeKey);
      return { message: friendlyMessage(code, []), code, nodeKey, stageIndex: index, path: `nodes.${nodeIndex}.stages.${index}` };
    }) };
  }
  const nodes = (raw as { nodes?: unknown } | null)?.nodes;
  const seen = new Set<string>(); const issues: DefinitionIssue[] = [];
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String);
    const nodeIndex = path[0] === 'nodes' && /^\d+$/.test(path[1] ?? '') ? Number(path[1]) : -1;
    const node = Array.isArray(nodes) ? nodes[nodeIndex] as { key?: unknown } | undefined : undefined;
    const nodeKey = typeof node?.key === 'string' ? node.key.slice(0, 64) : null;
    const stageIndex = nodeIndex >= 0 && path[2] === 'stages' && /^\d+$/.test(path[3] ?? '') ? Number(path[3]) : null;
    const entry = { message: friendlyMessage(issue.message, path, issue.code === 'custom'), code: issue.message.slice(0, 300), nodeKey, stageIndex, path: path.join('.').slice(0, 300) };
    const key = `${entry.code}|${entry.path}`; if (seen.has(key) || issues.length >= 200) continue;
    seen.add(key); issues.push(entry);
  }
  return { issues, definition: null };
}

/** A blank game: one welcome scene, ready to grow in the editor. */
function blankDefinition(title: string) {
  return { formatVersion: 2, title, startNodeKey: 'welcome',
    nodes: [{ key: 'welcome', stages: [{ key: 'intro', kind: 'info', title, prompt: 'Welcome! The game starts in a moment.', durationMs: null }] }], edges: [] };
}
const formatOf = (raw: unknown) => { const value = (raw as { formatVersion?: unknown } | null)?.formatVersion; return value === 1 || value === 2 ? value : 2; };
const titleOf = (raw: unknown) => { const value = (raw as { title?: unknown } | null)?.title; return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 160 ? value.trim() : null; };
const sizeOf = (raw: unknown) => Buffer.byteLength(JSON.stringify(raw) ?? '', 'utf8');

/**
 * Who is working on games: the owner (personId null, may do everything), or a person with a role. `permissions`:
 * the person's own role's (app) permissions; only `games.all` matters here (see and do everything with every game).
 */
export interface EditorAccess { personId: string | null; name?: string; permissions?: ReadonlySet<string> | undefined }
export const OWNER_ACCESS: EditorAccess = { personId: null };
const ALL_GAME = new Set<GamePermission>(GAME_PERMISSIONS);
const seesAll = (access: EditorAccess) => access.personId === null || Boolean(access.permissions?.has('games.all'));
export const controlsGame = (game: { authorPersonId: string | null }, access: EditorAccess) => seesAll(access) || game.authorPersonId === access.personId;
/** The games one may see: every game for the owner (and `games.all`); else the games one made and those shared with one to view. */
export const visibleTo = (access: EditorAccess) => seesAll(access) ? {} : { OR: [{ authorPersonId: access.personId }, { shares: { some: { personId: access.personId!, role: { permissions: { has: 'game.view' } } } } }] };

/** What one may do with a game: everything as its maker, the owner or with `games.all`; else what one's share's role allows. */
export async function gamePermissions(client: PrismaClient, game: { id: string; authorPersonId: string | null }, access: EditorAccess): Promise<Set<GamePermission>> {
  if (controlsGame(game, access)) return ALL_GAME;
  const share = await client.gameShare.findUnique({ where: { gameId_personId: { gameId: game.id, personId: access.personId! } }, select: { role: { select: { permissions: true } } } });
  return new Set((share?.role.permissions ?? []).filter((permission): permission is GamePermission => (GAME_PERMISSIONS as readonly string[]).includes(permission)));
}

type DraftActivity = { updatedAt: Date; lastEditorName: string | null; lastEditorIsOwner: boolean };
function draftActivity(draft: DraftActivity): { updatedAt: string; lastEditor?: GameEditor } {
  const lastEditor: GameEditor | undefined = draft.lastEditorIsOwner ? { kind: 'owner' }
    : draft.lastEditorName ? { kind: 'person', name: draft.lastEditorName } : undefined;
  return { updatedAt: draft.updatedAt.toISOString(), ...(lastEditor ? { lastEditor } : {}) };
}

export function createAuthoring(client: PrismaClient) {
  const editorColumns = async (access: EditorAccess) => ({
    lastEditorIsOwner: access.personId === null,
    lastEditorName: access.personId ? access.name ?? (await client.person.findUnique({ where: { id: access.personId }, select: { name: true } }))?.name ?? null : null,
  });
  // `need`: the game permission this asks for. A game one may not see is NOT_FOUND; one may see but not do this with, FORBIDDEN.
  async function owned(creatorId: string, gameId: string, access: EditorAccess, need: GamePermission = 'game.view') {
    const game = await client.game.findFirst({ where: { id: gameId, creatorId, archivedAt: null, ...visibleTo(access) }, include: { draft: true, versions: { orderBy: { number: 'desc' }, take: 1 } } });
    requireGame(game?.draft, 'NOT_FOUND');
    const can = await gamePermissions(client, game, access);
    requireGame(can.has(need), 'FORBIDDEN');
    return { game, draft: game.draft, latest: game.versions[0] ?? null, can };
  }
  async function authorOf(game: { authorPersonId: string | null }, access: EditorAccess) {
    if (!game.authorPersonId) return null;
    const person = await client.person.findUnique({ where: { id: game.authorPersonId }, select: { name: true } });
    return { name: person?.name ?? 'Former editor', you: game.authorPersonId === access.personId };
  }
  function summary(game: { id: string; title: string }, draft: DraftActivity & { revision: number; definition: unknown }, latest: { number: number; createdAt: Date; contentHash: string } | null, inspected = inspectDefinition(draft.definition),
    who: { author?: GameSummary['author']; shared?: boolean; can?: ReadonlySet<GamePermission> } = {}): GameSummary {
    return { gameId: game.id, title: game.title, revision: draft.revision, ...draftActivity(draft), issueCount: inspected.issues.length,
      published: latest ? { number: latest.number, publishedAt: latest.createdAt.toISOString(), matchesDraft: inspected.definition !== null && contentHash(inspected.definition) === latest.contentHash } : null,
      ...(who.author !== undefined ? { author: who.author } : {}), ...(who.shared ? { shared: true } : {}), ...(who.can ? { can: [...who.can] } : {}) };
  }
  const draftView = (game: { id: string; title: string; builtInKey?: string | null }, draft: DraftActivity & { revision: number; definition: unknown }, latest: Parameters<typeof summary>[2]): Draft => {
    const inspected = inspectDefinition(draft.definition);
    // The owner's own version of a built-in game says which one, so the editor can show it.
    const original = game.builtInKey ? builtInGames.find(entry => entry.key === game.builtInKey) : undefined;
    return { ...summary(game, draft, latest, inspected), definition: draft.definition, issues: inspected.issues, builtIn: original ? { key: original.key, title: original.definition.title } : null };
  };
  const listedGames = (creatorId: string, access: EditorAccess) => ({
    creatorId, archivedAt: null, builtInKey: null, draft: { isNot: null }, ...visibleTo(access),
  });
  const api = {
    async list(creatorId: string, access: EditorAccess): Promise<GameSummary[]> {
      // Games with a draft are authored games; built-in games played by the owner have none. The owner's own
      // versions of built-in games are shown with the built-in game instead. Each says who made it.
      const games = await client.game.findMany({ where: listedGames(creatorId, access),
        include: { draft: true, versions: { orderBy: { number: 'desc' }, take: 1 }, author: { select: { name: true } },
          shares: access.personId ? { where: { personId: access.personId }, select: { role: { select: { permissions: true } } } } : { take: 0, select: { role: { select: { permissions: true } } } } }, orderBy: { updatedAt: 'desc' }, take: 100 });
      return games.map(game => summary(game, game.draft!, game.versions[0] ?? null, undefined, {
        author: game.authorPersonId ? { name: game.author?.name ?? 'Former editor', you: game.authorPersonId === access.personId } : null,
        shared: access.personId !== null && game.authorPersonId !== access.personId,
        can: seesAll(access) || game.authorPersonId === access.personId ? ALL_GAME : new Set((game.shares[0]?.role.permissions ?? []).filter((permission): permission is GamePermission => (GAME_PERMISSIONS as readonly string[]).includes(permission))) }));
    },
    async activity(creatorId: string, access: EditorAccess) {
      const games = await client.game.findMany({ where: listedGames(creatorId, access),
        select: { id: true, draft: { select: { updatedAt: true, lastEditorName: true, lastEditorIsOwner: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 });
      return games.flatMap(game => game.draft ? [{ gameId: game.id, ...draftActivity(game.draft) }] : []);
    },
    /** Creates a game with its first draft. Repeating the request returns the same game. */
    async create(creatorId: string, input: unknown, access: EditorAccess = OWNER_ACCESS): Promise<Draft> {
      const parsed = CreateGameSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      const { gameId, title, startFrom, copyOf } = parsed.data;
      const existing = await client.game.findUnique({ where: { id: gameId }, include: { draft: true, versions: { orderBy: { number: 'desc' }, take: 1 } } });
      if (existing) { requireGame(existing.creatorId === creatorId && existing.draft && (seesAll(access) || existing.authorPersonId === access.personId), 'FORBIDDEN'); return draftView(existing, existing.draft, existing.versions[0] ?? null); }
      const template = startFrom === null ? null : builtInGames.find(game => game.key === startFrom);
      requireGame(startFrom === null || template, 'NOT_FOUND');
      // A copy of a built-in game is a copy of what the menu shows: the owner's published version, if any.
      const own = template ? (await api.builtInVersions(creatorId)).get(template.key) : undefined;
      // A copy of one of your games starts from its draft as it is now, card positions and all; the original stays as it was.
      const source = copyOf ? (await owned(creatorId, copyOf, access, 'game.copy')).draft.definition as Record<string, unknown> : undefined;
      const definition = source ? { ...structuredClone(source), title } : template ? { ...structuredClone(own?.definition ?? template.definition), title } : blankDefinition(title);
      const game = await client.game.create({ data: { id: gameId, creatorId, title, authorPersonId: access.personId, draft: { create: { definition, definitionFormat: formatOf(definition), ...await editorColumns(access) } } }, include: { draft: true } });
      return draftView(game, game.draft!, null);
    },
    /**
     * Creates a game from pasted text. Anything that reads as a game becomes a
     * draft, problems and all, so nothing an AI produced is lost; only text that
     * is not JSON is refused. Repeating the request returns the same game.
     */
    async importGame(creatorId: string, input: unknown, access: EditorAccess = OWNER_ACCESS): Promise<Draft> {
      const parsed = ImportGameSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      const existing = await client.game.findUnique({ where: { id: parsed.data.gameId }, select: { creatorId: true, authorPersonId: true } });
      if (existing) { requireGame(existing.creatorId === creatorId && (seesAll(access) || existing.authorPersonId === access.personId), 'FORBIDDEN'); return api.get(creatorId, parsed.data.gameId, access); }
      const definition = importDefinition(parsed.data.text); requireGame(definition && sizeOf(definition) <= MAX_DRAFT_BYTES, 'INVALID_COMMAND');
      // An exported draft keeps its card positions.
      const exported = (parseText(parsed.data.text) ?? {}) as { editor?: unknown };
      const layout = EditorLayoutSchema.safeParse(exported.editor).success ? { editor: exported.editor } : {};
      const title = titleOf(definition) ?? 'Imported game';
      const game = await client.game.create({ data: { id: parsed.data.gameId, creatorId, title, authorPersonId: access.personId, draft: { create: { definition: { ...definition, ...layout } as object, definitionFormat: formatOf(definition), ...await editorColumns(access) } } } });
      return api.get(creatorId, game.id, access);
    },
    async get(creatorId: string, gameId: string, access: EditorAccess = OWNER_ACCESS): Promise<Draft> {
      const { game, draft, latest, can } = await owned(creatorId, gameId, access);
      return { ...draftView(game, draft, latest), author: await authorOf(game, access), ...(access.personId !== null && game.authorPersonId !== access.personId ? { shared: true } : {}), can: [...can] };
    },
    /**
     * Saves the whole draft if nobody saved since `expectedRevision`; otherwise
     * REVISION_CONFLICT, so a second open tab can never silently overwrite work.
     */
    async save(creatorId: string, gameId: string, input: unknown, access: EditorAccess = OWNER_ACCESS): Promise<Draft> {
      const parsed = SaveDraftSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      const { expectedRevision, definition } = parsed.data;
      requireGame(definition !== null && typeof definition === 'object' && !Array.isArray(definition) && sizeOf(definition) <= MAX_DRAFT_BYTES, 'INVALID_COMMAND');
      // The editor's card positions travel with the draft but must be well formed.
      const layout = (definition as { editor?: unknown }).editor;
      requireGame(layout === undefined || EditorLayoutSchema.safeParse(layout).success, 'INVALID_COMMAND');
      const { game } = await owned(creatorId, gameId, access, 'game.edit');
      const updated = await client.gameDraft.updateMany({ where: { gameId, revision: expectedRevision }, data: { definition: definition as object, definitionFormat: formatOf(definition), revision: { increment: 1 }, ...await editorColumns(access) } });
      requireGame(updated.count === 1, 'REVISION_CONFLICT');
      const title = titleOf(definition);
      if (title && title !== game.title) await client.game.update({ where: { id: gameId }, data: { title } });
      return api.get(creatorId, gameId, access);
    },
    /** Freezes the current draft as the next version. Publishing an unchanged draft again returns the existing version. */
    async publish(creatorId: string, gameId: string, input: unknown, access: EditorAccess = OWNER_ACCESS): Promise<Draft> {
      const parsed = PublishSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      await owned(creatorId, gameId, access, 'game.publish');
      await client.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`publish:${gameId}`}, 0))::text AS locked`;
        const game = await tx.game.findFirst({ where: { id: gameId, creatorId, archivedAt: null, ...visibleTo(access) }, include: { draft: true, versions: { orderBy: { number: 'desc' }, take: 1 } } });
        requireGame(game?.draft, 'NOT_FOUND');
        requireGame(game.draft.revision === parsed.data.expectedRevision, 'REVISION_CONFLICT');
        const { definition } = inspectDefinition(game.draft.definition);
        requireGame(definition, 'INVALID_DEFINITION');
        const hash = contentHash(definition); const latest = game.versions[0];
        if (latest?.contentHash === hash) return;
        await tx.gameVersion.create({ data: { gameId, number: (latest?.number ?? 0) + 1, definitionFormat: definition.formatVersion, definition, contentHash: hash, createdById: creatorId } });
      });
      return api.get(creatorId, gameId, access);
    },
    /** Removes a game from your list. Published versions and rooms already playing them are kept. */
    async archive(creatorId: string, gameId: string, access: EditorAccess = OWNER_ACCESS): Promise<void> {
      // Only its author or the owner removes a game; someone it was shared with cannot.
      await owned(creatorId, gameId, access, 'game.remove');
      await client.game.update({ where: { id: gameId }, data: { archivedAt: new Date() } });
    },
    /**
     * A practice version of the current draft, optionally starting at a chosen
     * scene (scenes that can no longer be reached are left out). It lives in a
     * separate game without a draft, so it never appears in your games or as a
     * published version of this one.
     */
    async rehearsalVersion(creatorId: string, gameId: string, input: unknown, access: EditorAccess = OWNER_ACCESS): Promise<string> {
      const parsed = RehearseSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      const { game, draft } = await owned(creatorId, gameId, access, 'game.rehearse');
      requireGame(draft.revision === parsed.data.expectedRevision, 'REVISION_CONFLICT');
      let raw = gamePart(draft.definition) as { startNodeKey?: unknown; nodes?: { key: string }[]; edges?: { from: string; to: string }[] };
      // Scenes the rehearsal cannot reach (work in progress, or before the chosen start) are left out.
      {
        const nodes = raw.nodes ?? []; const edges = raw.edges ?? [];
        const start = parsed.data.startNodeKey ?? (typeof raw.startNodeKey === 'string' ? raw.startNodeKey : '');
        requireGame(nodes.some(node => node.key === start), parsed.data.startNodeKey ? 'NOT_FOUND' : 'INVALID_DEFINITION');
        const reached = new Set<string>(); const queue = [start];
        // Only this scene (trying one minigame or round): nothing after it is reached, so the game ends there.
        while (queue.length) { const key = queue.shift()!; if (reached.has(key)) continue; reached.add(key); if (!parsed.data.only) for (const edge of edges) if (edge.from === key) queue.push(edge.to); }
        raw = { ...raw, startNodeKey: start, nodes: nodes.filter(node => reached.has(node.key)), edges: edges.filter(edge => reached.has(edge.from) && reached.has(edge.to)) };
      }
      const { definition } = inspectDefinition(raw);
      requireGame(definition, 'INVALID_DEFINITION');
      const hash = contentHash(definition);
      return client.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rehearse:${creatorId}`}, 0))::text AS locked`;
        const existing = await tx.gameVersion.findFirst({ where: { contentHash: hash, game: { creatorId, archivedAt: null, draft: { is: null }, title: { startsWith: 'Rehearsal · ' } } }, select: { id: true } });
        if (existing) return existing.id;
        const hidden = await tx.game.create({ data: { creatorId, title: `Rehearsal · ${game.title}`.slice(0, 160) } });
        return (await tx.gameVersion.create({ data: { gameId: hidden.id, number: 1, definitionFormat: definition.formatVersion, definition, contentHash: hash, createdById: creatorId }, select: { id: true } })).id;
      });
    },
    /** Whom a game is shared with (and in which role), the people it could be shared with (those with a role), and the roles. */
    async sharing(creatorId: string, gameId: string, access: EditorAccess): Promise<GameSharing> {
      const { game } = await owned(creatorId, gameId, access, 'game.share');
      const [shares, people, roles] = await Promise.all([client.gameShare.findMany({ where: { gameId }, select: { personId: true, roleId: true } }),
        client.person.findMany({ where: { roleId: { not: null }, removedAt: null }, select: { id: true, name: true }, orderBy: { nameKey: 'asc' } }),
        client.accessRole.findMany({ select: { id: true, name: true }, orderBy: [{ builtIn: 'desc' }, { nameKey: 'asc' }] })]);
      return { authorPersonId: game.authorPersonId, shares, editors: people.map(person => ({ personId: person.id, name: person.name })), roles, canChangeAuthor: access.personId === null };
    },
    /** Shares a game with these people in these roles (and no others); the owner may also say who made it. Nothing else about the game changes. */
    async share(creatorId: string, gameId: string, input: unknown, access: EditorAccess): Promise<GameSharing> {
      const parsed = UpdateGameSharingSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      const { game } = await owned(creatorId, gameId, access, 'game.share');
      const author = parsed.data.authorPersonId === undefined ? game.authorPersonId : parsed.data.authorPersonId;
      requireGame(author === game.authorPersonId || access.personId === null, 'FORBIDDEN');
      const wanted = new Map(parsed.data.shares.map(entry => [entry.personId, entry.roleId]));
      const [people, roles] = await Promise.all([
        client.person.findMany({ where: { roleId: { not: null }, removedAt: null, id: { in: [...wanted.keys(), ...(author ? [author] : [])] } }, select: { id: true } }),
        client.accessRole.findMany({ where: { id: { in: [...new Set(wanted.values())] } }, select: { id: true } })]);
      const eligible = new Set(people.map(person => person.id)); const known = new Set(roles.map(role => role.id));
      requireGame(!author || eligible.has(author), 'INVALID_COMMAND');
      requireGame([...wanted.values()].every(roleId => known.has(roleId)), 'INVALID_COMMAND');
      // The game's maker needs no share; people without a role cannot open the editor, so they are left out.
      const kept = [...wanted].filter(([personId]) => eligible.has(personId) && personId !== author);
      await client.$transaction(async tx => {
        if (author !== game.authorPersonId) await tx.game.update({ where: { id: gameId }, data: { authorPersonId: author } });
        await tx.gameShare.deleteMany({ where: { gameId, personId: { notIn: kept.map(([personId]) => personId) } } });
        for (const [personId, roleId] of kept) await tx.gameShare.upsert({ where: { gameId_personId: { gameId, personId } }, create: { gameId, personId, roleId }, update: { roleId } });
      });
      return api.sharing(creatorId, gameId, access.personId === null || author === access.personId ? access : OWNER_ACCESS);
    },
    /** The latest published version of an owned game, for opening a room. */
    /**
     * The owner's own versions of built-in games, by key: the game to edit, and its latest published version (used
     * by the menu and rooms instead of the built-in) or null while nothing is published yet.
     */
    async builtInVersions(creatorId: string) {
      const games = await client.game.findMany({ where: { creatorId, archivedAt: null, builtInKey: { not: null } },
        include: { draft: true, versions: { orderBy: { number: 'desc' }, take: 1 } } });
      return new Map(games.map(game => {
        const latest = game.versions[0] ?? null; const inspected = game.draft ? inspectDefinition(game.draft.definition) : null;
        return [game.builtInKey!, { gameId: game.id, versionId: latest?.id ?? null, definition: latest ? latest.definition as GameDefinition : null,
          unpublished: !latest || !inspected?.definition || contentHash(inspected.definition) !== latest.contentHash }];
      }));
    },
    /** Opens a built-in game for editing: the owner's own version of it, made from the built-in the first time. */
    async editBuiltIn(creatorId: string, key: string): Promise<string> {
      const template = builtInGames.find(game => game.key === key); requireGame(template, 'NOT_FOUND');
      const find = () => client.game.findFirst({ where: { creatorId, builtInKey: key, archivedAt: null }, select: { id: true } });
      const existing = await find(); if (existing) return existing.id;
      const definition = structuredClone(template.definition);
      try {
        return (await client.game.create({ data: { creatorId, title: definition.title, builtInKey: key, draft: { create: { definition, definitionFormat: formatOf(definition), lastEditorIsOwner: true } } }, select: { id: true } })).id;
      } catch (error) {
        // Two clicks at once: the other one made it.
        const made = await find(); if (made) return made.id; throw error;
      }
    },
    /** Back to the built-in game: the owner's version is archived (games played with it keep their history). */
    async restoreBuiltIn(creatorId: string, key: string) {
      await client.game.updateMany({ where: { creatorId, builtInKey: key, archivedAt: null }, data: { archivedAt: new Date(), builtInKey: null } });
    },
    async latestVersion(creatorId: string, gameId: string) {
      const version = await client.gameVersion.findFirst({ where: { gameId, game: { creatorId, archivedAt: null } }, orderBy: { number: 'desc' }, select: { id: true } });
      requireGame(version, 'NOT_FOUND');
      return version.id;
    },
  };
  return api;
}
export type Authoring = ReturnType<typeof createAuthoring>;
