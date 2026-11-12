import { CreateGameSchema, ImportGameSchema, MAX_DRAFT_BYTES, PublishSchema, RehearseSchema, SaveDraftSchema, type DefinitionIssue, type Draft, type GameSummary } from '@party/contracts';
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
    return { definition: null, issues: blocked.map(({ nodeKey, index, stage }) => {
      const code = stage.kind === 'minigame' ? 'Minigames cannot be played yet' : 'Drawing rounds cannot be played yet';
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
    const entry = { message: friendlyMessage(issue.message, path), code: issue.message.slice(0, 300), nodeKey, stageIndex, path: path.join('.').slice(0, 300) };
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

export function createAuthoring(client: PrismaClient) {
  async function owned(creatorId: string, gameId: string) {
    const game = await client.game.findFirst({ where: { id: gameId, creatorId, archivedAt: null }, include: { draft: true, versions: { orderBy: { number: 'desc' }, take: 1 } } });
    requireGame(game?.draft, 'NOT_FOUND');
    return { game, draft: game.draft, latest: game.versions[0] ?? null };
  }
  function summary(game: { id: string; title: string }, draft: { revision: number; updatedAt: Date; definition: unknown }, latest: { number: number; createdAt: Date; contentHash: string } | null, inspected = inspectDefinition(draft.definition)): GameSummary {
    return { gameId: game.id, title: game.title, revision: draft.revision, updatedAt: draft.updatedAt.toISOString(), issueCount: inspected.issues.length,
      published: latest ? { number: latest.number, publishedAt: latest.createdAt.toISOString(), matchesDraft: inspected.definition !== null && contentHash(inspected.definition) === latest.contentHash } : null };
  }
  const draftView = (game: { id: string; title: string }, draft: { revision: number; updatedAt: Date; definition: unknown }, latest: Parameters<typeof summary>[2]): Draft => {
    const inspected = inspectDefinition(draft.definition);
    return { ...summary(game, draft, latest, inspected), definition: draft.definition, issues: inspected.issues };
  };
  const api = {
    async list(creatorId: string): Promise<GameSummary[]> {
      // Games with a draft are authored games; built-in games played by the owner have none.
      const games = await client.game.findMany({ where: { creatorId, archivedAt: null, draft: { isNot: null } }, include: { draft: true, versions: { orderBy: { number: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' }, take: 100 });
      return games.map(game => summary(game, game.draft!, game.versions[0] ?? null));
    },
    /** Creates a game with its first draft. Repeating the request returns the same game. */
    async create(creatorId: string, input: unknown): Promise<Draft> {
      const parsed = CreateGameSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      const { gameId, title, startFrom } = parsed.data;
      const existing = await client.game.findUnique({ where: { id: gameId }, include: { draft: true, versions: { orderBy: { number: 'desc' }, take: 1 } } });
      if (existing) { requireGame(existing.creatorId === creatorId && existing.draft, 'FORBIDDEN'); return draftView(existing, existing.draft, existing.versions[0] ?? null); }
      const template = startFrom === null ? null : builtInGames.find(game => game.key === startFrom);
      requireGame(startFrom === null || template, 'NOT_FOUND');
      const definition = template ? { ...structuredClone(template.definition), title } : blankDefinition(title);
      const game = await client.game.create({ data: { id: gameId, creatorId, title, draft: { create: { definition, definitionFormat: formatOf(definition) } } }, include: { draft: true } });
      return draftView(game, game.draft!, null);
    },
    /**
     * Creates a game from pasted text. Anything that reads as a game becomes a
     * draft, problems and all, so nothing an AI produced is lost; only text that
     * is not JSON is refused. Repeating the request returns the same game.
     */
    async importGame(creatorId: string, input: unknown): Promise<Draft> {
      const parsed = ImportGameSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      const existing = await client.game.findUnique({ where: { id: parsed.data.gameId }, select: { creatorId: true } });
      if (existing) { requireGame(existing.creatorId === creatorId, 'FORBIDDEN'); return api.get(creatorId, parsed.data.gameId); }
      const definition = importDefinition(parsed.data.text); requireGame(definition && sizeOf(definition) <= MAX_DRAFT_BYTES, 'INVALID_COMMAND');
      // An exported draft keeps its card positions.
      const exported = (parseText(parsed.data.text) ?? {}) as { editor?: unknown };
      const layout = EditorLayoutSchema.safeParse(exported.editor).success ? { editor: exported.editor } : {};
      const title = titleOf(definition) ?? 'Imported game';
      const game = await client.game.create({ data: { id: parsed.data.gameId, creatorId, title, draft: { create: { definition: { ...definition, ...layout } as object, definitionFormat: formatOf(definition) } } } });
      return api.get(creatorId, game.id);
    },
    async get(creatorId: string, gameId: string): Promise<Draft> {
      const { game, draft, latest } = await owned(creatorId, gameId);
      return draftView(game, draft, latest);
    },
    /**
     * Saves the whole draft if nobody saved since `expectedRevision`; otherwise
     * REVISION_CONFLICT, so a second open tab can never silently overwrite work.
     */
    async save(creatorId: string, gameId: string, input: unknown): Promise<Draft> {
      const parsed = SaveDraftSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      const { expectedRevision, definition } = parsed.data;
      requireGame(definition !== null && typeof definition === 'object' && !Array.isArray(definition) && sizeOf(definition) <= MAX_DRAFT_BYTES, 'INVALID_COMMAND');
      // The editor's card positions travel with the draft but must be well formed.
      const layout = (definition as { editor?: unknown }).editor;
      requireGame(layout === undefined || EditorLayoutSchema.safeParse(layout).success, 'INVALID_COMMAND');
      const { game } = await owned(creatorId, gameId);
      const updated = await client.gameDraft.updateMany({ where: { gameId, revision: expectedRevision }, data: { definition: definition as object, definitionFormat: formatOf(definition), revision: { increment: 1 } } });
      requireGame(updated.count === 1, 'REVISION_CONFLICT');
      const title = titleOf(definition);
      if (title && title !== game.title) await client.game.update({ where: { id: gameId }, data: { title } });
      return api.get(creatorId, gameId);
    },
    /** Freezes the current draft as the next version. Publishing an unchanged draft again returns the existing version. */
    async publish(creatorId: string, gameId: string, input: unknown): Promise<Draft> {
      const parsed = PublishSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      await client.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`publish:${gameId}`}, 0))::text AS locked`;
        const game = await tx.game.findFirst({ where: { id: gameId, creatorId, archivedAt: null }, include: { draft: true, versions: { orderBy: { number: 'desc' }, take: 1 } } });
        requireGame(game?.draft, 'NOT_FOUND');
        requireGame(game.draft.revision === parsed.data.expectedRevision, 'REVISION_CONFLICT');
        const { definition } = inspectDefinition(game.draft.definition);
        requireGame(definition, 'INVALID_DEFINITION');
        const hash = contentHash(definition); const latest = game.versions[0];
        if (latest?.contentHash === hash) return;
        await tx.gameVersion.create({ data: { gameId, number: (latest?.number ?? 0) + 1, definitionFormat: definition.formatVersion, definition, contentHash: hash, createdById: creatorId } });
      });
      return api.get(creatorId, gameId);
    },
    /** Removes a game from your list. Published versions and rooms already playing them are kept. */
    async archive(creatorId: string, gameId: string): Promise<void> {
      await owned(creatorId, gameId);
      await client.game.update({ where: { id: gameId }, data: { archivedAt: new Date() } });
    },
    /**
     * A practice version of the current draft, optionally starting at a chosen
     * scene (scenes that can no longer be reached are left out). It lives in a
     * separate game without a draft, so it never appears in your games or as a
     * published version of this one.
     */
    async rehearsalVersion(creatorId: string, gameId: string, input: unknown): Promise<string> {
      const parsed = RehearseSchema.safeParse(input); requireGame(parsed.success, 'INVALID_COMMAND');
      const { game, draft } = await owned(creatorId, gameId);
      requireGame(draft.revision === parsed.data.expectedRevision, 'REVISION_CONFLICT');
      let raw = gamePart(draft.definition) as { startNodeKey?: unknown; nodes?: { key: string }[]; edges?: { from: string; to: string }[] };
      // Scenes the rehearsal cannot reach (work in progress, or before the chosen start) are left out.
      {
        const nodes = raw.nodes ?? []; const edges = raw.edges ?? [];
        const start = parsed.data.startNodeKey ?? (typeof raw.startNodeKey === 'string' ? raw.startNodeKey : '');
        requireGame(nodes.some(node => node.key === start), parsed.data.startNodeKey ? 'NOT_FOUND' : 'INVALID_DEFINITION');
        const reached = new Set<string>(); const queue = [start];
        while (queue.length) { const key = queue.shift()!; if (reached.has(key)) continue; reached.add(key); for (const edge of edges) if (edge.from === key) queue.push(edge.to); }
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
    /** The latest published version of an owned game, for opening a room. */
    async latestVersion(creatorId: string, gameId: string) {
      const version = await client.gameVersion.findFirst({ where: { gameId, game: { creatorId, archivedAt: null } }, orderBy: { number: 'desc' }, select: { id: true } });
      requireGame(version, 'NOT_FOUND');
      return version.id;
    },
  };
  return api;
}
export type Authoring = ReturnType<typeof createAuthoring>;
