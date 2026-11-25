import { CAPTAIN_PICKS, DEFAULT_TEAM_NAMES, defaultTeamColor, TEAM_SWATCHES, TeamColorSchema } from '@party/contracts';
export { DEFAULT_TEAM_NAMES };
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { GameIdSchema } from '@party/contracts';
import { GameError, requireGame } from '../errors.js';
import { teamCount, type Formation, type Play } from '../definition.js';
import { skillTeams, teamRatings } from './skill.js';
import type { Transaction } from '../model.js';

// Teams. A lineup is an immutable record of who was in which team; a team is
// identified by its name within the room, so points given to "Red" always count
// for "Red". Game teams persist across rounds; round teams apply to one round.
// Every new lineup starts as a proposal the host can change and must confirm.
export type TeamPlay = Extract<Play, { kind: 'teams' }>;
export type Carryover = 'keep' | 'fresh' | 'members';

const FormingSchema = z.object({
  scope: z.enum(['game', 'round']), carryover: z.enum(['keep', 'fresh', 'members']), formation: z.enum(['random', 'skill', 'host', 'players']),
  answers: z.enum(['everyone', 'captain']), points: z.enum(['team', 'members', 'both']),
  // `color` (absent in proposals made before team colours): the team's colour. `colorsBy`: who may change it.
  teams: z.array(z.object({ name: z.string().min(1).max(30), targetSize: z.number().int().min(1).nullable(), color: TeamColorSchema.optional() }).strict()).min(1).max(12),
  colorsBy: z.enum(['host', 'teams']).optional(),
  // Player ID -> team index, or null for sitting out. Players not listed are unassigned.
  assignment: z.record(GameIdSchema, z.number().int().min(0).max(11).nullable()),
  captains: z.record(z.string().regex(/^\d{1,2}$/), GameIdSchema),
  // Elected captains: voter -> the teammate they vote for. A vote counts only while both are in the same team.
  captainPick: z.enum(CAPTAIN_PICKS).optional(), captainVotes: z.record(GameIdSchema, GameIdSchema).optional(),
}).strict();
export type Forming = z.infer<typeof FormingSchema>;
// `order` keeps the teams in the order the game defines them (Red before Blue).
export const LineupInfoSchema = z.object({ formatVersion: z.literal(1), scope: z.enum(['game', 'round']), carryover: z.enum(['keep', 'fresh', 'members']), order: z.array(z.string().min(1).max(60)).max(12).optional() }).strict();
const StagePlaySchema = z.object({ answers: z.enum(['everyone', 'captain']), points: z.enum(['team', 'members', 'both']) }).strict();

export const readForming = (presentation: unknown): Forming | null => {
  const value = (presentation as { forming?: unknown } | null)?.forming;
  if (value === undefined) return null;
  const parsed = FormingSchema.safeParse(value); requireGame(parsed.success, 'INVALID_STATE'); return parsed.data;
};
/** How a confirmed team round answers and scores, kept on the stage run. */
export const readStagePlay = (presentation: unknown) => { const parsed = StagePlaySchema.safeParse((presentation as { teamPlay?: unknown } | null)?.teamPlay); return parsed.success ? parsed.data : null; };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) { const other = randomInt(index + 1); [copy[index], copy[other]] = [copy[other]!, copy[index]!]; }
  return copy;
}
const targets = (form: Formation) => form.split.kind === 'count' ? Array.from({ length: form.split.teams }, () => null) : form.split.sizes.map(size => size === 'rest' ? null : size);

