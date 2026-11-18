import { z } from 'zod';

/**
 * The chip economy and pack sets, all settings of the owner (Admin → Chips & packs), stored on the server.
 * Rarities are fixed (common, rare, epic, legendary); how likely each is, is per pack set.
 */
export const RARITY_KEYS = ['common', 'rare', 'epic', 'legendary'] as const;
export const RarityKeySchema = z.enum(RARITY_KEYS);
export type RarityKey = z.infer<typeof RarityKeySchema>;
export const RARITY_NAMES: Record<RarityKey, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

const Amount = z.number().int().min(0).max(100_000);
/** Start chips and what playing earns (rooms with chips on; see side-games/earnings.ts). */
export const EconomySchema = z.object({
  startChips: Amount,
  earn: z.object({ perPoint: z.number().int().min(0).max(100), place: z.tuple([Amount, Amount, Amount]), played: Amount, roundWin: Amount, arcadeWin: Amount }).strict(),
}).strict();
export type Economy = z.infer<typeof EconomySchema>;
export const DEFAULT_ECONOMY: Economy = { startChips: 200, earn: { perPoint: 1, place: [150, 100, 50], played: 25, roundWin: 25, arcadeWin: 25 } };

/** The chance of each rarity in a pack, in percent; they add up to 100. */
export const ChancesSchema = z.object({ common: z.number().int().min(0).max(100), rare: z.number().int().min(0).max(100), epic: z.number().int().min(0).max(100), legendary: z.number().int().min(0).max(100) }).strict()
  .refine(chances => chances.common + chances.rare + chances.epic + chances.legendary === 100, 'The chances add up to 100');
export type Chances = z.infer<typeof ChancesSchema>;

/** An item: its picture (`image`, a URL) when the owner uploaded one, otherwise its emoji. */
export const PackItemViewSchema = z.object({ key: z.string(), name: z.string(), emoji: z.string(), image: z.string().nullable(), rarity: RarityKeySchema, flavor: z.string(), retired: z.boolean() }).strict();
/** Item pictures: PNG, square, at most this many pixels a side (made on the owner's device, cleaned on the server). */
export const PACK_PICTURE_SIDE = 256;
export type PackItemView = z.infer<typeof PackItemViewSchema>;
/**
 * A pack set as players see it: its price, a percentage off while it is on sale (`sale`, null otherwise), its
 * chances and its items (retired ones only shown to whoever has them).
 */
export const PackSetViewSchema = z.object({ id: z.uuid(), name: z.string(), price: z.number().int().min(0), sale: z.number().int().min(1).max(99).nullable(), chances: ChancesSchema,
  godPackOdds: z.number().int().min(0), items: z.array(PackItemViewSchema) }).strict();
export type PackSetView = z.infer<typeof PackSetViewSchema>;
/** What a pack of the set costs now: the price, less the sale percentage while on sale (rounded). */
export const packPrice = (set: { price: number; sale: number | null }) => set.sale ? Math.round(set.price * (100 - set.sale) / 100) : set.price;

/** The owner's view of a set: also whether players see it (active), the sale settings and its place in the list. */
export const PackSetAdminSchema = PackSetViewSchema.extend({ active: z.boolean(), onSale: z.boolean(), salePercent: z.number().int().min(1).max(99), sortOrder: z.number().int() }).strict();
export type PackSetAdmin = z.infer<typeof PackSetAdminSchema>;
export const PackAdminSchema = z.object({ economy: EconomySchema, sets: z.array(PackSetAdminSchema) }).strict();
export type PackAdmin = z.infer<typeof PackAdminSchema>;

/** What the owner sends when making or changing a set (items are changed one by one). */
export const PackSetInputSchema = z.object({ name: z.string().trim().min(1).max(60), price: z.number().int().min(0).max(100_000), active: z.boolean(), onSale: z.boolean(),
  salePercent: z.number().int().min(1).max(99), chances: ChancesSchema,
  godPackOdds: z.number().int().min(0).max(1_000_000) }).strict();
export const PackItemInputSchema = z.object({ name: z.string().trim().min(1).max(40), emoji: z.string().trim().max(16), rarity: RarityKeySchema, flavor: z.string().trim().max(120) }).strict();
