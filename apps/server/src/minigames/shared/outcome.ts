import { AwardMilliSchema, COIN_SIDES, type MinigameScoring, type MinigameTiebreak, isSharedPrediction, MinigameValueSchema, rouletteMatches, rouletteNet, rouletteStake, SubmissionValueSchema, type MinigameKey, type MinigameSettings, type RouletteBets } from '@party/contracts';
import { route, type Award, type TeamContext } from '../../game/teams/teams.js';
import { places, rankValue, teamValue, type MinigameRun } from './rules.js';
import { closenessPoints } from './closeness.js';

export const DEFAULT_PLACEMENT_MILLI = ['10000', '6000', '3000'];
export interface MinigameRules { game: MinigameKey; settings: MinigameSettings; placementMilli: string[]; teamResult: 'best' | 'average' | 'total'; tiebreak: MinigameTiebreak; scoring?: MinigameScoring | null }
interface Row { playerId: string | null; teamId: string | null; value: unknown; receivedAt?: Date }
export interface Outcome {
  /** Team rows first (in a team round), each with the team's result; then every player's own result. */
  entries: { playerId: string | null; teamId: string | null; value: number | null; place: number | null; stroke?: number[]; cut?: number; angle?: number; dotGuess?: number; graphLine?: number[]; bets?: RouletteBets }[];
  awards: Award[];
}

/**
 * Everyone's place and the placement points. Equal results share a place and
 * its points after any tiebreak. In a team round the teams are ranked by their combined result
 * and the points follow the round's team points rule.
 */
