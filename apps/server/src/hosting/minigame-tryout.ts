import { HEAD_TO_HEAD_GAMES, isMinigameKey, MINIGAMES, SAMPLE_GRAPH_QUESTION, TEAM_MINIGAMES, TRYOUT_GAME_KEYS } from '@party/contracts';
import { parseDefinition } from '../game/definition.js';

/** A server-owned rehearsal with a selectable round for every hosted minigame. */
export const minigameTryout = parseDefinition({
  formatVersion: 2,
  title: 'Minigame Tryout',
  startNodeKey: TRYOUT_GAME_KEYS[0],
  autoRevealSeconds: 0,
  idleCloseMinutes: 30,
  nodes: TRYOUT_GAME_KEYS.map(game => ({
    key: game, stages: [isMinigameKey(game) ? {
      key: 'play', kind: 'minigame', game, prompt: game === 'draw-the-graph' ? SAMPLE_GRAPH_QUESTION : MINIGAMES[game].name,
      durationMs: MINIGAMES[game].defaultSeconds * 1000,
      ...(TEAM_MINIGAMES.includes(game) ? {
        play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'count', teams: 2 }, formation: 'random' } },
          answers: 'everyone', points: 'members' },
      } : {}),
    } : {
      key: 'play', kind: 'duel', prompt: HEAD_TO_HEAD_GAMES[game].name, durationMs: null, pick: 'random',
      betMilli: '0', contest: { kind: 'game', game },
    }],
  })),
  edges: TRYOUT_GAME_KEYS.slice(1).map((game, index) => ({ key: `next-${index}`, from: TRYOUT_GAME_KEYS[index], to: game })),
});
