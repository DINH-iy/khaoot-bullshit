import { MINIGAMES, SHARED_SCREEN_MINIGAMES, TEAM_MINIGAMES, type ArcadeTeams, type MinigameKey } from '@party/contracts';
import { parseDefinition, type GameDefinition } from '../game/definition.js';

// The room's standard texts speak of a host; in the arcade the leader runs the round.
const LEADER_TEXTS = {
  'explain.waiting': 'Waiting for the leader to start…',
  'wait.forming': 'Answers open once the leader starts the round with these teams.',
  'minigame.paused': 'Paused. Waiting for the leader to continue…',
};

/** Whether a minigame can be played in an arcade round with these teams (team-only games need teams). */
export const arcadeRoundFits = (game: MinigameKey, teams: ArcadeTeams | null) => !SHARED_SCREEN_MINIGAMES.includes(game)
  && (teams !== null || !TEAM_MINIGAMES.includes(game));

/**
 * An arcade round as a game: one minigame scene with its standard settings and
 * "how to play" (the round waits until the leader starts it, so every phone has
 * arrived and read it), alone or in teams made for this round.
 */
export function arcadeDefinition(game: MinigameKey, teams: ArcadeTeams | null): GameDefinition {
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