/** Random teams: balanced for a team count; fixed sizes first, then "the rest" (others sit out when no team takes the rest). */
/** The English name of each team swatch: a team named after its colour follows a new colour's name. */
const SWATCH_NAMES: Record<string, string> = { '#e8505b': 'Red', '#36a2eb': 'Blue', '#5fb84a': 'Green', '#e6b422': 'Yellow', '#8e5be8': 'Purple', '#f28c28': 'Orange', '#f07aa8': 'Pink', '#2bb3a3': 'Teal', '#8d6e63': 'Brown', '#9aa0ad': 'Grey', '#4f6ae0': 'Indigo', '#c2185b': 'Raspberry' };
/** Every team with a colour (proposals made before team colours get theirs from their name or place). */
const withColors = (teams: Forming['teams']) => teams.map((team, index) => ({ ...team, color: team.color ?? defaultTeamColor(team.name, index) }));
/** Two teams never share a colour: a repeat takes the first swatch nobody uses. */
function distinctColors(teams: (Forming['teams'][number] & { color: string })[]) {
  const used = new Set<string>();
  return teams.map(team => {
    const color = used.has(team.color) ? TEAM_SWATCHES.find(swatch => !used.has(swatch) && !teams.some(other => other.color === swatch)) ?? team.color : team.color;
    used.add(color); return { ...team, color };
  });
}
export function randomAssignment(teams: Forming['teams'], playerIds: string[], balanced: boolean): Forming['assignment'] {
  const order = shuffle(playerIds); const assignment: Forming['assignment'] = {};
  if (balanced) { order.forEach((id, index) => { assignment[id] = index % teams.length; }); return assignment; }
  let next = 0;
  teams.forEach((team, index) => { if (team.targetSize !== null) for (let count = 0; count < team.targetSize && next < order.length; count++) assignment[order[next++]!] = index; });
  const rest = teams.findIndex(team => team.targetSize === null);
  while (next < order.length) assignment[order[next++]!] = rest >= 0 ? rest : null;
  return assignment;
}

async function bySkill(tx: Transaction, sessionId: string, teams: Forming['teams'], playerIds: string[]) {
  const proposal = randomAssignment(teams, playerIds, teams.every(team => team.targetSize === null));
  const sizes = teams.map((_, index) => Object.values(proposal).filter(team => team === index).length);
  return skillTeams(shuffle(playerIds), sizes, await teamRatings(tx, sessionId, playerIds));
}

export async function startForming(tx: Transaction, sessionId: string, form: Formation, play: TeamPlay, scope: 'game' | 'round', carryover: Carryover, playerIds: string[]): Promise<Forming> {
  const names = form.names ?? DEFAULT_TEAM_NAMES;
  const teams = distinctColors(targets(form).slice(0, teamCount(form)).map((targetSize, index) => ({ name: names[index]!, targetSize, color: defaultTeamColor(names[index]!, index) })));
  return { scope, carryover, formation: form.formation, answers: play.answers, points: play.points, teams, colorsBy: form.colors ?? 'host',
    assignment: form.formation === 'skill' ? await bySkill(tx, sessionId, teams, playerIds) : form.formation === 'random' ? randomAssignment(teams, playerIds, form.split.kind === 'count') : {}, captains: {},
    ...(form.captainPick === 'elected' ? { captainPick: 'elected' as const, captainVotes: {} } : {}) };
}

/** The valid votes for a team's captain: voter and teammate both present in that team. Most votes first. */
export function captainTally(forming: Forming, index: number, presentIds: string[]): { playerId: string; count: number }[] {
  if (forming.captainPick !== 'elected') return [];
  const inTeam = new Set(presentIds.filter(id => forming.assignment[id] === index));
  const counts = new Map<string, number>();
  for (const [voter, candidate] of Object.entries(forming.captainVotes ?? {})) if (inTeam.has(voter) && inTeam.has(candidate)) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  return [...counts].map(([playerId, count]) => ({ playerId, count })).sort((a, b) => b.count - a.count || presentIds.indexOf(a.playerId) - presentIds.indexOf(b.playerId));
}
/** An elected team's captain so far: the one teammate with the most votes (none on a tie or without votes). */
export function electionLeader(forming: Forming, index: number, presentIds: string[]): string | null {
  const [first, second] = captainTally(forming, index, presentIds);
  return first && (!second || second.count < first.count) ? first.playerId : null;
}
/** Votes without the given player's own vote and the votes for them (they moved team). */
const withoutVotes = (votes: Forming['captainVotes'], playerId: string) => votes && Object.fromEntries(Object.entries(votes).filter(([voter, candidate]) => voter !== playerId && candidate !== playerId));

/** The current game lineup (latest lineup made for the whole game), if any. */
export async function currentGameLineup(tx: Transaction, sessionId: string) {
  const lineups = await tx.teamLineup.findMany({ where: { sessionId }, orderBy: { number: 'desc' }, include: { members: true } });
  return lineups.find(lineup => LineupInfoSchema.safeParse(lineup.carryover).success && LineupInfoSchema.parse(lineup.carryover).scope === 'game') ?? null;
}

