import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { MinigameKey, MinigameSettings, StepSideView, TeamDecides } from '@party/contracts';
import type { StageRun } from '../../../generated/prisma/client.js';
import { requireGame } from '../../../game/errors.js';
import type { Transaction } from '../../../game/model.js';
import { route, type Award, type TeamContext } from '../../../game/teams/teams.js';
import { readMinigameRun, type MinigameRun, type StepSide } from '../rules.js';
import { STEP_GAMES, type StepGame } from './games.js';

/**
 * The step-game engine: what every game played move by move shares, so a game only brings
 * its rules (games.ts). A side plays: a team in a team round, else each player. Each move is
 * a choice of the game's current options, made by anyone in the team, the captain, or a team
 * vote (each member once; whoever does not vote within the vote time is not counted). Moves
 * and votes are saved as submissions (one per side and step, one per member and step), the
 * sides' states with the round; when a side is done its result is its answer, so ranking,
 * points, the reveal and auto-close work as for every minigame.
 */
export interface StepRules { game: MinigameKey; settings: MinigameSettings; decide: TeamDecides; voteSeconds: number }
interface Side { key: string; teamId: string | null; playerId: string | null; members: string[] }
type Random = (max: number) => number;

const gameOf = (rules: StepRules): StepGame<unknown> => { const game = STEP_GAMES[rules.game]; requireGame(game, 'INVALID_STATE'); return game!; };
const teamSide = (teamId: string, context: TeamContext): Side => ({ key: `team:${teamId}`, teamId, playerId: null, members: context.members.get(teamId) ?? [] });
const playerSide = (playerId: string): Side => ({ key: `player:${playerId}`, teamId: null, playerId, members: [playerId] });
/** Every side of the round: its teams, or each eligible player. */
export function sidesOf(context: TeamContext | null, playerIds: string[]): Side[] {
  return context ? [...context.members.keys()].sort().map(teamId => teamSide(teamId, context)) : playerIds.map(playerSide);
}
const voting = (rules: StepRules, side: Side) => rules.decide === 'vote' && side.teamId !== null;

/**
 * The side's captain when the captain decides: the team's own captain, else one of its members picked
 * at random but fixed for this round and team (a hash of both), so every screen shows the same captain
 * from the start, and a refused move cannot make another pick.
 */
export function captainFor(stageRunId: string, side: { teamId: string | null; members: string[] }, rules: StepRules, context: TeamContext | null): string | null {
  if (rules.decide !== 'captain' || !side.teamId || !side.members.length) return null;
  const own = context?.captainOf.get(side.teamId); if (own) return own;
  return side.members[parseInt(createHash('sha256').update(`${stageRunId}:${side.teamId}`).digest('hex').slice(0, 8), 16) % side.members.length]!;
}

/** A side's record as it starts: the game's start state, its captain (when the captain decides) and the first vote's end. */
function freshSide(stageRunId: string, rules: StepRules, run: MinigameRun, side: Side, context: TeamContext | null, now: Date, random: Random): StepSide {
  return { state: gameOf(rules).start(rules.settings, run, random), step: 0, stepAt: now.toISOString(), captainId: captainFor(stageRunId, side, rules, context),
    voteEndsAt: voting(rules, side) ? new Date(now.getTime() + rules.voteSeconds * 1000).toISOString() : null };
}

interface Play { tx: Transaction; sessionId: string; stage: StageRun; rules: StepRules; context: TeamContext | null; now: Date; random?: Random }

/** Saves the sides' records with the round. */
async function save(play: Play, run: MinigameRun, key: string, record: StepSide) {
  await play.tx.stageRun.update({ where: { id: play.stage.id }, data: { presentation: { ...(play.stage.presentation as object), minigame: { ...run, steps: { ...(run.steps ?? {}), [key]: record } } } as object } });
}

/**
 * Applies a chosen option for a side's current step: the game's new state, the move saved,
 * the next step (with a new vote time); and when the side is done, its result as its answer
 * and any points the game pays at once.
 */
