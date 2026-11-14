import { z } from 'zod';
import type { SessionView } from './game.js';

/**
 * Side games: played on a player's own phone while waiting (lobby, between
 * rounds, after answering). Play chips only, never money. The server decides
 * every card, reel and pack; phones only show the outcome. Side games pause
 * whenever the game needs the player, and the host can switch them off.
 */
export const SIDE_GAMES = ['slots', 'blackjack', 'packs'] as const;
export type SideGame = typeof SIDE_GAMES[number];
export const SIDE_GAME_NAMES: Record<SideGame, string> = { slots: 'Slot machine', blackjack: 'Blackjack', packs: 'Packs' };

export const START_CHIPS = 1000;
/** A broke player can take a refill; refills are counted on the leaderboard. */
export const REFILL_CHIPS = 500;
export const REFILL_BELOW = 10;
export const BETS = [10, 25, 50, 100] as const;
const BetSchema = z.union(BETS.map(bet => z.literal(bet)) as [z.ZodLiteral<10>, z.ZodLiteral<25>, z.ZodLiteral<50>, z.ZodLiteral<100>]);

// Slot machine: three reels, each symbol with the same chance on every reel.
// Pays (total returned, bet included) for three of a kind; any two cherries return the bet.
export const SLOT_SYMBOLS = [
  { key: 'cherry', emoji: '🍒', weight: 30, pays: 10 },
  { key: 'lemon', emoji: '🍋', weight: 25, pays: 12 },
  { key: 'bell', emoji: '🔔', weight: 20, pays: 15 },
  { key: 'star', emoji: '⭐', weight: 13, pays: 40 },
  { key: 'diamond', emoji: '💎', weight: 8, pays: 100 },
  { key: 'seven', emoji: '7️⃣', weight: 4, pays: 500 },
] as const;
export type SlotSymbol = typeof SLOT_SYMBOLS[number]['key'];
export const SLOT_WEIGHT_TOTAL = SLOT_SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
export const TWO_CHERRIES_PAYS = 1;
export function slotMultiplier(reels: readonly SlotSymbol[]): number {
  if (reels[0] === reels[1] && reels[1] === reels[2]) return SLOT_SYMBOLS.find(symbol => symbol.key === reels[0])!.pays;
  return reels.filter(reel => reel === 'cherry').length === 2 ? TWO_CHERRIES_PAYS : 0;
}

// Packs: each pack holds PACK_SIZE items drawn by rarity; the chances are shown to players.
export const PACK_PRICE = 100;
export const PACK_SIZE = 4;
export const RARITIES = [
  { key: 'common', name: 'Common', percent: 70 },
  { key: 'rare', name: 'Rare', percent: 22 },
  { key: 'epic', name: 'Epic', percent: 7 },
  { key: 'legendary', name: 'Legendary', percent: 1 },
] as const;
export type Rarity = typeof RARITIES[number]['key'];
export const PACK_ITEMS = [
  { key: 'party-hat', name: 'Party hat', emoji: '🥳', rarity: 'common' }, { key: 'balloon', name: 'Balloon', emoji: '🎈', rarity: 'common' },
  { key: 'pizza', name: 'Cold pizza', emoji: '🍕', rarity: 'common' }, { key: 'sock', name: 'Lost sock', emoji: '🧦', rarity: 'common' },
  { key: 'rubber-duck', name: 'Rubber duck', emoji: '🦆', rarity: 'common' }, { key: 'cactus', name: 'Office cactus', emoji: '🌵', rarity: 'common' },
  { key: 'disco-ball', name: 'Disco ball', emoji: '🪩', rarity: 'rare' }, { key: 'microphone', name: 'Karaoke mic', emoji: '🎤', rarity: 'rare' },
  { key: 'dice', name: 'Lucky dice', emoji: '🎲', rarity: 'rare' }, { key: 'ufo', name: 'UFO', emoji: '🛸', rarity: 'rare' },
  { key: 'crown', name: 'Party crown', emoji: '👑', rarity: 'epic' }, { key: 'dragon', name: 'Dragon', emoji: '🐉', rarity: 'epic' },
  { key: 'unicorn', name: 'Unicorn', emoji: '🦄', rarity: 'epic' },
  { key: 'golden-trophy', name: 'Golden trophy', emoji: '🏆', rarity: 'legendary' }, { key: 'rocket', name: 'Moon rocket', emoji: '🚀', rarity: 'legendary' },
] as const satisfies readonly { key: string; name: string; emoji: string; rarity: Rarity }[];
export type PackItemKey = typeof PACK_ITEMS[number]['key'];

