import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createAuthoring } from '../../src/authoring/drafts.js';
import { readConfig } from '../../src/config.js';
import { db, prisma } from './game-fixture.js';

const ownerToken = 'w'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'e'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>; let owner: string;
const authoring = createAuthoring(prisma);
const call = (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown, cookie = owner) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
beforeAll(async () => {
  app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready();
  owner = String((await call('POST', '/api/host/claim', { token: ownerToken }, '')).headers['set-cookie']).split(';')[0]!;
});
afterAll(async () => { await app.close(); await db.close(); });
const creator = () => prisma.creator.create({ data: { issuer: 'https://identity.example/', subject: randomUUID() } });

describe('authoring drafts and publishing', () => {
  it('creates a blank or template game once, even when the request is repeated', async () => {
    const author = await creator(); const gameId = randomUUID();
    const first = await authoring.create(author.id, { gameId, title: 'Quiz night', startFrom: null });
    expect(first).toMatchObject({ gameId, title: 'Quiz night', revision: 0, issueCount: 0, published: null, definition: { formatVersion: 2, title: 'Quiz night' } });
    expect(await authoring.create(author.id, { gameId, title: 'Other title', startFrom: null })).toMatchObject({ title: 'Quiz night', revision: 0 });
    const copy = await authoring.create(author.id, { gameId: randomUUID(), title: 'My Friday', startFrom: 'friday-night-chaos' });
    expect(copy.definition).toMatchObject({ title: 'My Friday', startNodeKey: 'opening' });
    await expect(authoring.create(author.id, { gameId: randomUUID(), title: 'x', startFrom: 'no-such-game' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Someone else's game is never readable, writable or reusable.
    const stranger = await creator();
    await expect(authoring.get(stranger.id, gameId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(authoring.create(stranger.id, { gameId, title: 'Mine now', startFrom: null })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await authoring.list(author.id)).map(game => game.title).sort()).toEqual(['My Friday', 'Quiz night']);
    await expect(authoring.archive(stranger.id, gameId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await authoring.archive(author.id, gameId);
    expect((await authoring.list(author.id)).map(game => game.title)).toEqual(['My Friday']);
    await expect(authoring.get(author.id, gameId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('saves invalid work in progress, lists each problem on its scene, and refuses to overwrite a newer save', async () => {
    const author = await creator(); const { gameId, definition } = await authoring.create(author.id, { gameId: randomUUID(), title: 'Branches', startFrom: 'friday-night-chaos' });
    const broken = structuredClone(definition) as { title: string; edges: { option?: string; from: string }[] };
    broken.title = 'Branches renamed';
    broken.edges = broken.edges.filter(edge => edge.option !== 'physical');
    const saved = await authoring.save(author.id, gameId, { expectedRevision: 0, definition: broken });
    expect(saved).toMatchObject({ revision: 1, title: 'Branches renamed' });
    expect(saved.issues).toEqual(expect.arrayContaining([{ message: 'A route option is not connected to a scene yet.', code: 'Unconnected route option', nodeKey: 'choose', stageIndex: null, path: expect.stringMatching(/^nodes\.\d+$/) }]));
    expect(saved.issueCount).toBe(saved.issues.length);
    // A second tab still on revision 0 cannot overwrite revision 1.
    await expect(authoring.save(author.id, gameId, { expectedRevision: 0, definition })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect((await authoring.get(author.id, gameId)).revision).toBe(1);
    // Field-level problems point at the stage too.
    const badStage = structuredClone(definition) as { nodes: { key: string; stages: { prompt?: string }[] }[] };
    badStage.nodes[0]!.stages[1]!.prompt = '';
    const located = await authoring.save(author.id, gameId, { expectedRevision: 1, definition: badStage });
    expect(located.issues).toEqual(expect.arrayContaining([expect.objectContaining({ message: 'The text is empty or too long.', nodeKey: 'opening', stageIndex: 1, path: 'nodes.0.stages.1.prompt' })]));
    // Card positions are saved with the draft but are never part of what is published.
    const laidOut = await authoring.save(author.id, gameId, { expectedRevision: 2, definition: { ...definition as object, editor: { positions: { opening: { x: 24, y: 48 } } } } });
    expect(laidOut).toMatchObject({ revision: 3, issueCount: 0, definition: { editor: { positions: { opening: { x: 24, y: 48 } } } } });
    await expect(authoring.save(author.id, gameId, { expectedRevision: 3, definition: { ...definition as object, editor: { positions: { opening: { x: 'left' } } } } })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    const published = await authoring.publish(author.id, gameId, { expectedRevision: 3 });
    const version = await prisma.gameVersion.findFirstOrThrow({ where: { gameId }, orderBy: { number: 'desc' } });
    expect(version.definition).not.toHaveProperty('editor');
    expect(published.published!.matchesDraft).toBe(true);
    for (const value of [null, [], 'text', 42]) await expect(authoring.save(author.id, gameId, { expectedRevision: 3, definition: value })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    await expect(authoring.save(author.id, gameId, { expectedRevision: 3, definition: { title: 'x'.repeat(300 * 1024) } })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
  });

  it('publishes only valid drafts, numbers versions, and keeps published versions unchanged', async () => {
    const author = await creator(); const draft = await authoring.create(author.id, { gameId: randomUUID(), title: 'Publishing', startFrom: 'first-reliable-game' });
    const { gameId } = draft;
    const v1 = await authoring.publish(author.id, gameId, { expectedRevision: 0 });
    expect(v1.published).toMatchObject({ number: 1, matchesDraft: true });
    expect((await authoring.publish(author.id, gameId, { expectedRevision: 0 })).published!.number).toBe(1);
    await expect(authoring.publish(author.id, gameId, { expectedRevision: 5 })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const edited = structuredClone(draft.definition) as { title: string; nodes: { stages: { prompt: string }[] }[] };
    edited.nodes[0]!.stages[0]!.prompt = 'A new first question?';
    const changed = await authoring.save(author.id, gameId, { expectedRevision: 0, definition: edited });
    expect(changed.published).toMatchObject({ number: 1, matchesDraft: false });
    const broken = { ...structuredClone(edited), startNodeKey: "missing" };
    await authoring.save(author.id, gameId, { expectedRevision: 1, definition: broken });
    await expect(authoring.publish(author.id, gameId, { expectedRevision: 2 })).rejects.toMatchObject({ code: 'INVALID_DEFINITION' });
    await authoring.save(author.id, gameId, { expectedRevision: 2, definition: edited });
    expect((await authoring.publish(author.id, gameId, { expectedRevision: 3 })).published).toMatchObject({ number: 2, matchesDraft: true });
    const versions = await prisma.gameVersion.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(versions.map(version => [version.number, version.definitionFormat])).toEqual([[1, 1], [2, 1]]);
    await expect(prisma.gameVersion.update({ where: { id: versions[0]!.id }, data: { contentHash: 'f'.repeat(64) } })).rejects.toThrow();
  });

  it('accepts minigame scenes without a chosen minigame in drafts, marks them on their scene, and refuses to publish them', async () => {
    const author = await creator(); const draft = await authoring.create(author.id, { gameId: randomUUID(), title: 'Mini', startFrom: null });
    const definition = draft.definition as { nodes: { key: string; stages: object[] }[]; edges: object[] };
    const withMinigame = { ...definition, nodes: [...definition.nodes, { key: 'mini', stages: [{ key: 'main', kind: 'minigame', prompt: 'Musical chairs', game: 'to-be-chosen', durationMs: 60000 }] }],
      edges: [{ key: 'w-m', from: 'welcome', to: 'mini' }] };
    const saved = await authoring.save(author.id, draft.gameId, { expectedRevision: 0, definition: withMinigame });
    expect(saved.issues).toEqual([expect.objectContaining({ code: 'Choose a minigame', nodeKey: 'mini', stageIndex: 0, message: expect.stringContaining('Choose which minigame') })]);
    await expect(authoring.publish(author.id, draft.gameId, { expectedRevision: 1 })).rejects.toMatchObject({ code: 'INVALID_DEFINITION' });
  });
  it('rehearses the current draft without publishing, from the start or from a scene, in a hidden game', async () => {
    const author = await creator(); const draft = await authoring.create(author.id, { gameId: randomUUID(), title: 'Practice', startFrom: 'friday-night-chaos' });
    const ids = () => ({ sessionId: randomUUID(), commandId: randomUUID() });
    const whole = await authoring.rehearsalVersion(author.id, draft.gameId, { expectedRevision: 0, startNodeKey: null, ...ids() });
    expect(await authoring.rehearsalVersion(author.id, draft.gameId, { expectedRevision: 0, startNodeKey: null, ...ids() })).toBe(whole);
    const fromMusic = await prisma.gameVersion.findUniqueOrThrow({ where: { id: await authoring.rehearsalVersion(author.id, draft.gameId, { expectedRevision: 0, startNodeKey: 'music', ...ids() }) }, include: { game: true } });
    expect((fromMusic.definition as { startNodeKey: string; nodes: { key: string }[] }).nodes.map(node => node.key).sort()).toEqual(['finale', 'music']);
    expect(fromMusic.game).toMatchObject({ title: 'Rehearsal · Practice', archivedAt: null });
    // Nothing was published, and rehearsal games never appear in the list.
    expect((await authoring.get(author.id, draft.gameId)).published).toBeNull();
    expect((await authoring.list(author.id)).map(game => game.title)).toEqual(['Practice']);
    await expect(authoring.rehearsalVersion(author.id, draft.gameId, { expectedRevision: 3, startNodeKey: null, ...ids() })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(authoring.rehearsalVersion(author.id, draft.gameId, { expectedRevision: 0, startNodeKey: 'nowhere', ...ids() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // A vote cannot be rehearsed without the round it votes on.
    const vote = await authoring.create(author.id, { gameId: randomUUID(), title: 'Votes', startFrom: 'picture-party' });
    await expect(authoring.rehearsalVersion(author.id, vote.gameId, { expectedRevision: 0, startNodeKey: 'pet-vote', ...ids() })).rejects.toMatchObject({ code: 'INVALID_DEFINITION' });
    // Unconnected work in progress does not block a rehearsal.
    const loose = { ...(draft.definition as object), nodes: [...(draft.definition as { nodes: object[] }).nodes, { key: 'loose', stages: [{ key: 'main', kind: 'info', title: 'WIP', prompt: 'Not connected yet', durationMs: null }] }] };
    await authoring.save(author.id, draft.gameId, { expectedRevision: 0, definition: loose });
    const practice = await prisma.gameVersion.findUniqueOrThrow({ where: { id: await authoring.rehearsalVersion(author.id, draft.gameId, { expectedRevision: 1, startNodeKey: null, ...ids() }) } });
    expect((practice.definition as { nodes: { key: string }[] }).nodes.some(node => node.key === 'loose')).toBe(false);
    const stranger = await creator();
    await expect(authoring.rehearsalVersion(stranger.id, draft.gameId, { expectedRevision: 1, startNodeKey: null, ...ids() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('imports pasted games as drafts, keeps exported layouts, and refuses only text that is not JSON', async () => {
    const author = await creator(); const gameId = randomUUID();
    const text = '```json\n' + JSON.stringify({ title: 'From an AI', scenes: [{ id: 'hi', type: 'cutscene', title: 'Hi', text: 'Welcome' }, { id: 'q', type: 'quiz', question: 'Yes?', answers: ['Yes', 'No'], correct: 'Yes' }] }) + '\n```';
    const imported = await authoring.importGame(author.id, { gameId, text });
    expect(imported).toMatchObject({ gameId, title: 'From an AI', revision: 0, issueCount: 0, published: null });
    expect(await authoring.importGame(author.id, { gameId, text: '{"title":"Other","scenes":[]}' })).toMatchObject({ title: 'From an AI' });
    await expect(authoring.importGame(author.id, { gameId: randomUUID(), text: 'Sorry, I cannot help with that.' })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    const stranger = await creator();
    await expect(authoring.importGame(stranger.id, { gameId, text })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // A game exported from the editor comes back with its card positions.
    const exported = JSON.stringify({ ...(imported.definition as object), editor: { positions: { hi: { x: 0, y: 0 }, q: { x: 360, y: 24 } } } });
    const copy = await authoring.importGame(author.id, { gameId: randomUUID(), text: exported });
    expect(copy.definition).toMatchObject({ editor: { positions: { q: { x: 360, y: 24 } } } });
    expect(copy.issueCount).toBe(0);
  });
  it('lets the owner do all of this from the browser, and open a room for a published game', async () => {
    expect((await call('GET', '/api/host/games', undefined, '')).statusCode).toBe(401);
    const gameId = randomUUID();
    const created = await call('POST', '/api/host/games', { gameId, title: 'Browser game', startFrom: 'friday-night-chaos' });
    expect(created.statusCode).toBe(200);
    const draft = created.json().data;
    // Large drafts are accepted on this route only.
    const big = { ...draft.definition, nodes: draft.definition.nodes.map((node: { stages: object[] }, index: number) => index === 0 ? { ...node, stages: [{ ...node.stages[0], prompt: 'x'.repeat(1900) }, ...node.stages.slice(1)] } : node) };
    const saved = await call('PUT', `/api/host/games/${gameId}/draft`, { expectedRevision: 0, definition: big });
    expect(saved.statusCode).toBe(200);
    expect((await call('PUT', `/api/host/games/${gameId}/draft`, { expectedRevision: 0, definition: big })).statusCode).toBe(409);
    const unpublished = await call('POST', '/api/host/rooms', { gameId, sessionId: randomUUID(), commandId: randomUUID() });
    expect(unpublished.statusCode).toBe(404);
    expect((await call('POST', `/api/host/games/${gameId}/publish`, { expectedRevision: 1 })).json().data.published.number).toBe(1);
    const menu = (await call('GET', '/api/host')).json().data;
    expect(menu.myGames).toEqual(expect.arrayContaining([expect.objectContaining({ gameId, title: 'Browser game', published: expect.objectContaining({ number: 1 }) })]));
    // Built-in games the owner has played are not listed as their own games.
    expect(menu.myGames.every((game: { title: string }) => game.title !== 'Friday Night Chaos')).toBe(true);
    const sessionId = randomUUID();
    const room = await call('POST', '/api/host/rooms', { gameId, sessionId, commandId: randomUUID() });
    expect(room.statusCode).toBe(200);
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId }, include: { gameVersion: true } });
    expect(session.gameVersion).toMatchObject({ gameId, number: 1, definitionFormat: 2 });
    expect((await call('POST', '/api/host/rooms', { gameId, gameKey: 'timed-quiz', sessionId: randomUUID(), commandId: randomUUID() })).statusCode).toBe(400);
  });
});
