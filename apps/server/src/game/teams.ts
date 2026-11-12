import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { GameIdSchema } from '@party/contracts';
import { GameError, requireGame } from './errors.js';
import { teamCount, type Formation, type Play } from './definition.js';
import type { Transaction } from './model.js';

// Teams. A lineup is an immutable record of who was in which team; a team is
// identified by its name within the room, so points given to "Red" always count
// for "Red". Game teams persist across rounds; round teams apply to one round.
// Every new lineup starts as a proposal the host can change and must confirm.
export const DEFAULT_TEAM_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Teal', 'White', 'Black', 'Gold', 'Silver'];
export type TeamPlay = Extract<Play, { kind: 'teams' }>;
export type Carryover = 'keep' | 'fresh' | 'members';

const FormingSchema = z.object({
  scope: z.enum(['game', 'round']), carryover: z.enum(['keep', 'fresh', 'members']), formation: z.enum(['random', 'host', 'players']),
  answers: z.enum(['everyone', 'captain']), points: z.enum(['team', 'members', 'both']),
  teams: z.array(z.object({ name: z.string().min(1).max(30), targetSize: z.number().int().min(1).nullable() }).strict()).min(1).max(12),
  // Player ID -> team index, or null for sitting out. Players not listed are unassigned.
  assignment: z.record(GameIdSchema, z.number().int().min(0).max(11).nullable()),
  captains: z.record(z.string().regex(/^\d{1,2}$/), GameIdSchema),
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
export function randomAssignment(teams: Forming['teams'], playerIds: string[], balanced: boolean): Forming['assignment'] {
  const order = shuffle(playerIds); const assignment: Forming['assignment'] = {};
  if (balanced) { order.forEach((id, index) => { assignment[id] = index % teams.length; }); return assignment; }
  let next = 0;
  teams.forEach((team, index) => { if (team.targetSize !== null) for (let count = 0; count < team.targetSize && next < order.length; count++) assignment[order[next++]!] = index; });
  const rest = teams.findIndex(team => team.targetSize === null);
  while (next < order.length) assignment[order[next++]!] = rest >= 0 ? rest : null;
  return assignment;
}

export function startForming(form: Formation, play: TeamPlay, scope: 'game' | 'round', carryover: Carryover, playerIds: string[]): Forming {
  const names = form.names ?? DEFAULT_TEAM_NAMES;
  const teams = targets(form).slice(0, teamCount(form)).map((targetSize, index) => ({ name: names[index]!, targetSize }));
  return { scope, carryover, formation: form.formation, answers: play.answers, points: play.points, teams,
    assignment: form.formation === 'random' ? randomAssignment(teams, playerIds, form.split.kind === 'count') : {}, captains: {} };
}

/** The current game lineup (latest lineup made for the whole game), if any. */
export async function currentGameLineup(tx: Transaction, sessionId: string) {
  const lineups = await tx.teamLineup.findMany({ where: { sessionId }, orderBy: { number: 'desc' }, include: { members: true } });
  return lineups.find(lineup => LineupInfoSchema.safeParse(lineup.carryover).success && LineupInfoSchema.parse(lineup.carryover).scope === 'game') ?? null;
}

async function createLineup(tx: Transaction, sessionId: string, info: z.infer<typeof LineupInfoSchema>, teams: { name: string; members: string[]; captain: string | null }[]) {
  const last = await tx.teamLineup.findFirst({ where: { sessionId }, orderBy: { number: 'desc' }, select: { number: true } });
  const lineup = await tx.teamLineup.create({ data: { sessionId, number: (last?.number ?? 0) + 1, carryover: { ...info, order: teams.map(team => team.name) } } });
  for (const team of teams) {
    const row = await tx.sessionTeam.upsert({ where: { sessionId_name: { sessionId, name: team.name } }, create: { sessionId, name: team.name }, update: {} });
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
export async function formingCommand(tx: Transaction, sessionId: string, forming: Forming, command: { type: string; playerId?: string; teamIndex?: number | null }, actorPlayerId: string | null, presentIds: string[]) {
  const present = new Set(presentIds);
  const size = (index: number) => Object.entries(forming.assignment).filter(([id, team]) => team === index && present.has(id)).length;
  if (command.type === 'teams.shuffle') return { forming: { ...forming, assignment: randomAssignment(forming.teams, presentIds, forming.teams.every(team => team.targetSize === null)), captains: {} } };
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
    return { forming: { ...forming, assignment: { ...forming.assignment, [playerId]: index }, captains } };
  }
  if (command.type === 'teams.captain') {
    const index = command.playerId ? forming.assignment[command.playerId] : undefined;
    requireGame(command.playerId && present.has(command.playerId) && index !== undefined && index !== null, 'INELIGIBLE');
    return { forming: { ...forming, captains: { ...forming.captains, [String(index)]: command.playerId } } };
  }
  requireGame(command.type === 'teams.confirm', 'INVALID_COMMAND');
  const groups = forming.teams.map((team, index) => {
    const members = presentIds.filter(id => forming.assignment[id] === index);
    const chosen = forming.captains[String(index)];
    return { name: team.name, members, captain: chosen && members.includes(chosen) ? chosen : members.length ? members[randomInt(members.length)]! : null };
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
