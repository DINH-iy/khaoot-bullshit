import { GraphDataSchema, graphError, GraphHueSchema, GraphLineSchema, SAMPLE_GRAPH, type GraphData, type MinigameSettings } from '@party/contracts';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

export const GraphRunSchema = GraphDataSchema.extend({ seed: GraphHueSchema });

// Store the actual continuation with the run. Stock answers are never part of the browser catalog.
const continuations = [
  [56, 60, 61, 70, 76, 82, 91],
  [62, 70, 72, 66, 60, 52, 47],
  [51, 45, 41, 53, 72, 81, 75],
  [58, 56, 61, 53, 50, 66, 63],
] as const;

export function startGraph(settings: MinigameSettings<'draw-the-graph'>, random: (max: number) => number) {
  const graph: GraphData = settings.graph ?? { ...SAMPLE_GRAPH, hidden: [...continuations[random(continuations.length)]!] };
  return { ...graph, seed: random(360) };
}

/** Randomize the first hue each round and spread subsequent seats around the color wheel. */
export const graphHue = (seed: number, seat: number) => (seed + 137 * seat) % 360;

export const judgeGraph: ResultJudge = ({ run, value, at, started }) => {
  const parsed = GraphLineSchema.safeParse(value.graphLine);
  requireGame(at >= started && run.graph && parsed.success, 'INVALID_SUBMISSION');
  return { value: graphError(run.graph, parsed.data), graphLine: parsed.data };
};