async function applyOption(play: Play, run: MinigameRun, side: Side, record: StepSide, option: string): Promise<{ awards: Award[]; submissionId: string }> {
  const game = gameOf(play.rules);
  const state = game.apply(record.state, option, play.rules.settings, run);
  const move = await play.tx.submission.create({ data: { id: randomUUID(), sessionId: play.sessionId, stageRunId: play.stage.id, actorKey: side.key, slotKey: `step-${record.step}`, playerId: side.teamId ? null : side.playerId, teamId: side.teamId, value: { kind: 'choice', choiceKey: option } } });
  const next: StepSide = { ...record, state, step: record.step + 1, stepAt: play.now.toISOString(), voteEndsAt: voting(play.rules, side) ? new Date(play.now.getTime() + play.rules.voteSeconds * 1000).toISOString() : null };
  const done = game.options(state, play.rules.settings, run) === null;
  if (done) next.voteEndsAt = null;
  await save(play, run, side.key, next);
  if (!done) return { awards: [], submissionId: move.id };
  const value = game.result(state, play.rules.settings, run, play.now);
  const result = await play.tx.submission.create({ data: { id: randomUUID(), sessionId: play.sessionId, stageRunId: play.stage.id, actorKey: side.key, playerId: side.playerId, teamId: side.teamId,
    value: { kind: 'minigame', value: value ?? 0, ...(value === null ? { early: true } : {}), ...(game.resultFlags?.(state, play.rules.settings, run) ?? {}), ...(side.teamId ? { teamId: side.teamId } : {}) } } });
  const paid = game.payoutMilli?.(state, play.rules.settings, run) ?? 0n;
  return { submissionId: result.id, awards: paid ? route({ amountMilli: paid, stageRunId: play.stage.id, awardKey: `answer:${result.id}`, reason: play.rules.game === 'lucky-doors' ? 'Lucky door' : 'Minigame' }, { playerId: side.playerId, teamId: side.teamId }, play.context) : [] };
}

/** The option a team vote chose: most votes; a tie goes to the captain's vote, else a random tied option; no votes at all: a random option. */
export function voteWinner(options: readonly string[], votes: { playerId: string; option: string }[], captainId: string | null, random: Random): string {
  if (!votes.length) return options[random(options.length)]!;
  const counts = new Map<string, number>(); for (const vote of votes) counts.set(vote.option, (counts.get(vote.option) ?? 0) + 1);
  const most = Math.max(...counts.values()); const tied = [...counts.entries()].filter(([, count]) => count === most).map(([option]) => option);
  if (tied.length === 1) return tied[0]!;
  const captains = votes.find(vote => vote.playerId === captainId && tied.includes(vote.option));
  return captains ? captains.option : tied.sort()[random(tied.length)]!;
}

const votesFor = async (play: Play, side: Side, step: number) => (await play.tx.submission.findMany({ where: { stageRunId: play.stage.id, slotKey: `vote-${step}`, playerId: { in: side.members } }, select: { playerId: true, value: true } }))
  .map(row => ({ playerId: row.playerId!, option: (row.value as { choiceKey: string }).choiceKey }));

/**
 * A player's move (minigame.move): applied at once, or in a team vote their vote, which decides
 * the move when every member has voted or when `decide` (someone who voted counts the votes now).
 */
