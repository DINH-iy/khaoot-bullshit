import { z } from 'zod';
import { GameIdSchema } from './game.js';
import { MINIGAME_KEYS, isMinigameKey, type MinigameKey } from './minigames/shared/catalog.js';
import { HEAD_TO_HEAD_KEYS, isHeadToHeadKey, type HeadToHeadKey } from './head-to-head.js';
import { PlayerLookSchema } from './players.js';
import { GraphLibraryEntrySchema, GraphLibraryIdSchema } from './minigames/draw-the-graph/graph.js';

/**
 * The arcade: lobbies anyone opens to play minigames and duels together, outside a game.
 * A lobby keeps its members, its leader and a running total across rounds; each
 * round is a room with one scene that the lobby's members are seated in.
 */
const MinigameKeySchema = z.enum(MINIGAME_KEYS as [MinigameKey, ...MinigameKey[]]);
export type ArcadeGame = MinigameKey | HeadToHeadKey;
export const ArcadeGameSchema = z.enum([...HEAD_TO_HEAD_KEYS, ...MINIGAME_KEYS] as const);
export const isArcadeGame = (value: unknown): value is ArcadeGame => typeof value === 'string' && (isMinigameKey(value) || isHeadToHeadKey(value));
export const ARCADE_PASSWORD_MIN = 4;
export const ARCADE_PASSWORD_MAX = 64;
const PasswordSchema = z.string().min(ARCADE_PASSWORD_MIN).max(ARCADE_PASSWORD_MAX).refine(password => password.trim().length > 0);
const NameSchema = z.string().trim().min(1).max(40);
const MilliSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const ARCADE_MAX_MEMBERS = 24;
export const ARCADE_MAX_TEAMS = 6;

/** Teams for a round: how many, and whether the server splits at random or the players pick (the leader confirms). */
export const ArcadeTeamsSchema = z.object({ count: z.number().int().min(2).max(ARCADE_MAX_TEAMS), formation: z.enum(['random', 'players']) }).strict();
export type ArcadeTeams = z.infer<typeof ArcadeTeamsSchema>;

// Requests. Ids are made by the browser, so a retried request is the same lobby or round.
export const CreateArcadeSchema = z.object({ lobbyId: GameIdSchema, title: z.string().trim().min(1).max(60).optional(), displayName: NameSchema, look: PlayerLookSchema.optional(), password: PasswordSchema.optional() }).strict();
export const JoinArcadeSchema = z.object({ displayName: NameSchema, look: PlayerLookSchema.optional(), password: z.string().max(ARCADE_PASSWORD_MAX).optional() }).strict();
export const ArcadePasswordUpdateSchema = z.object({ password: PasswordSchema.nullable() }).strict();
export const ArcadeLockSchema = z.object({ locked: z.boolean() }).strict();
/** What the leader has chosen so far for the next round; everyone else watches it (read-only) until the round starts. */
export const ArcadePickSchema = z.object({ game: ArcadeGameSchema, teams: ArcadeTeamsSchema.nullable(), graph: GraphLibraryIdSchema.optional() }).strict();
export type ArcadePick = z.infer<typeof ArcadePickSchema>;
// `graph`: for Draw the Graph, one chart of the graph library; left out, a random one.
export const StartArcadeRoundSchema = z.object({ roundId: GameIdSchema, game: ArcadeGameSchema, teams: ArcadeTeamsSchema.nullable(), graph: GraphLibraryIdSchema.optional() }).strict();
/** Play the round just played again (same game and teams), with new values: another graph, new dots, a new target. */
export const ArcadeAgainSchema = z.object({ roundId: GameIdSchema }).strict();
export const ArcadeGraphsSchema = z.object({ graphs: z.array(GraphLibraryEntrySchema) }).strict();
/** What the leader does in a round's room. `stageRunId` binds the action to the round step the leader saw. */
export const ARCADE_ACTIONS = ['begin', 'resume', 'confirm-teams', 'shuffle-teams', 'start', 'close', 'reveal', 'end'] as const;
export type ArcadeAction = typeof ARCADE_ACTIONS[number];
export const ArcadeActSchema = z.object({ action: z.enum(ARCADE_ACTIONS), stageRunId: GameIdSchema.nullable() }).strict();

// Views.
export const ArcadeLobbyCardSchema = z.object({
  id: GameIdSchema, title: z.string(), locked: z.boolean(), protected: z.boolean().default(false), players: z.number().int().min(0),
  leaderName: z.string().nullable(), playing: ArcadeGameSchema.nullable(), member: z.boolean(),
}).strict();
export const ArcadeListSchema = z.object({ lobbies: z.array(ArcadeLobbyCardSchema) }).strict();
export type ArcadeList = z.infer<typeof ArcadeListSchema>;

// `totalMilli`: the player's lobby total after this round (this round's points included), to see it grow round by round.
const ResultRowSchema = z.object({ memberId: GameIdSchema, displayName: z.string(), look: PlayerLookSchema, place: z.number().int().min(1).nullable(), pointsMilli: MilliSchema, totalMilli: MilliSchema.optional(), value: z.number().int().nullable() }).strict();
/** How many finished rounds a lobby shows to look back through. */
export const ARCADE_ROUND_HISTORY = 20;
const RoundResultsSchema = z.object({ number: z.number().int().min(1), game: ArcadeGameSchema, teams: z.number().int().nullable(), results: z.array(ResultRowSchema) }).strict();
export const ArcadeLobbyViewSchema = z.object({
  id: GameIdSchema, title: z.string(), locked: z.boolean(), protected: z.boolean().default(false), closed: z.boolean(),
  // Null: this browser is not a member (it sees the join form).
  me: z.object({ memberId: GameIdSchema, leader: z.boolean() }).strict().nullable(),
  members: z.array(z.object({ id: GameIdSchema, displayName: z.string(), look: PlayerLookSchema, connected: z.boolean(), leader: z.boolean(), playing: z.boolean() }).strict()),
  // The round being played, if any; `seated`: this browser plays in it (and can enter its room).
  round: z.object({ number: z.number().int().min(1), game: ArcadeGameSchema, teams: z.number().int().nullable(), seated: z.boolean() }).strict().nullable(),
  // The running total of this lobby: everyone who played a round here.
  totals: z.array(z.object({ memberId: GameIdSchema, displayName: z.string(), look: PlayerLookSchema, pointsMilli: MilliSchema, wins: z.number().int().min(0), rounds: z.number().int().min(0) }).strict()),
  lastRound: RoundResultsSchema.nullable(),
  // Earlier rounds too, newest first (the last ARCADE_ROUND_HISTORY), to look back through how the lobby went.
  rounds: z.array(RoundResultsSchema).max(ARCADE_ROUND_HISTORY).default([]),
  // The leader's choice for the next round so far (null until they change it).
  pick: ArcadePickSchema.nullable().default(null),
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
