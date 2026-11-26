import { createHash, randomInt } from 'node:crypto';
import { GRAPH_SAMPLE_ID, authoredGraphs, SAMPLE_GRAPH, SAMPLE_GRAPH_QUESTION, type GraphData, type GraphLibraryEntry } from '@party/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { canonicalJson } from '../../game/definition.js';

// The graph library: every Draw the Graph chart authors have put in a game they work on (games with a draft,
// not archived; a rehearsal's hidden copy has no draft), each game a "collection", and the built-in sample.
// Adding a graph scene to any game adds to it. The hidden half stays here: pickers only get the entry.

/** A library chart with its answer, for the server only. `graph` is absent for the sample (it picks a stock continuation). */
export interface LibraryGraph { entry: GraphLibraryEntry; graph?: GraphData }

const SAMPLE: LibraryGraph = { entry: { id: GRAPH_SAMPLE_ID, collection: 'Built in', question: SAMPLE_GRAPH_QUESTION,
  ...(SAMPLE_GRAPH.startLabel ? { startLabel: SAMPLE_GRAPH.startLabel } : {}), ...(SAMPLE_GRAPH.endLabel ? { endLabel: SAMPLE_GRAPH.endLabel } : {}), ...(SAMPLE_GRAPH.yLabel ? { yLabel: SAMPLE_GRAPH.yLabel } : {}) } };

/** A chart's id: stable for the same chart, whichever game or scene it is in. */
const graphId = (graph: GraphData) => createHash('sha256').update(canonicalJson(graph)).digest('hex').slice(0, 24);

export async function graphLibrary(client: PrismaClient): Promise<LibraryGraph[]> {
  const drafts = await client.gameDraft.findMany({ where: { game: { archivedAt: null } }, select: { definition: true, game: { select: { title: true } } }, orderBy: { game: { title: 'asc' } } });
  const found = new Map<string, LibraryGraph>();
  for (const draft of drafts) for (const { graph, question, inDraw } of authoredGraphs(draft.definition)) {
    if (inDraw) continue;
    const id = graphId(graph);
    if (found.has(id)) continue;
    found.set(id, { graph, entry: { id, collection: draft.game.title, question: question || 'Draw the Graph',
      ...(graph.startLabel ? { startLabel: graph.startLabel } : {}), ...(graph.endLabel ? { endLabel: graph.endLabel } : {}), ...(graph.yLabel ? { yLabel: graph.yLabel } : {}) } });
  }
  return [SAMPLE, ...found.values()];
}

/** The library id of the chart a round played: its own, or the sample's when it used the stock sample. */
export const libraryIdOf = (graph: GraphData | undefined) => graph ? graphId(graph) : GRAPH_SAMPLE_ID;

/**
 * The chart for a round: the one asked for, or (none asked, or no longer in the library) a random one.
 * `avoid`: a chart to skip when another exists, so playing again brings a different graph.
 */
export async function chooseGraph(client: PrismaClient, wanted: string | undefined, avoid?: string, random: (max: number) => number = randomInt): Promise<LibraryGraph> {
  const library = await graphLibrary(client);
  const asked = wanted && library.find(entry => entry.entry.id === wanted);
  if (asked) return asked;
  const others = library.filter(entry => entry.entry.id !== avoid);
  const pool = others.length ? others : library;
  return pool[random(pool.length)]!;
}