export async function stepMove(play: Play, playerId: string, step: number, option: string, decide: boolean): Promise<{ awards: Award[]; submissionId: string | null }> {
  const run = readMinigameRun(play.stage.presentation); requireGame(run, 'INVALID_STATE');
  const teamId = play.context?.teamOf.get(playerId);
  const side = play.context ? (requireGame(teamId, 'INELIGIBLE'), teamSide(teamId!, play.context)) : playerSide(playerId);
  const record = run!.steps?.[side.key] ?? freshSide(play.stage.id, play.rules, run!, side, play.context, play.now, play.random ?? randomInt);
  const options = gameOf(play.rules).options(record.state, play.rules.settings, run!);
  requireGame(options, 'ALREADY_SUBMITTED');
  requireGame(step === record.step, step < record.step ? 'ALREADY_SUBMITTED' : 'INVALID_SUBMISSION');
  requireGame(options!.includes(option), 'INVALID_SUBMISSION');
  if (side.teamId && play.rules.decide === 'captain') requireGame(record.captainId === playerId, 'INELIGIBLE');
  if (side.teamId && play.rules.decide === 'anyone' && play.context!.answers === 'captain') requireGame(play.context!.captainOf.get(side.teamId) === playerId, 'INELIGIBLE');
  if (!voting(play.rules, side)) return applyOption(play, run!, side, record, option);
  // A team vote: one vote per member and step.
  const earlier = await votesFor(play, side, step);
  const mine = earlier.find(vote => vote.playerId === playerId);
  if (!mine) await play.tx.submission.create({ data: { id: randomUUID(), sessionId: play.sessionId, stageRunId: play.stage.id, actorKey: `player:${playerId}`, slotKey: `vote-${step}`, playerId, value: { kind: 'choice', choiceKey: option } } });
  else requireGame(decide, 'ALREADY_SUBMITTED');
  const votes = mine ? earlier : [...earlier, { playerId, option }];
  if (votes.length < side.members.length && !decide) { if (!run!.steps?.[side.key]) await save(play, run!, side.key, record); return { awards: [], submissionId: null }; }
  return applyOption(play, run!, side, record, voteWinner(options!, votes, record.captainId, play.random ?? randomInt));
}

/** The vote time of a side's step ran out (or the host decides now): the votes cast decide. */
export async function stepDecide(play: Play, sideKey: string, step: number, force: boolean): Promise<{ awards: Award[] }> {
  const run = readMinigameRun(play.stage.presentation); const record = run?.steps?.[sideKey];
  requireGame(run && record && record.step === step && record.voteEndsAt, 'INVALID_STATE');
  requireGame(force || Date.parse(record!.voteEndsAt!) <= play.now.getTime(), 'INVALID_STATE');
  const teamId = sideKey.startsWith('team:') ? sideKey.slice(5) : null; requireGame(teamId && play.context, 'INVALID_STATE');
  const side = teamSide(teamId!, play.context!);
  const options = gameOf(play.rules).options(record!.state, play.rules.settings, run!); requireGame(options, 'INVALID_STATE');
  return applyOption(play, run!, side, record!, voteWinner(options!, await votesFor(play, side, step), record!.captainId, play.random ?? randomInt));
}

