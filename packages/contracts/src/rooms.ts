import { MAX_OWN_REACTIONS } from './party-extras.js';
import { HangmanWordSchema } from './minigames/hangman/hangman.js';
import { UndercoverPairSchema } from './minigames/undercover/undercover.js';
import { z } from 'zod';
import { GameIdSchema, GameErrorCodeSchema, SessionViewSchema } from './game.js';
import { PlayerLookSchema } from './players.js';
import { ArcadeLinkSchema } from './arcade.js';
import { TranslatedTextsSchema } from './presentation.js';

export const AutoRevealSecondsSchema = z.number().int().min(0).max(120);
export const MAX_IDLE_CLOSE_MINUTES = 1440;
export const IdleCloseMinutesSchema = z.number().int().min(0).max(MAX_IDLE_CLOSE_MINUTES);

export const ROOM_CODE_LENGTH = 6;
export const RoomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
/** What someone typed or pasted, as a code: capitals, only characters a code can have, never longer than a code. */
export const cleanRoomCode = (typed: string) => typed.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, ROOM_CODE_LENGTH);
/** A code as people read it: ABC-123. The dash is only for reading; it is never part of the code. */
export const formatRoomCode = (code: string) => code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
export const JoinRoomSchema = z.object({
  roomCode: RoomCodeSchema, joinId: GameIdSchema,
  displayName: z.string().trim().min(1).max(40),
  // The look this phone used last time, if any.
  look: PlayerLookSchema.optional(),
}).strict();
export const ClaimRoomSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
// `seat`: a phone on the test bench (several phones in one browser; ignored in production).
export const ConnectRoomSchema = z.object({ sessionId: GameIdSchema, display: z.literal(true).optional(), seat: z.number().int().min(1).max(16).optional() }).strict();
export const NetworkErrorCodeSchema = z.enum([
  ...GameErrorCodeSchema.options, 'UNAUTHORIZED', 'CREDENTIAL_EXPIRED', 'AUTH_UNAVAILABLE', 'ROOM_NOT_AVAILABLE', 'RATE_LIMITED', 'ORIGIN_REJECTED', 'FILE_TOO_LARGE', 'UNSUPPORTED_MEDIA', 'STORAGE_FULL', 'SEAT_UNAVAILABLE', 'SEAT_DENIED', 'SIDE_GAMES_OFF', 'CHIPS_OFF', 'SIDE_GAMES_PAUSED', 'NOT_ENOUGH_CHIPS', 'NAME_TAKEN', 'PREFAB_LIMIT', 'SAVE_POINT_LIMIT', 'STYLE_LIMIT', 'GROUP_FULL',
  'AUDIO_TOOLS_UNAVAILABLE', 'AUDIO_IMPORT_FAILED', 'AUDIO_TRIM_FAILED', 'FONT_IMPORT_FAILED',
  'LOBBY_PASSWORD_REQUIRED', 'LOBBY_LOCKED', 'LOBBY_FULL', 'ARCADE_FULL', 'ROUND_ON', 'NOT_ENOUGH_PLAYERS', 'MEDIA_IN_USE',
]);
export type NetworkErrorCode = z.infer<typeof NetworkErrorCodeSchema>;
export type RoomReply<T> = { ok: true; data: T } | { ok: false; error: { code: NetworkErrorCode } };
/**
 * A game's own starting room settings (editor → Game settings → Room settings, or `"room"` in an imported game).
 * A room of the game starts with them; the host can still change them in the room, except the round-closing
 * rule (`autoClose`, `autoCloseSeconds`), which stays as the game set it once the game has started.
 * Left out: the room's standard (scores shown, reactions on at 10 per 10 s, break votes at 50%, close 3 s after the last answer).
 */
