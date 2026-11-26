import { StoredGraphsSchema, type StoredGraph } from '@party/contracts';
import { translate } from '../../i18n/texts.js';
import { GRAPH_TEXTS } from '../../minigames/draw-the-graph/graph.text.js';
import type { Definition } from '../model.js';
import type { GraphImport } from '../scene/fields/graph-data-import.js';

export function storedGraphs(definition: Definition | undefined) {
  return StoredGraphsSchema.safeParse(definition?.graphLibrary).data ?? [];
}

export function addStoredGraphs(definition: Definition, imports: GraphImport[]): Definition {
  if (!imports.length) return definition;
  const added: StoredGraph[] = imports.map(({ graph, question }) => ({
    key: `graph-${crypto.randomUUID()}`, question: question || graph.yLabel || translate(GRAPH_TEXTS, 'trendQuestion'), graph,
  }));
  return { ...definition, graphLibrary: [...storedGraphs(definition), ...added] };
}