export function minigameOutcome(rules: MinigameRules, rows: Row[], context: TeamContext | null, stageRunId: string, run?: MinigameRun | null): Outcome {
  const results = rows.map(row => { const value = SubmissionValueSchema.safeParse(row.value); const parsed = value.success ? MinigameValueSchema.safeParse(value.data) : null;
    return parsed?.success ? { ...row, result: parsed.data } : null; }).filter(row => row !== null);
  const raw = (result: { value: number; early?: true | undefined }) => result.early ? null : result.value;
  const details = ({ stroke, cut, angle, dotGuess, graphLine }: ReturnType<typeof MinigameValueSchema.parse>) => ({
    ...(stroke ? { stroke } : {}), ...(cut === undefined ? {} : { cut }), ...(angle === undefined ? {} : { angle }),
    ...(dotGuess === undefined ? {} : { dotGuess }), ...(graphLine ? { graphLine } : {}),
  });
  const ranked = rules.game !== 'lucky-doors';
  const timedTiebreak = rules.tiebreak === 'faster';
  const submittedAt = (row: Row) => row.receivedAt?.getTime() ?? 0;
  if (rules.game === 'relay-drawing') {
    // Pass the pencil: teams are ranked by the votes their picture received.
    if (!context) return { entries: [], awards: [] };
    const animation = (rules.settings as MinigameSettings<'relay-drawing'>).animation;
    const tallies = [...context.members.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([teamId, members]) => ({
      teamId,
      votes: animation
        ? Math.round(100 * results.filter(row => (row.teamId ?? (row.playerId ? context.teamOf.get(row.playerId) : null)) === teamId && row.result.value === 1).length / Math.max(1, context.answers === 'captain' ? 1 : members.length))
        : results.filter(row => row.result.teamId === teamId).length,
    }));
    const placed = places(tallies, tally => animation && tally.votes === 0 ? null : -tally.votes);
    const pointsOf = (place: number | undefined) => place === undefined ? 0n : BigInt(AwardMilliSchema.parse(rules.placementMilli[place - 1] ?? '0'));
    return { entries: tallies.map(tally => ({ playerId: null, teamId: tally.teamId, value: tally.votes, place: placed.get(tally) ?? null })).sort((a, b) => (a.place ?? 999) - (b.place ?? 999)),
      awards: tallies.flatMap(tally => route({ amountMilli: pointsOf(placed.get(tally)), stageRunId, awardKey: `minigame:${stageRunId}:team:${tally.teamId}`, reason: 'Minigame place' }, { teamId: tally.teamId }, context)) };
  }
  const pointsFor = (place: number | undefined) => place === undefined ? 0n : BigInt(AwardMilliSchema.parse(rules.placementMilli[place - 1] ?? '0'));
  if (rules.game === 'red-or-black-roulette') {
    // Roulette: each player wins or loses what their bets make on the shared spin (see rouletteNet). A player with a winning bet is marked first.
    const pocket = run?.roulette;
    const players = results.flatMap(row => {
      if (!row.playerId) return [];
      // Results from before the betting table were a free pick of red (0) or black (1).
      const bets: RouletteBets | undefined = row.result.bets ?? (row.result.value === 0 || row.result.value === 1 ? [{ guess: row.result.value === 0 ? 'red' : 'black', bet: 0 }] : undefined);
      return bets ? [{ playerId: row.playerId, bets }] : [];
    }).map(({ playerId, bets }) => ({ playerId, bets, stake: rouletteStake(bets),
      hit: pocket !== undefined && bets.some(entry => rouletteMatches(pocket, entry.guess)), net: pocket === undefined ? 0 : rouletteNet(pocket, bets) }));
    const entries = players.map(player => ({ playerId: player.playerId, teamId: null, value: player.stake, place: player.hit ? 1 : null, bets: player.bets }))
      .sort((a, b) => (a.place ?? 2) - (b.place ?? 2));
    const awards = players.flatMap(player => route({ amountMilli: BigInt(player.net) * 1000n, stageRunId,
      awardKey: `minigame:${stageRunId}:${player.playerId}`, reason: player.net > 0 ? 'Roulette win' : 'Roulette loss' }, { playerId: player.playerId }, null));
    return { entries, awards };
  }
  if (isSharedPrediction(rules.game)) {
    const winningPick = COIN_SIDES.findIndex(side => side === run?.coin);
    const entries = results.filter(row => row.playerId && (row.result.value === 0 || row.result.value === 1)).map(row => ({
      playerId: row.playerId!, teamId: null, value: row.result.value, place: row.result.value === winningPick ? 1 : null,
    })).sort((a, b) => (a.place ?? 2) - (b.place ?? 2));
    const awards = entries.filter(entry => entry.place === 1).flatMap(entry => route({ amountMilli: pointsFor(1), stageRunId,
      awardKey: `minigame:${stageRunId}:${entry.playerId}`, reason: 'Correct coin guess' }, { playerId: entry.playerId }, null));
    return { entries, awards };
  }
  if (rules.game === 'undercover') {
    // Undercover: everyone on the winning side shares 1st place and its points; the value is each player's role.
    const entries = results.filter(row => row.playerId).map(row => ({ playerId: row.playerId, teamId: null, value: row.result.value, place: row.result.won ? 1 : null }))
      .sort((a, b) => (a.place ?? 2) - (b.place ?? 2));
    const awards = entries.filter(entry => entry.place === 1).flatMap(entry => route({ amountMilli: pointsFor(1), stageRunId, awardKey: `minigame:${stageRunId}:${entry.playerId}`, reason: 'Undercover win' }, { playerId: entry.playerId }, null));
    return { entries, awards };
  }
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
  // Closeness scoring pays by the result itself; places still order the results (and name the round's winner).
  const earned = (place: number | undefined, score: number | null) => rules.scoring ? closenessPoints(rules.game, rules.scoring, score) : pointsFor(place);
  const reason = rules.scoring ? 'Minigame closeness' : 'Minigame place';
  if (!context) {
    const score = (row: typeof results[number]) => rankValue(rules.game, rules.settings, row.result);
    const placed = ranked ? places(results, score, timedTiebreak ? submittedAt : undefined) : new Map();
    const entries = results.map(row => ({ playerId: row.playerId, teamId: null, value: raw(row.result), place: placed.get(row) ?? null, ...details(row.result) }))
      .sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
    const awards = results.flatMap(row => row.playerId ? route({ amountMilli: earned(placed.get(row), score(row)), stageRunId, awardKey: `minigame:${stageRunId}:${row.playerId}`, reason }, { playerId: row.playerId }, null) : []);
    return { entries, awards };
  }
  // Team rows: a captain's result is the team's; otherwise the members' results combine.
  const teamIds = [...context.members.keys()];
  const teams = teamIds.map(teamId => {
    const own = results.filter(row => row.teamId === teamId || (row.playerId && context.teamOf.get(row.playerId) === teamId));
    const scored = own.map(row => ({ row, value: rankValue(rules.game, rules.settings, row.result) })).filter(entry => entry.value !== null);
    const score = ranked ? teamValue(rules.game, rules.teamResult, scored.map(entry => entry.value!)) : null;
    let time = 0;
    if (timedTiebreak && score !== null) {
      // Best uses the first guess that achieved the score. Average uses the last guess it includes.
      time = rules.teamResult === 'best'
        ? Math.min(...scored.filter(entry => entry.value === score).map(entry => submittedAt(entry.row)))
        : Math.max(...scored.map(entry => submittedAt(entry.row)));
    }
    // A captain's answer is the team's own row (playerId null): its details (stroke, cut, angle…) go on the team row.
    const captainRow = own.find(row => !row.playerId && row.teamId === teamId);
    return { teamId, score, time, captainRow };
  });
  const placed = places(teams, team => team.score, timedTiebreak ? team => team.time : undefined);
  const magnitude = (score: number | null) => score === null ? null : Math.abs(score);
  const entries = [
    ...teams.map(team => ({ playerId: null, teamId: team.teamId, value: team.captainRow ? raw(team.captainRow.result) : magnitude(team.score), place: placed.get(team) ?? null,
      ...(team.captainRow ? details(team.captainRow.result) : {}) })).sort((a, b) => (a.place ?? 999) - (b.place ?? 999)),
    // Each player's own result; a captain's answer is already the team's row.
    ...results.filter(row => row.playerId).map(row => ({ playerId: row.playerId, teamId: row.teamId ?? (row.playerId ? context.teamOf.get(row.playerId) ?? null : null), value: raw(row.result), place: null, ...details(row.result) })),
  ];
  // A team's closeness points come from its combined result, like its place.
  const awards = teams.flatMap(team => route({ amountMilli: earned(placed.get(team), team.score), stageRunId, awardKey: `minigame:${stageRunId}:team:${team.teamId}`, reason }, { teamId: team.teamId }, context));
  return { entries, awards };
}
