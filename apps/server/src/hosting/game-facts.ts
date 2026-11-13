import { resolveTheme } from '@party/contracts';
import type { GameDefinition } from '../game/definition.js';
import { allStages, maxPathStages } from '../game/graph.js';

type Feature = 'quiz' | 'order' | 'writing' | 'drawing' | 'uploads' | 'votes' | 'minigames' | 'challenges' | 'teams' | 'routes';
/**
 * What the host menu says about a game: what kinds of rounds it has, about
 * how long it takes, and the colours of its look (for its cover). Never
 * prompts, answers or anything else from inside the rounds.
 */
export function gameFacts(definition: GameDefinition): { features: Feature[]; minutes: number; colors: { from: string; to: string; accent: string } } {
  const stages = allStages(definition).map(entry => entry.stage); const found = new Set<Feature>();
  for (const stage of stages) {
    if (stage.kind === 'collect') found.add(({ choice: 'quiz', order: 'order', text: 'writing', drawing: 'drawing', media: 'uploads' } as const)[stage.input.kind]);
    if (stage.kind === 'vote') found.add('votes');
    if (stage.kind === 'minigame') { found.add('minigames'); if (stage.game === 'perfect-circle' || stage.game === 'relay-drawing') found.add('drawing'); }
    if (stage.kind === 'challenge') found.add('challenges');
    if (stage.kind === 'route') found.add('routes');
    if ('play' in stage && stage.play?.kind === 'teams') found.add('teams');
  }
  if (definition.play?.kind === 'teams') found.add('teams');
  // Rounds on the longest path: their timers (or a minute when untimed), plus time to read results.
  const average = stages.reduce((sum, stage) => sum + (stage.durationMs ?? 60_000) + 20_000, 0) / Math.max(1, stages.length);
  const minutes = Math.max(1, Math.round(maxPathStages(definition) * average / 60_000));
  const theme = resolveTheme(definition.presentation?.theme);
  return { features: [...found], minutes, colors: { from: theme.colors.background, to: theme.colors.answers[1] ?? theme.colors.accent, accent: theme.colors.accent } };
}