async function createLineup(tx: Transaction, sessionId: string, info: z.infer<typeof LineupInfoSchema>, teams: { name: string; color?: string; members: string[]; captain: string | null }[]) {
  const last = await tx.teamLineup.findFirst({ where: { sessionId }, orderBy: { number: 'desc' }, select: { number: true } });
  const lineup = await tx.teamLineup.create({ data: { sessionId, number: (last?.number ?? 0) + 1, carryover: { ...info, order: teams.map(team => team.name) } } });
  for (const team of teams) {
    // A team made again under its name keeps its row; a newly picked colour replaces the old one.
    const row = await tx.sessionTeam.upsert({ where: { sessionId_name: { sessionId, name: team.name } }, create: { sessionId, name: team.name, ...(team.color ? { color: team.color } : {}) }, update: team.color ? { color: team.color } : {} });
    await tx.teamMember.createMany({ data: team.members.map(playerId => ({ sessionId, lineupId: lineup.id, teamId: row.id, playerId, isCaptain: playerId === team.captain })) });
  }
  return lineup;
}

/**
 * Reuses the game lineup for another round. Players who joined since are put in
 * the smallest team (the host can re-form teams later); that makes a new lineup
 * version whose scores carry over unchanged.
 */
export async function gameLineupForRound(tx: Transaction, sessionId: string, presentIds: string[]) {
  const lineup = await currentGameLineup(tx, sessionId); if (!lineup) return null;
  const known = new Set(lineup.members.map(member => member.playerId));
  const late = presentIds.filter(id => !known.has(id));
  if (!late.length) return lineup;
  const order = LineupInfoSchema.parse(lineup.carryover).order ?? [];
  const teams = (await tx.sessionTeam.findMany({ where: { id: { in: [...new Set(lineup.members.map(member => member.teamId))] } } })).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const groups = teams.map(team => ({ name: team.name, members: lineup.members.filter(member => member.teamId === team.id).map(member => member.playerId), captain: lineup.members.find(member => member.teamId === team.id && member.isCaptain)?.playerId ?? null }));
  for (const id of late) groups.reduce((smallest, group) => group.members.filter(m => presentIds.includes(m)).length < smallest.members.filter(m => presentIds.includes(m)).length ? group : smallest).members.push(id);
  const created = await createLineup(tx, sessionId, { formatVersion: 1, scope: 'game', carryover: 'keep' }, groups);
  return tx.teamLineup.findUniqueOrThrow({ where: { id: created.id }, include: { members: true } });
}