export const GameRoomSettingsSchema = z.object({
  showScores: z.boolean().optional(),
  reactions: z.boolean().optional(), reactionLimit: z.number().int().min(1).max(30).optional(),
  // `soundboard`: players may play the game's sounds on the shared screen (one at a time, a wait per player).
  soundboard: z.boolean().optional(),
  // `eventSounds`: the shared screen plays short cues: the last seconds of a round, its end, the reveal and the winner.
  eventSounds: z.boolean().optional(),
  breakVotes: z.boolean().optional(), breakPercent: z.number().int().min(10).max(100).optional(),
  autoClose: z.boolean().optional(), autoCloseSeconds: z.number().int().min(1).max(30).optional(),
}).strict();
export type GameRoomSettings = z.infer<typeof GameRoomSettingsSchema>;
/** Room settings the game fixes once it has started (when the game sets them). */
export const GAME_LOCKED_SETTINGS = ['autoClose', 'autoCloseSeconds'] as const;
export const RoomSnapshotSchema = z.object({
  view: SessionViewSchema, roomCode: RoomCodeSchema,
  role: z.enum(['host', 'player', 'display']), selfPlayerId: GameIdSchema.nullable(),
  // Whether a shared screen is connected: it plays the room's videos and songs; without one the host's screen does.
  displayConnected: z.boolean().optional(),
  // Whether a host or shared screen is watching. Without one (two phones in the arcade), phones show the round's picture themselves.
  screenConnected: z.boolean().optional(),
  birthdayVote: z.object({ voted: z.boolean(), ready: z.boolean() }).strict().optional(),
  hostPhone: z.boolean().optional(), hostPhonePlayerId: GameIdSchema.nullable().optional(),
  players: z.array(z.object({ id: GameIdSchema, displayName: z.string().min(1).max(40), connected: z.boolean(), look: PlayerLookSchema, canBan: z.boolean().optional() }).strict()),
  settings: z.object({ reclaimApproval: z.boolean(), showScores: z.boolean(), reactions: z.boolean(), soundboard: z.boolean().optional(), eventSounds: z.boolean().optional(), chat: z.boolean().optional(), autoClose: z.boolean(), autoCloseSeconds: z.number().int(), breakVotes: z.boolean(), breakPercent: z.number().int(), reactionLimit: z.number().int(), reactionChoices: z.array(z.number().int()), sideGames: z.boolean(), chips: z.boolean(), openInvites: z.number().int(), confirmLooks: z.boolean(), quickTimeSeconds: z.number().int(), music: z.boolean(), musicVolume: z.number().int(), signup: z.boolean(), testBench: z.boolean(), autoRevealSeconds: AutoRevealSecondsSchema.nullable().optional(),
    // Settings the game fixed now that it has started; the host sees them but cannot change them.
    locked: z.array(z.enum(GAME_LOCKED_SETTINGS)).optional(), idleCloseMinutes: IdleCloseMinutesSchema.optional(), keepOpen: z.boolean().optional() }).strict(),
  // A break: the game is paused for everyone until the host continues. `votes`/`needed`: the players' vote for one.
  break: z.object({ active: z.boolean(), startedAt: z.string().datetime().nullable(), votes: z.number().int().min(0), needed: z.number().int().min(1), voted: z.boolean() }).strict(),
  // Host only: new phones waiting to take over a seat. Empty for everyone else.
  seatRequests: z.array(z.object({ requestId: GameIdSchema, playerId: GameIdSchema, requestedAt: z.string().datetime() }).strict()),
  // Host only (empty for others): people the host added to this room, whether they have a seat yet, and phones asking to sign in as one of them.
  expected: z.array(z.object({ personId: GameIdSchema, name: z.string(), joined: z.boolean() }).strict()).optional(),
  nameRequests: z.array(z.object({ requestId: GameIdSchema, personId: GameIdSchema, requestedAt: z.string().datetime() }).strict()).optional(),
  // Host only: the host's own words for Galgje and Undercover in this room (absent for everyone else).
  ownWords: z.object({ words: z.array(z.string()), pairs: z.array(z.tuple([z.string(), z.string()])) }).strict().optional(),
  // The host went back to the lobby: this room has ended and everyone moves into this one (phones and the shared screen follow by themselves).
  nextRoom: GameIdSchema.nullable(),
  roomClosed: z.boolean().optional(),
  tryout: z.literal(true).optional(),
  // An arcade round: its lobby, and whether this phone is the leader who runs the round (absent outside the arcade).
  arcade: ArcadeLinkSchema.nullable().optional(),
}).strict();
// Seat takeover from a new phone. The request ID is created by that phone and
// kept while it waits; repeating the request checks on it.
export const ReclaimSeatSchema = z.object({ roomCode: RoomCodeSchema, playerId: GameIdSchema, requestId: GameIdSchema }).strict();
export const SeatListSchema = z.object({ approval: z.boolean(), seats: z.array(z.object({ id: GameIdSchema, displayName: z.string().min(1).max(40) }).strict()) }).strict();
export const SeatDecisionSchema = z.object({ requestId: GameIdSchema, approve: z.boolean() }).strict();
/** Emoji and stickers players can send to the shared screen. A reaction is its position in this list. */
export const REACTIONS = ['👍', '😂', '🔥', '😮', '😱', '👏', '❤️', '🎉', '🤔', '💀', '🙈', '🍻', 'GG EZ', 'LOL', 'NOOO', 'YES!', 'WOW', 'BOO', 'GO NEXT', 'TY FOR TUTORIAL'] as const;
/** Challenges one player may have waiting for an answer at once: the standard, and the most a game or host may allow. */
export const OPEN_INVITES_DEFAULT = 3; export const MAX_OPEN_INVITES = 10;
// Host settings for the room; send only what changes.
// `showScores`: players and the shared screen see the scoreboard during the game (else only at scoreboard scenes and the end).
// `reactions`: players may send emoji and stickers to the shared screen. `autoClose`: a round closes 3 seconds after everyone answered.
// `reactionLimit`: reactions each player may send per 10 seconds. `reactionChoices`: which of REACTIONS are allowed (positions in the list).
export const RoomSettingsSchema = z.object({ reclaimApproval: z.boolean(), showScores: z.boolean(), reactions: z.boolean(), soundboard: z.boolean(), eventSounds: z.boolean(), chat: z.boolean().optional(), autoClose: z.boolean(), autoCloseSeconds: z.number().int().min(1).max(30),
  // `breakVotes`: players may vote for a break; it starts when `breakPercent` of the players agree. The host can always call one.
  breakVotes: z.boolean(), breakPercent: z.number().int().min(10).max(100),
  // `sideGames`: games on the phones while waiting (challenges between players). `chips`: the games played with chips
  // (slot machine, blackjack, packs) and stakes in challenges; only with `sideGames` on.
  sideGames: z.boolean(), chips: z.boolean(),
  // `openInvites`: challenges a player may have waiting for an answer at once (1 to 10; standard 3).
  openInvites: z.number().int().min(1).max(MAX_OPEN_INVITES),
  // `confirmLooks`: players confirm a new look before it is used (off: used as soon as it is chosen).
  confirmLooks: z.boolean(),
  // `quickTimeSeconds`: what the host's quick time button adds to a round.
  quickTimeSeconds: z.number().int().min(5).max(600),
  // `music`: the game's music plays (on the shared screen); `musicVolume`: how loud, 0 to 100.
  music: z.boolean(), musicVolume: z.number().int().min(0).max(100),
  // `signup`: a guest may make their own account while joining (and sees their personal key once).
  signup: z.boolean(),
  // `testBench`: phones on the test bench (several players in one browser) may join this room.
  testBench: z.boolean(),
  autoRevealSeconds: AutoRevealSecondsSchema.nullable(),
  keepOpen: z.boolean(),
  reactionLimit: z.number().int().min(1).max(30), reactionChoices: z.array(z.number().int().min(0).max(REACTIONS.length - 1)).min(1).max(REACTIONS.length).refine(list => new Set(list).size === list.length, 'Each reaction once') }).partial().strict()
  .refine(settings => Object.keys(settings).length > 0, 'Change at least one setting');
