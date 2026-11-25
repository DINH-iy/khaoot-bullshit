import { defaultTeamColor, TeamCelebrationSchema, type SessionView } from '@party/contracts';

/** A stored celebration, or null (none, or one that no longer fits). */
const readCelebration = (value: unknown) => TeamCelebrationSchema.safeParse(value).data ?? null;
import type { StageRun } from '../../generated/prisma/client.js';
import type { Transaction } from '../model.js';
import { lineupStart, proposedStarts } from './carryover.js';
import { captainTally, electionLeader, LineupInfoSchema, readForming, readStagePlay, teamContext, type TeamContext } from './teams.js';

const revealedOnly = { OR: [{ stageRunId: null }, { stage: { revealedAt: { not: null } } }] };

/** What every screen shows about the current round's teams: a proposal while forming, else the lineup. */
export async function stageTeams(tx: Transaction, stage: StageRun, viewerPlayerId: string | null, context: TeamContext | null) {
  const forming = readForming(stage.presentation);
  if (forming) {
    const present = (await tx.sessionPlayer.findMany({ where: { sessionId: stage.sessionId, leftAt: null }, select: { id: true }, orderBy: { joinedAt: 'asc' } })).map(player => player.id);
    // Elected captains: the votes per teammate, and the captain so far (the host's pick, else the one leader).
    const elected = forming.answers === 'captain' && forming.captainPick === 'elected';
    const starts = await proposedStarts(tx, stage.sessionId, forming, present);
    const teams = forming.teams.map((team, index) => ({ index, name: team.name, color: team.color ?? defaultTeamColor(team.name, index), teamId: null, targetSize: team.targetSize, celebration: team.celebration ?? null,
      memberIds: present.filter(id => forming.assignment[id] === index), captainId: forming.captains[String(index)] ?? (elected ? electionLeader(forming, index, present) : null),
      ...(elected ? { captainVotes: captainTally(forming, index, present) } : {}), ...(starts ? { startMilli: starts[index]!.toString() } : {}) }));
    const own = viewerPlayerId ? forming.assignment[viewerPlayerId] : undefined;
    const ownVote = viewerPlayerId ? forming.captainVotes?.[viewerPlayerId] : undefined;
    return { forming: true, formation: forming.formation, colorsBy: forming.colorsBy ?? 'host', scope: forming.scope, ...(forming.scope === 'game' ? { carryover: forming.carryover } : {}), answers: forming.answers, points: forming.points, teams,
      ...(forming.answers === 'captain' ? { captainPick: elected ? 'elected' as const : 'assigned' as const } : {}),
      ...(elected && viewerPlayerId ? { ownCaptainVote: ownVote && own !== undefined && own !== null && forming.assignment[ownVote] === own ? ownVote : null } : {}),
      unassignedIds: present.filter(id => forming.assignment[id] === undefined || forming.assignment[id] === null), ownTeamIndex: own ?? null };
  }
  const play = readStagePlay(stage.presentation);
  if (!context || !play || !stage.lineupId) return null;
  const lineup = await tx.teamLineup.findUniqueOrThrow({ where: { id: stage.lineupId } });
  const info = LineupInfoSchema.parse(lineup.carryover);
  const rows = await tx.sessionTeam.findMany({ where: { id: { in: [...context.members.keys()] } } });
  const names = new Map(rows.map(team => [team.id, team.name])); const colors = new Map(rows.map(team => [team.id, team.color]));
  const celebrations = new Map(rows.map(team => [team.id, readCelebration(team.celebration)]));
  const order = info.order ?? [];
  const teams = [...context.members.entries()].sort(([a], [b]) => order.indexOf(names.get(a) ?? '') - order.indexOf(names.get(b) ?? '')).map(([teamId, memberIds], index) => ({
    index, name: names.get(teamId) ?? 'Team', color: colors.get(teamId) ?? defaultTeamColor(names.get(teamId) ?? '', index), teamId, targetSize: null, memberIds, captainId: context.captainOf.get(teamId) ?? null, celebration: celebrations.get(teamId) ?? null }));
  const ownTeam = viewerPlayerId ? context.teamOf.get(viewerPlayerId) : undefined;
  return { forming: false, formation: 'random' as const, scope: info.scope, answers: play.answers, points: play.points, teams,
    unassignedIds: [], ownTeamIndex: teams.find(team => team.teamId === ownTeam)?.index ?? null };
}

/**
 * A view without scores, for phones and the shared screen while scores are secret: no standings, and no
 * start totals of teams being made (they would give the team scores away).
 */
export function secretScores(view: SessionView): SessionView {
  const stage = view.stage?.teams ? { ...view.stage, teams: { ...view.stage.teams, teams: view.stage.teams.teams.map(({ startMilli: _start, ...team }) => team) } } : view.stage;
  return { ...view, standings: [], teamStandings: [], stage };
}

/** The key under which the viewer's answer is stored: their own, or their team's when a captain answers. */
export function answerKeyFor(context: TeamContext | null, playerId: string, own: string): string {
  if (!context || context.answers === 'everyone') return own;
  const teamId = context.teamOf.get(playerId); return teamId ? `team:${teamId}` : own;
}

/**
 * Totals for the game's current teams. Lineups chain back while their rule is
 * "keep"; the first lineup with another rule sets the start: "fresh" counts team
 * points from there, "members" also adds the current members' individual scores,
 * "redistribute" and "manual" add the start fixed on that lineup when it was confirmed.
 */
export async function teamStandings(tx: Transaction, sessionId: string, playerTotals: Map<string, bigint>) {
  const lineups = (await tx.teamLineup.findMany({ where: { sessionId }, orderBy: { number: 'asc' }, include: { members: true } }))
    .map(lineup => ({ ...lineup, info: LineupInfoSchema.safeParse(lineup.carryover) })).filter(lineup => lineup.info.success && lineup.info.data.scope === 'game');
  const current = lineups.at(-1); if (!current) return [];
  let index = lineups.length - 1;
  while (index > 0 && lineups[index]!.info.data!.carryover === 'keep') index--;
  const base = lineups[index]!;
  const teamIds = [...new Set(current.members.map(member => member.teamId))];
  const [teams, sums] = await Promise.all([
    tx.sessionTeam.findMany({ where: { id: { in: teamIds } } }),
    tx.scoreEntry.groupBy({ by: ['recipientTeamId'], where: { sessionId, recipientTeamId: { in: teamIds }, createdAt: { gte: base.createdAt }, ...revealedOnly }, _sum: { amountMilli: true }, orderBy: { recipientTeamId: 'asc' } }),
  ]);
  const earned = new Map(sums.map(row => [row.recipientTeamId!, row._sum.amountMilli ?? 0n])); const start = lineupStart(base);
  return teams.map(team => {
    const memberIds = current.members.filter(member => member.teamId === team.id).map(member => member.playerId);
    const fromMembers = base.info.data!.carryover === 'members' ? memberIds.reduce((total, id) => total + (playerTotals.get(id) ?? 0n), 0n) : 0n;
    return { teamId: team.id, name: team.name, color: team.color ?? defaultTeamColor(team.name, 0), memberIds, celebration: readCelebration(team.celebration), total: (earned.get(team.id) ?? 0n) + fromMembers + (start.get(team.name) ?? 0n) };
  }).sort((a, b) => a.total === b.total ? a.name.localeCompare(b.name) : a.total > b.total ? -1 : 1)
    .map(({ total, ...team }) => ({ ...team, amountMilli: total.toString() }));
}
export { teamContext };