/** Applies a team-forming command to the proposal; returns the updated proposal, or the confirmed lineup. */
export async function formingCommand(tx: Transaction, sessionId: string, forming: Forming, command: { type: string; playerId?: string; teamIndex?: number | null; method?: 'skill'; color?: string; pick?: string }, actorPlayerId: string | null, presentIds: string[]) {
  const present = new Set(presentIds);
  const size = (index: number) => Object.entries(forming.assignment).filter(([id, team]) => team === index && present.has(id)).length;
  // More or fewer teams than the game proposed: a new team gets the next free colour name; at least one team stays.
  if (command.type === 'teams.add') {
    requireGame(forming.teams.length < 12, 'INVALID_COMMAND');
    const taken = new Set(forming.teams.map(team => team.name.toLowerCase()));
    const name = DEFAULT_TEAM_NAMES.find(candidate => !taken.has(candidate.toLowerCase())) ?? `Team ${forming.teams.length + 1}`;
    return { forming: { ...forming, teams: distinctColors([...withColors(forming.teams), { name, targetSize: null, color: defaultTeamColor(name, forming.teams.length) }]) } };
  }
  if (command.type === 'teams.remove') {
    const index = command.teamIndex ?? -1;
    requireGame(index >= 0 && index < forming.teams.length && forming.teams.length > 1, 'INVALID_COMMAND');
    // Later teams move up one place; the removed team's players and captain are unassigned.
    const shift = (team: number | null) => team === null || team < index ? team : team === index ? null : team - 1;
    const assignment = Object.fromEntries(Object.entries(forming.assignment).map(([id, team]) => [id, shift(team)]));
    const captains = Object.fromEntries(Object.entries(forming.captains).flatMap(([team, id]) => { const next = shift(Number(team)); return next === null ? [] : [[String(next), id]]; }));
    return { forming: { ...forming, teams: forming.teams.filter((_, position) => position !== index), assignment, captains } };
  }
  if (command.type === 'teams.shuffle') {
    const skilled = command.method === 'skill';
    const formation = forming.formation === 'players' ? 'players' : skilled ? 'skill' : forming.formation === 'skill' ? 'random' : forming.formation;
    const assignment = skilled ? await bySkill(tx, sessionId, forming.teams, presentIds)
      : randomAssignment(forming.teams, presentIds, forming.teams.every(team => team.targetSize === null));
    return { forming: { ...forming, formation, assignment, captains: {}, ...(forming.captainVotes ? { captainVotes: {} } : {}) } };
  }
  if (command.type === 'teams.assign' || command.type === 'teams.choose') {
    const playerId = command.type === 'teams.choose' ? actorPlayerId : command.playerId;
    requireGame(playerId && present.has(playerId), 'INELIGIBLE');
    const index = command.teamIndex ?? null;
    requireGame(index === null || index < forming.teams.length, 'INVALID_COMMAND');
    if (command.type === 'teams.choose') {
      requireGame(forming.formation === 'players' && index !== null, 'FORBIDDEN');
      // A fixed-size team is full once it reaches its size; the host can still overfill it.
      const target = forming.teams[index]!.targetSize;
      requireGame(target === null || forming.assignment[playerId] === index || size(index) < target, 'INELIGIBLE');
    }
    const captains = Object.fromEntries(Object.entries(forming.captains).filter(([, captain]) => captain !== playerId));
    const moved = forming.assignment[playerId] !== index;
    return { forming: { ...forming, assignment: { ...forming.assignment, [playerId]: index }, captains, ...(moved && forming.captainVotes ? { captainVotes: withoutVotes(forming.captainVotes, playerId) } : {}) } };
  }
  if (command.type === 'teams.color') {
    // The host picks any colour for any team; a member picks one of the swatches for their own team, when the
    // scene lets teams choose. Two teams never share a colour.
    const index = command.teamIndex ?? -1; const color = (command.color ?? '').toLowerCase();
    requireGame(index >= 0 && index < forming.teams.length, 'INVALID_COMMAND');
    if (actorPlayerId) {
      requireGame(forming.colorsBy === 'teams' && forming.assignment[actorPlayerId] === index, 'FORBIDDEN');
      requireGame((TEAM_SWATCHES as readonly string[]).includes(color), 'INVALID_COMMAND');
    }
    const teams = withColors(forming.teams);
    requireGame(!teams.some((team, position) => position !== index && team.color === color), 'INVALID_COMMAND');
    // A team still called after its colour (Red…) takes the name of the colour it picks (Teal), when that name is free.
    const named = SWATCH_NAMES[color]; const current = teams[index]!.name;
    const renamed = named && [...DEFAULT_TEAM_NAMES, ...Object.values(SWATCH_NAMES)].includes(current)
      && !teams.some((team, position) => position !== index && team.name.toLowerCase() === named.toLowerCase()) ? named : current;
    return { forming: { ...forming, teams: teams.map((team, position) => position === index ? { ...team, color, name: renamed } : team) } };
  }
  if (command.type === 'teams.captainPick') {
    // The host switches between assigned and elected captains while teams are made; a captain the host picked stays.
    requireGame(forming.answers === 'captain' && (command.pick === 'assigned' || command.pick === 'elected'), 'INVALID_COMMAND');
    if (command.pick === 'assigned') { const { captainPick: _pick, captainVotes: _votes, ...rest } = forming; return { forming: rest }; }
    return { forming: { ...forming, captainPick: 'elected' as const, captainVotes: forming.captainVotes ?? {} } };
  }
  if (command.type === 'teams.vote') {
    // A player votes for a teammate as captain (not for themselves), and may change the vote until the teams are confirmed.
    requireGame(forming.answers === 'captain' && forming.captainPick === 'elected', 'FORBIDDEN');
    const index = actorPlayerId ? forming.assignment[actorPlayerId] : undefined;
    requireGame(actorPlayerId && present.has(actorPlayerId) && index !== undefined && index !== null, 'INELIGIBLE');
    requireGame(command.playerId && command.playerId !== actorPlayerId && present.has(command.playerId) && forming.assignment[command.playerId] === index, 'INVALID_COMMAND');
    return { forming: { ...forming, captainVotes: { ...forming.captainVotes, [actorPlayerId]: command.playerId } } };
  }
  if (command.type === 'teams.captain') {
    const index = command.playerId ? forming.assignment[command.playerId] : undefined;
    requireGame(command.playerId && present.has(command.playerId) && index !== undefined && index !== null, 'INELIGIBLE');
    return { forming: { ...forming, captains: { ...forming.captains, [String(index)]: command.playerId } } };
  }
  requireGame(command.type === 'teams.confirm', 'INVALID_COMMAND');
  const groups = forming.teams.map((team, index) => {
    const members = presentIds.filter(id => forming.assignment[id] === index);
    // The host's pick wins; elected teams then take the teammate with the most votes (a tie: one of them at random); otherwise anyone at random.
    const chosen = forming.captains[String(index)];
    const tally = captainTally(forming, index, presentIds); const top = tally.filter(entry => entry.count === tally[0]?.count).map(entry => entry.playerId);
    const pool = top.length ? top : members;
    return { name: team.name, color: team.color ?? defaultTeamColor(team.name, index), members, captain: chosen && members.includes(chosen) ? chosen : pool.length ? pool[randomInt(pool.length)]! : null };
  }).filter(group => group.members.length > 0);
  // Empty teams are dropped; players left unassigned sit this round out.
  requireGame(groups.length > 0, 'INVALID_STATE');
  const lineup = await createLineup(tx, sessionId, { formatVersion: 1, scope: forming.scope, carryover: forming.carryover }, groups);
  return { lineupId: lineup.id, playerIds: groups.flatMap(group => group.members) };
}

