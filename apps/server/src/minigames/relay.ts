import type { MinigameSettings } from '@party/contracts';
import type { TeamContext } from '../game/teams.js';
import type { MinigameRun } from './rules.js';

/** Grace for a turn's strokes to arrive after its time is up (the phone sends them at the end). */
export const TURN_GRACE_MS = 4000;

/**
 * Pass the pencil: every team draws one picture. Turns run at the same time
 * in every team; in turn k a team's k-th drawer (in join order, starting over
 * in a small team) adds to the picture. Every team gets as many turns as the
 * biggest team has players, so a team of 2 against a team of 4 draws as long.
 * After the last turn everyone votes for the best picture of another team.
 */
export function relayPlan(context: TeamContext, settings: MinigameSettings<'relay-drawing'>, run: MinigameRun) {
  const teams = [...context.members.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([teamId, members]) => ({ teamId, members }));
  const turns = Math.max(1, ...teams.map(team => team.members.length));
  const turnMs = settings.secondsPerTurn * 1000; const start = Date.parse(run.startsAt);
  const voteAt = start + turns * turnMs;
  return {
    teams, turns, turnMs, voteAt,
    drawerOf: (teamId: string, turn: number) => { const members = teams.find(team => team.teamId === teamId)?.members ?? []; return members.length ? members[turn % members.length]! : null; },
    /** The turn running at `at`, or null before the start and once voting has begun. */
    turnAt: (at: number) => at < start || at >= voteAt ? null : Math.floor((at - start) / turnMs),
    turnWindow: (turn: number) => ({ from: start + turn * turnMs, until: start + (turn + 1) * turnMs }),
  };
}