/** Every side as screens see it. A team's vote counts only for its own members and the host; others see who has voted. */
export async function stepView(tx: Transaction, stage: StageRun, rules: StepRules, context: TeamContext | null, playerIds: string[], viewer: { playerId: string | null; host: boolean }): Promise<{ decides: TeamDecides; sides: StepSideView[] }> {
  const run = readMinigameRun(stage.presentation); const game = gameOf(rules); const sides = sidesOf(context, playerIds);
  const rows = await tx.submission.findMany({ where: { stageRunId: stage.id, OR: [{ slotKey: { startsWith: 'vote-' } }, { slotKey: 'answer' }] }, select: { playerId: true, teamId: true, slotKey: true, value: true } });
  const teamNames = new Map((await tx.sessionTeam.findMany({ where: { id: { in: sides.flatMap(side => side.teamId ? [side.teamId] : []) } }, select: { id: true, name: true } })).map(team => [team.id, team.name]));
  const playerNames = new Map((await tx.sessionPlayer.findMany({ where: { id: { in: sides.flatMap(side => side.playerId ? [side.playerId] : []) } }, select: { id: true, displayName: true } })).map(player => [player.id, player.displayName]));
  const emptyRun = { startsAt: stage.openedAt.toISOString(), goAt: null, doorsMilli: null };
  // A side that has not played yet shows the game's start (its secrets are never part of a view).
  const states = sides.map(side => run?.steps?.[side.key]?.state ?? game.start(rules.settings, run ?? emptyRun, () => 0));
  const extras = game.extras?.(states.map(state => ({ state, done: run ? game.options(state, rules.settings, run) === null : false })), rules.settings) ?? sides.map(() => 0);
  return { decides: rules.decide, sides: sides.map((side, at) => {
    const record = run?.steps?.[side.key] ?? null; const state = states[at]; const extra = extras[at] ?? 0;
    const options = run ? game.options(state, rules.settings, run) : null; const step = record?.step ?? 0;
    const answer = rows.find(row => row.slotKey === 'answer' && (side.teamId ? row.teamId === side.teamId : row.playerId === side.playerId));
    const votes = rows.filter(row => row.slotKey === `vote-${step}` && row.playerId && side.members.includes(row.playerId));
    const member = viewer.playerId !== null && side.members.includes(viewer.playerId);
    const seesCounts = viewer.host || member;
    // A game with private letters (Galgje): only the side's members get them, and its options (which letters are left).
    const own = game.ownView && member && run ? { own: game.ownView(state, rules.settings, run) } : {};
    const shownOptions = options && game.ownView && !member ? [] : options;
    const counts = new Map<string, number>(); for (const vote of votes) { const option = (vote.value as { choiceKey: string }).choiceKey; counts.set(option, (counts.get(option) ?? 0) + 1); }
    return { teamId: side.teamId, playerId: side.playerId, name: side.teamId ? teamNames.get(side.teamId) ?? 'Team' : playerNames.get(side.playerId!) ?? 'Player', step,
      options: answer ? null : shownOptions ? [...shownOptions] : null, result: answer && !game.secret ? ((answer.value as { value: number; early?: boolean }).early ? null : (answer.value as { value: number }).value + extra) : null,
      captainId: record?.captainId ?? captainFor(stage.id, side, rules, context), voteEndsAt: options && record?.voteEndsAt ? record.voteEndsAt : null,
      votes: seesCounts ? [...counts.entries()].map(([option, count]) => ({ option, count })) : [], voters: votes.map(vote => vote.playerId!),
      view: run ? game.view(state, rules.settings, run, extra) : null, ...own };
  }) };
}

/** Rounds with a team vote whose time has run out (checked by the room's timer, like round deadlines). */
export function dueVotes(stage: { presentation: unknown }, now: Date): { side: string; step: number }[] {
  const run = readMinigameRun(stage.presentation);
  return Object.entries(run?.steps ?? {}).filter(([, record]) => record.voteEndsAt && Date.parse(record.voteEndsAt) <= now.getTime()).map(([side, record]) => ({ side, step: record.step }));
}

/**
 * Decides every team vote whose time ran out, as the host (like closing timed rounds: the state
 * is durable, so this needs no timer per room). A vote decided meanwhile is simply refused.
 */
export async function decideDueVotes(client: { stageRun: { findMany: (args: object) => Promise<{ id: string; sessionId: string; presentation: unknown; session: { hostId: string } }[]> } },
  service: { execute: (actor: { role: 'host'; creatorId: string }, command: object) => Promise<unknown> }, now: Date = new Date()): Promise<number> {
  const active = await client.stageRun.findMany({ where: { status: 'ACTIVE', session: { status: 'RUNNING' } }, select: { id: true, sessionId: true, presentation: true, session: { select: { hostId: true } } }, take: 200 });
  let decided = 0;
  for (const stage of active) for (const due of dueVotes(stage, now)) {
    try { await service.execute({ role: 'host', creatorId: stage.session.hostId }, { formatVersion: 1, type: 'minigame.decide', sessionId: stage.sessionId, commandId: randomUUID(), stageRunId: stage.id, side: due.side, step: due.step }); decided++; }
    catch { /* decided by a last vote, closed or paused meanwhile: the next pass re-reads */ }
  }
  return decided;
}