/** A reaction: one of REACTIONS by its position, or after them one of the game's own (REACTIONS.length + its position). */
export const ReactionSchema = z.object({ reaction: z.number().int().min(0).max(REACTIONS.length + MAX_OWN_REACTIONS - 1) }).strict();
/**
 * The host's own words for this room: Galgje words and Undercover word pairs. The next Galgje or Undercover
 * round that starts uses them instead of its scene's words (empty: the scene's). Only the host ever sees them.
 */
export const RoomWordsSchema = z.object({ words: z.array(HangmanWordSchema).max(200), pairs: z.array(UndercoverPairSchema).max(100) }).strict();
export type RoomWords = z.output<typeof RoomWordsSchema>;
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
import { MediaKindSchema } from './game.js';
import { GameSummarySchema } from './authoring.js';
export const UploadedAssetSchema = z.object({ assetId: GameIdSchema, mediaKind: MediaKindSchema }).strict();
export const HeartbeatSchema = z.object({ nonce: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
export const HeartbeatReplySchema = z.object({ nonce: z.string(), serverTime: z.string().datetime() }).strict();

// Browser hosting menu. Lists only titles and shape, never prompts or answers.
const HostRoleSchema = z.enum(['owner', 'editor']);
// `permissions`: the app permissions of the one signed in (all for the owner), so menus show what they may use.
export const HostAccessSchema = z.object({ role: HostRoleSchema.nullable(), localSignIn: z.boolean(), permissions: z.array(z.string()).optional() }).strict();
export type HostAccess = z.infer<typeof HostAccessSchema>;
export const HostGameSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), title: z.string().min(1).max(160), description: z.string().max(240), stageCount: z.number().int().min(1), timed: z.boolean(), branches: z.boolean(),
  // For the menu: what is in the game, about how long it takes, and its colours (for the cover).
  features: z.array(z.enum(['quiz', 'order', 'writing', 'drawing', 'uploads', 'votes', 'minigames', 'challenges', 'teams', 'routes', 'duels'])), minutes: z.number().int().min(1),
  colors: z.object({ from: z.string(), to: z.string(), accent: z.string() }).strict(),
  // The owner's own version of this built-in game, if any: `inUse` once it is published (the menu and rooms then use it),
  // `unpublished` while its draft has changes that are not published yet.
  custom: z.object({ gameId: GameIdSchema, inUse: z.boolean(), unpublished: z.boolean() }).strict().nullable().optional() }).strict();
