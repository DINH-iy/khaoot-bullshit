import { HEAD_TO_HEAD_GAMES, MINIGAMES, TEAM_MINIGAMES, isHeadToHeadKey, type ArcadeGame, type ArcadeTeams } from '@party/contracts';
import { parseDefinition, type GameDefinition } from '../game/definition.js';

// The room's standard texts speak of a host; in the arcade the leader runs the round.
const LEADER_TEXTS = {
  'explain.waiting': 'Waiting for the leader to start…',
  'wait.forming': 'Answers open once the leader starts the round with these teams.',
  'minigame.paused': 'Paused. Waiting for the leader to continue…',
};

/** Whether the requested team mode fits the game. */
export const arcadeRoundFits = (game: ArcadeGame, teams: ArcadeTeams | null) => isHeadToHeadKey(game) ? teams === null : teams !== null || !TEAM_MINIGAMES.includes(game);

/**
 * An arcade minigame uses standard settings and
 * "how to play" (the round waits until the leader starts it, so every phone has
 * arrived and read it), alone or in teams made for this round.
 */
export function arcadeDefinition(game: ArcadeGame, teams: ArcadeTeams | null): GameDefinition {
  if (isHeadToHeadKey(game)) {
    const name = HEAD_TO_HEAD_GAMES[game].name;
    return parseDefinition({
      formatVersion: 2, title: `Arcade: ${name}`, startNodeKey: 'play', edges: [],
      nodes: [{ key: 'play', stages: [{
        key: 'play', kind: 'duel', prompt: name, pick: 'random', contest: { kind: 'game', game },
        durationMs: 15_000, betMilli: '1000',
      }] }],
    });
  }
  const info = MINIGAMES[game];
  return parseDefinition({
    formatVersion: 2, title: `Arcade: ${info.name}`, startNodeKey: 'play', presentation: { texts: LEADER_TEXTS },
    nodes: [{ key: 'play', stages: [{
      key: 'play', kind: 'minigame', prompt: info.name, game, durationMs: info.defaultSeconds * 1000, explain: {},
      ...(game === 'bus' ? { decide: 'vote', voteSeconds: 20 } : {}),
      ...(teams ? { play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'count', teams: teams.count }, formation: teams.formation } }, answers: 'everyone', points: 'members' } } : {}),
    }] }],
    edges: [],
  });
}
