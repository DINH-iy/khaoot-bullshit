import { z } from 'zod';
import { GameIdSchema } from './game.js';
import { MINIGAME_KEYS, type MinigameKey } from './minigames.js';
import { PlayerLookSchema } from './players.js';

/**
 * The arcade: lobbies anyone opens to play minigames together, outside a game.
 * A lobby keeps its members, its leader and a running total across rounds; each
 * round is a room with one minigame that the lobby's members are seated in.
 */
const MinigameKeySchema = z.enum(MINIGAME_KEYS as [MinigameKey, ...MinigameKey[]]);
const NameSchema = z.string().trim().min(1).max(40);
const MilliSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const ARCADE_MAX_MEMBERS = 24;
export const ARCADE_MAX_TEAMS = 6;

/** Teams for a round: how many, and whether the server splits at random or the players pick (the leader confirms). */
export const ArcadeTeamsSchema = z.object({ count: z.number().int().min(2).max(ARCADE_MAX_TEAMS), formation: z.enum(['random', 'players']) }).strict();
export type ArcadeTeams = z.infer<typeof ArcadeTeamsSchema>;

// Requests. Ids are made by the browser, so a retried request is the same lobby or round.
export const CreateArcadeSchema = z.object({ lobbyId: GameIdSchema, title: z.string().trim().min(1).max(60).optional(), displayName: NameSchema, look: PlayerLookSchema.optional() }).strict();
export const JoinArcadeSchema = z.object({ displayName: NameSchema, look: PlayerLookSchema.optional() }).strict();
export const ArcadeLockSchema = z.object({ locked: z.boolean() }).strict();
export const StartArcadeRoundSchema = z.object({ roundId: GameIdSchema, game: MinigameKeySchema, teams: ArcadeTeamsSchema.nullable() }).strict();
/** What the leader does in a round's room. `stageRunId` binds the action to the round step the leader saw. */
export const ARCADE_ACTIONS = ['begin', 'resume', 'confirm-teams', 'shuffle-teams', 'start', 'close', 'reveal', 'end'] as const;
export type ArcadeAction = typeof ARCADE_ACTIONS[number];
export const ArcadeActSchema = z.object({ action: z.enum(ARCADE_ACTIONS), stageRunId: GameIdSchema.nullable() }).strict();

// Views.
export const ArcadeLobbyCardSchema = z.object({
  id: GameIdSchema, title: z.string(), locked: z.boolean(), players: z.number().int().min(0),
  leaderName: z.string().nullable(), playing: MinigameKeySchema.nullable(), member: z.boolean(),
}).strict();
export const ArcadeListSchema = z.object({ lobbies: z.array(ArcadeLobbyCardSchema) }).strict();
export type ArcadeList = z.infer<typeof ArcadeListSchema>;

const ResultRowSchema = z.object({ memberId: GameIdSchema, displayName: z.string(), look: PlayerLookSchema, place: z.number().int().min(1).nullable(), pointsMilli: MilliSchema, value: z.number().int().nullable() }).strict();
export const ArcadeLobbyViewSchema = z.object({
  id: GameIdSchema, title: z.string(), locked: z.boolean(), closed: z.boolean(),
  // Null: this browser is not a member (it sees the join form).
  me: z.object({ memberId: GameIdSchema, leader: z.boolean() }).strict().nullable(),
  members: z.array(z.object({ id: GameIdSchema, displayName: z.string(), look: PlayerLookSchema, connected: z.boolean(), leader: z.boolean(), playing: z.boolean() }).strict()),
  // The round being played, if any; `seated`: this browser plays in it (and can enter its room).
  round: z.object({ number: z.number().int().min(1), game: MinigameKeySchema, teams: z.number().int().nullable(), seated: z.boolean() }).strict().nullable(),
  // The running total of this lobby: everyone who played a round here.
  totals: z.array(z.object({ memberId: GameIdSchema, displayName: z.string(), look: PlayerLookSchema, pointsMilli: MilliSchema, wins: z.number().int().min(0), rounds: z.number().int().min(0) }).strict()),
  lastRound: z.object({ number: z.number().int().min(1), game: MinigameKeySchema, teams: z.number().int().nullable(), results: z.array(ResultRowSchema) }).strict().nullable(),
}).strict();
export type ArcadeLobbyView = z.infer<typeof ArcadeLobbyViewSchema>;

/** All-time leaderboards, for people (personal keys) only: the best result per minigame (played alone) and wins over all. */
export const ArcadeLeaderboardSchema = z.object({
  best: z.array(z.object({ game: MinigameKeySchema, rows: z.array(z.object({ name: z.string(), value: z.number().int() }).strict()) }).strict()),
  wins: z.array(z.object({ name: z.string(), wins: z.number().int().min(0), rounds: z.number().int().min(0), pointsMilli: MilliSchema }).strict()),
}).strict();
export type ArcadeLeaderboard = z.infer<typeof ArcadeLeaderboardSchema>;

/** In a round's room: which lobby it belongs to, and whether this phone is the leader who runs it. */
export const ArcadeLinkSchema = z.object({ lobbyId: GameIdSchema, leader: z.boolean() }).strict();
export type ArcadeLink = z.infer<typeof ArcadeLinkSchema>;
