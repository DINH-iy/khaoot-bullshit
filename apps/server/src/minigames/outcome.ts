import { AwardMilliSchema, MinigameValueSchema, SubmissionValueSchema, type MinigameKey, type MinigameSettings } from '@party/contracts';
import { route, type Award, type TeamContext } from '../game/teams/teams.js';
import { places, rankValue, teamValue } from './rules.js';

export const DEFAULT_PLACEMENT_MILLI = ['10000', '6000', '3000'];
export interface MinigameRules { game: MinigameKey; settings: MinigameSettings; placementMilli: string[]; teamResult: 'best' | 'average' | 'total' }
interface Row { playerId: string | null; teamId: string | null; value: unknown }
export interface Outcome {
  /** Team rows first (in a team round), each with the team's result; then every player's own result. */
  entries: { playerId: string | null; teamId: string | null; value: number | null; place: number | null; stroke?: number[] }[];
  awards: Award[];
}

/**
 * Everyone's place and the placement points. Equal results share a place and
 * its points. In a team round the teams are ranked by their combined result
 * and the points follow the round's team points rule.
 */
export function minigameOutcome(rules: MinigameRules, rows: Row[], context: TeamContext | null, stageRunId: string): Outcome {
  const results = rows.map(row => { const value = SubmissionValueSchema.safeParse(row.value); const parsed = value.success ? MinigameValueSchema.safeParse(value.data) : null;
    return parsed?.success ? { ...row, result: parsed.data } : null; }).filter(row => row !== null);
  const raw = (result: { value: number; early?: true | undefined }) => result.early ? null : result.value;
  const ranked = rules.game !== 'lucky-doors';
  if (rules.game === 'relay-drawing') {
    // Pass the pencil: teams are ranked by the votes their picture received.
    if (!context) return { entries: [], awards: [] };
    const tallies = [...context.members.keys()].sort().map(teamId => ({ teamId, votes: results.filter(row => row.result.teamId === teamId).length }));
    const placed = places(tallies, tally => -tally.votes);
    const pointsOf = (place: number | undefined) => place === undefined ? 0n : BigInt(AwardMilliSchema.parse(rules.placementMilli[place - 1] ?? '0'));
    return { entries: tallies.map(tally => ({ playerId: null, teamId: tally.teamId, value: tally.votes, place: placed.get(tally) ?? null })).sort((a, b) => (a.place ?? 999) - (b.place ?? 999)),
      awards: tallies.flatMap(tally => route({ amountMilli: pointsOf(placed.get(tally)), stageRunId, awardKey: `minigame:${stageRunId}:team:${tally.teamId}`, reason: 'Minigame place' }, { teamId: tally.teamId }, context)) };
  }
  const pointsFor = (place: number | undefined) => place === undefined ? 0n : BigInt(AwardMilliSchema.parse(rules.placementMilli[place - 1] ?? '0'));
  if (rules.game === 'bus' && context) {
    // Drive the bus: each team's sips plus the last round's sips for every other team's rainbow; fewest sips win.
    const lastSips = (rules.settings as { sips: number[]; rainbow?: boolean }).sips[3] ?? 0;
    const teams = [...context.members.keys()].map(teamId => ({ teamId, row: results.find(row => row.teamId === teamId) }));
    const rainbows = teams.filter(team => team.row?.result.rainbow).length;
    const totals = teams.map(team => ({ ...team, total: team.row ? team.row.result.value + (rainbows - (team.row.result.rainbow ? 1 : 0)) * lastSips : null }));
    const placed = places(totals, team => team.total);
    const entries = totals.map(team => ({ playerId: null, teamId: team.teamId, value: team.total, place: placed.get(team) ?? null })).sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
    return { entries, awards: totals.flatMap(team => route({ amountMilli: pointsFor(placed.get(team)), stageRunId, awardKey: `minigame:${stageRunId}:team:${team.teamId}`, reason: 'Minigame place' }, { teamId: team.teamId }, context)) };
  }
  if (rules.game === 'majority') {
    // Left or right: everyone (or every team) on the side most chose shares 1st place and its points; a tie: nobody wins.
    const sides = context ? [...context.members.keys()].map(teamId => ({ playerId: null, teamId, row: results.find(row => row.teamId === teamId) }))
      : results.map(row => ({ playerId: row.playerId, teamId: null, row }));
    const left = sides.filter(side => side.row?.result.value === 0).length; const right = sides.filter(side => side.row?.result.value === 1).length;
    const winner = left === right ? null : left > right ? 0 : 1;
    const entries = sides.map(side => ({ playerId: side.playerId, teamId: side.teamId, value: side.row ? side.row.result.value : null, place: side.row && side.row.result.value === winner ? 1 : null }))
      .sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
    const awards = entries.filter(entry => entry.place === 1).flatMap(entry => route({ amountMilli: pointsFor(1), stageRunId, awardKey: `minigame:${stageRunId}:${entry.teamId ? `team:${entry.teamId}` : entry.playerId}`, reason: 'Minigame place' },
      entry.teamId ? { teamId: entry.teamId } : { playerId: entry.playerId! }, context));
    return { entries, awards };
  }
  if (!context) {
    const placed = ranked ? places(results, row => rankValue(rules.game, rules.settings, row.result)) : new Map();
    const entries = results.map(row => ({ playerId: row.playerId, teamId: null, value: raw(row.result), place: placed.get(row) ?? null, ...(row.result.stroke ? { stroke: row.result.stroke } : {}) }))
      .sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
    const awards = results.flatMap(row => row.playerId ? route({ amountMilli: pointsFor(placed.get(row)), stageRunId, awardKey: `minigame:${stageRunId}:${row.playerId}`, reason: 'Minigame place' }, { playerId: row.playerId }, null) : []);
    return { entries, awards };
  }
  // Team rows: a captain's result is the team's; otherwise the members' results combine.
  const teamIds = [...context.members.keys()];
  const teams = teamIds.map(teamId => {
    const own = results.filter(row => row.teamId === teamId || (row.playerId && context.teamOf.get(row.playerId) === teamId));
    const values = own.map(row => rankValue(rules.game, rules.settings, row.result)).filter(value => value !== null);
    return { teamId, score: ranked ? teamValue(rules.game, rules.teamResult, values) : null, own };
  });
  const placed = places(teams, team => team.score);
  const magnitude = (score: number | null) => score === null ? null : Math.abs(score);
  const entries = [
    ...teams.map(team => ({ playerId: null, teamId: team.teamId, value: magnitude(team.score), place: placed.get(team) ?? null })).sort((a, b) => (a.place ?? 999) - (b.place ?? 999)),
    ...results.map(row => ({ playerId: row.playerId, teamId: row.teamId ?? (row.playerId ? context.teamOf.get(row.playerId) ?? null : null), value: raw(row.result), place: null, ...(row.result.stroke ? { stroke: row.result.stroke } : {}) })),
  ];
  const awards = teams.flatMap(team => route({ amountMilli: pointsFor(placed.get(team)), stageRunId, awardKey: `minigame:${stageRunId}:team:${team.teamId}`, reason: 'Minigame place' }, { teamId: team.teamId }, context));
  return { entries, awards };
}
