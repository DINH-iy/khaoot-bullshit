import { describe, expect, it } from 'vitest';
import { GRAPH_SAMPLE_ID, GraphLibraryEntrySchema } from '@party/contracts';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { chooseGraph, graphLibrary, libraryIdOf } from '../../src/minigames/draw-the-graph/library.js';

const chart = (hidden: number[]) => ({ visible: [10, 20, 30], hidden, yLabel: 'Visitors' });
const scene = (key: string, graph: unknown, prompt = 'How many visitors?') => ({ key, kind: 'minigame', game: 'draw-the-graph', prompt, settings: { graph } });
// A stand-in for the database: two games (one a copy of the other's chart), and a broken chart that is skipped.
const drafts = [
  { game: { title: 'Pub quiz' }, definition: { nodes: [{ key: 'a', stages: [scene('one', chart([40, 50])), { key: 'q', kind: 'question' }] }] } },
  { game: { title: 'Copy of pub quiz' }, definition: { nodes: [{ key: 'b', stages: [scene('one', chart([40, 50]), 'Same chart')] }, { key: 'c', stages: [scene('two', chart([5, 1]), 'Falling?')] }] } },
  { game: { title: 'Broken' }, definition: { nodes: [{ key: 'd', stages: [scene('bad', { visible: [1] })] }] } },
];
const client = { gameDraft: { findMany: async () => drafts } } as unknown as PrismaClient;

describe('the graph library', () => {
  it('lists the sample and every valid chart once, without the hidden half', async () => {
    const library = await graphLibrary(client);
    expect(library.map(entry => entry.entry.question)).toEqual(['How many books did the fictional library lend each year?', 'How many visitors?', 'Falling?']);
    expect(library.map(entry => entry.entry.collection)).toEqual(['Built in', 'Pub quiz', 'Copy of pub quiz']);
    // What pickers get parses as an entry (strict: no hidden readings).
    for (const { entry } of library) expect(GraphLibraryEntrySchema.parse(entry)).toEqual(entry);
    expect(JSON.stringify(library.map(entry => entry.entry))).not.toContain('40');
  });

  it('plays the chart asked for, or a random one other than the one just played', async () => {
    const [, visitors, falling] = await graphLibrary(client);
    expect((await chooseGraph(client, falling!.entry.id)).graph?.hidden).toEqual([5, 1]);
    // Unknown (removed since): random instead.
    expect((await chooseGraph(client, 'f'.repeat(24), undefined, () => 0)).entry.id).toBe(GRAPH_SAMPLE_ID);
    // Playing again after the sample: never the sample again while others exist.
    for (const pick of [0, 1]) expect((await chooseGraph(client, undefined, libraryIdOf(undefined), () => pick)).entry.id).not.toBe(GRAPH_SAMPLE_ID);
    expect((await chooseGraph(client, undefined, libraryIdOf(visitors!.graph), () => 1)).entry.id).toBe(falling!.entry.id);
  });
});