export const HostMenuSchema = z.object({
  games: z.array(HostGameSchema),
  // The owner's own games, with their draft and publishing state.
  myGames: z.array(GameSummarySchema),
  // The owner sees everything; an editor (a person allowed to edit games) gets no open rooms and cannot host.
  role: HostRoleSchema,
  // The app permissions of the one signed in (roles.ts); all of them for the owner.
  permissions: z.array(z.string().max(40)).max(40).optional(),
  rooms: z.array(z.object({ sessionId: GameIdSchema, roomCode: RoomCodeSchema, title: z.string().min(1).max(160), status: SessionViewSchema.shape.status, playerCount: z.number().int().min(0) }).strict()),
}).strict();
export type HostMenu = z.infer<typeof HostMenuSchema>;
// Open a room for a built-in game (`gameKey`) or for the latest published version of one of your games (`gameId`).
export const HostRoomSchema = z.object({ gameKey: HostGameSchema.shape.key.optional(), gameId: GameIdSchema.optional(), sessionId: GameIdSchema, commandId: GameIdSchema }).strict()
  .refine(input => (input.gameKey === undefined) !== (input.gameId === undefined), 'Choose a built-in game or one of your games');
/** Back to the lobby: the IDs of the fresh room (made by the host's browser, so a retry opens the same room). */
export const RestartRoomSchema = z.object({ sessionId: GameIdSchema, commandId: GameIdSchema }).strict();

// The public look of a room, for its join screen: title, texts and theme only.
export const RoomLookSchema = z.object({ title: z.string().min(1).max(160), presentation: z.object({ texts: z.record(z.string(), z.string()), translations: TranslatedTextsSchema.optional(), animations: z.record(z.string(), z.unknown()), themes: z.array(z.unknown()).max(2) }).strict(),
  // For the join screen: whether a guest may make an account here, and the people the host added who have no seat yet ("Are you one of these?").
  signup: z.boolean().optional(), expected: z.array(z.object({ id: GameIdSchema, name: z.string() }).strict()).max(100).optional() }).strict();
/** A guest makes their own account while joining (only when the room allows it). The key is shown once on the phone. */
export const SignupSchema = z.object({ roomCode: RoomCodeSchema, name: z.string().trim().min(1).max(40) }).strict();
/** A phone asks to sign in as one of the people the host added; the request ID is made by that phone and repeated while it waits. */
export const NamePickSchema = z.object({ roomCode: RoomCodeSchema, personId: GameIdSchema, requestId: GameIdSchema }).strict();
/** The host sets which people are expected in the room (replaces the list). */
export const ExpectedPeopleSchema = z.object({ personIds: z.array(GameIdSchema).max(100) }).strict();