// Blackjack: against the dealer, an endless shuffled shoe, dealer stands on all 17s,
// blackjack pays 3 to 2, doubling on the first two cards. No splitting or insurance.
export const CardSchema = z.number().int().min(0).max(51);
export const cardRank = (card: number) => card % 13; // 0 = ace, 10 = jack, 11 = queen, 12 = king
export const cardSuit = (card: number) => Math.floor(card / 13);
export function handTotal(cards: readonly number[]): { total: number; soft: boolean } {
  let total = 0; let aces = 0;
  for (const card of cards) { const rank = cardRank(card); if (rank === 0) { aces++; total += 11; } else total += Math.min(rank + 1, 10); }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
export const BLACKJACK_OUTCOMES = ['blackjack', 'win', 'lose', 'push', 'bust'] as const;
export const BlackjackViewSchema = z.object({
  roundId: z.uuid(), step: z.number().int().min(0), bet: z.number().int().min(1),
  player: z.array(CardSchema), dealer: z.array(CardSchema.nullable()), playerTotal: z.number().int(), dealerTotal: z.number().int().nullable(),
  outcome: z.enum(BLACKJACK_OUTCOMES).nullable(), payout: z.number().int().min(0), canDouble: z.boolean(),
}).strict();
export type BlackjackView = z.infer<typeof BlackjackViewSchema>;

// Requests. Every go carries an id chosen by the phone: a retried request is the same go.
export const SlotSpinSchema = z.object({ roundId: z.uuid(), bet: BetSchema }).strict();
export const PackOpenSchema = z.object({ roundId: z.uuid() }).strict();
export const BlackjackStartSchema = z.object({ roundId: z.uuid(), bet: BetSchema }).strict();
/** `step` is the hand's step the phone saw: a repeated move does nothing twice. */
export const BlackjackMoveSchema = z.object({ roundId: z.uuid(), step: z.number().int().min(0).max(100), move: z.enum(['hit', 'stand', 'double']) }).strict();

export const SlotResultSchema = z.object({ roundId: z.uuid(), reels: z.array(z.enum(SLOT_SYMBOLS.map(symbol => symbol.key) as [SlotSymbol, ...SlotSymbol[]])).length(3), bet: z.number().int(), payout: z.number().int().min(0), balance: z.number().int() }).strict();
export type SlotResult = z.infer<typeof SlotResultSchema>;
export const PackResultSchema = z.object({ roundId: z.uuid(), items: z.array(z.string()).length(PACK_SIZE), balance: z.number().int() }).strict();
export type PackResult = z.infer<typeof PackResultSchema>;
export const BlackjackResultSchema = z.object({ hand: BlackjackViewSchema, balance: z.number().int() }).strict();

export const WalletSchema = z.object({
  enabled: z.boolean(), paused: z.boolean(),
  account: z.enum(['person', 'guest']), balance: z.number().int(), canRefill: z.boolean(), refills: z.number().int().min(0),
  collection: z.array(z.object({ itemKey: z.string(), count: z.number().int().min(1) }).strict()),
  blackjack: BlackjackViewSchema.nullable(),
}).strict();
export type Wallet = z.infer<typeof WalletSchema>;
export const GamblerRowSchema = z.object({
  name: z.string(), playerId: z.uuid().nullable(), person: z.boolean(),
  balance: z.number().int(), wagered: z.number().int().min(0), won: z.number().int().min(0), biggestWin: z.number().int().min(0), refills: z.number().int().min(0),
}).strict();
export type GamblerRow = z.infer<typeof GamblerRowSchema>;
/** This room's gamblers, and everyone with an account across all games. */
export const GamblingBoardSchema = z.object({ room: z.array(GamblerRowSchema), allTime: z.array(GamblerRowSchema) }).strict();
export type GamblingBoard = z.infer<typeof GamblingBoardSchema>;

/**
 * Whether the game needs this player right now; side games pause while it does.
 * Needed: an open round they can still answer (or a minigame, a vote, picking
 * teams themselves), but not show-only scenes, closed rounds, or once answered.
 */
export function playerNeeded(view: SessionView, selfId: string | null): boolean {
  const stage = view.stage;
  if (view.status !== 'RUNNING' || !stage || stage.status !== 'ACTIVE' || !selfId) return false;
  if (stage.kind === 'info' || stage.kind === 'scoreboard') return false;
  if (stage.teams?.forming) return stage.teams.formation === 'players';
  if (stage.kind === 'route') return stage.route?.canVote === true && !view.ownSubmission;
  if (stage.kind === 'challenge') return true;
  if (stage.teams && stage.teams.answers === 'captain') {
    const own = stage.teams.ownTeamIndex === null ? null : stage.teams.teams.find(team => team.index === stage.teams!.ownTeamIndex);
    if (own?.captainId !== selfId) return false;
  }
  return !view.ownSubmission;
}