export interface TeamContext { lineupId: string; answers: 'everyone' | 'captain'; points: 'team' | 'members' | 'both'; teamOf: Map<string, string>; members: Map<string, string[]>; captainOf: Map<string, string> }
export async function teamContext(tx: Transaction, stage: { lineupId: string | null; presentation: unknown }): Promise<TeamContext | null> {
  const play = readStagePlay(stage.presentation);
  if (!stage.lineupId || !play) return null;
  const rows = await tx.teamMember.findMany({ where: { lineupId: stage.lineupId }, orderBy: { player: { joinedAt: 'asc' } } });
  const members = new Map<string, string[]>(); const teamOf = new Map<string, string>(); const captainOf = new Map<string, string>();
  for (const row of rows) { teamOf.set(row.playerId, row.teamId); members.set(row.teamId, [...(members.get(row.teamId) ?? []), row.playerId]); if (row.isCaptain) captainOf.set(row.teamId, row.playerId); }
  return { lineupId: stage.lineupId, ...play, teamOf, members, captainOf };
}

export interface Award { playerId?: string; teamId?: string; lineupId?: string; amountMilli: bigint; stageRunId: string | null; awardKey: string; reason: string; kind?: 'AWARD' | 'ADJUSTMENT' }
/**
 * Where points go. Solo: the player. In a team round the round's setting decides:
 * the team, each member, or both. A captain's answer counts for the whole team.
 */
export function route(base: { amountMilli: bigint; stageRunId: string; awardKey: string; reason: string }, author: { playerId?: string | null; teamId?: string | null }, context: TeamContext | null): Award[] {
  if (base.amountMilli === 0n) return [];
  if (!context) { if (!author.playerId) throw new GameError('INVALID_STATE'); return [{ ...base, playerId: author.playerId }]; }
  const teamId = author.teamId ?? (author.playerId ? context.teamOf.get(author.playerId) : undefined);
  if (!teamId) throw new GameError('INVALID_STATE');
  const awards: Award[] = [];
  if (context.points !== 'members') awards.push({ ...base, teamId, lineupId: context.lineupId, awardKey: `${base.awardKey}:team` });
  if (context.points !== 'team') {
    const recipients = author.teamId ? context.members.get(teamId) ?? [] : [author.playerId!];
    for (const playerId of recipients) awards.push({ ...base, playerId, awardKey: `${base.awardKey}:${playerId}` });
  }
  return awards;
}
