import { MINIGAME_KEYS, MINIGAMES, SAMPLE_GRAPH_QUESTION, TEAM_MINIGAMES } from '@party/contracts';
import { parseDefinition } from '../game/definition.js';

/** A server-owned rehearsal with a selectable round for every hosted minigame. */
export const minigameTryout = parseDefinition({
  formatVersion: 2,
  title: 'Minigame Tryout',
  startNodeKey: MINIGAME_KEYS[0],
  autoRevealSeconds: 0,
  idleCloseMinutes: 30,
  nodes: MINIGAME_KEYS.map(game => ({
    key: game, stages: [{
      key: 'play', kind: 'minigame', game, prompt: game === 'draw-the-graph' ? SAMPLE_GRAPH_QUESTION : MINIGAMES[game].name,
      durationMs: MINIGAMES[game].defaultSeconds * 1000,
      ...(TEAM_MINIGAMES.includes(game) ? {
        play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'count', teams: 2 }, formation: 'random' } },
          answers: 'everyone', points: 'members' },
      } : {}),
    }],
  })),
  edges: MINIGAME_KEYS.slice(1).map((game, index) => ({ key: `next-${index}`, from: MINIGAME_KEYS[index], to: game })),
});
