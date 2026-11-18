import { randomUUID } from 'node:crypto';
import { ChancesSchema, PACK_SIZE, RARITY_KEYS, type Chances, type PackItemView, type PackSetAdmin, type PackSetView, type RarityKey } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Transaction } from '../game/model.js';
import { secure, type Draw } from './rules.js';

// Pack sets and their items, made and changed by the owner (Admin → Chips & packs). Removing never takes
// anything from a collection: a removed set is archived, a removed item retired (no longer in packs).

type Db = PrismaClient | Transaction;
type ItemRow = { key: string; name: string; emoji: string; rarity: string; flavor: string; retiredAt: Date | null };
type SetRow = { id: string; name: string; price: number; onSale: boolean; sortOrder: number; chances: unknown; godPackOdds: number; items: ItemRow[] };
const STANDARD: Chances = { common: 70, rare: 22, epic: 7, legendary: 1 };
const chancesOf = (value: unknown): Chances => { const parsed = ChancesSchema.safeParse(value); return parsed.success ? parsed.data : STANDARD; };
const rarityOf = (value: string): RarityKey => (RARITY_KEYS as readonly string[]).includes(value) ? value as RarityKey : 'common';
export const itemView = (item: ItemRow): PackItemView => ({ key: item.key, name: item.name, emoji: item.emoji, rarity: rarityOf(item.rarity), flavor: item.flavor, retired: item.retiredAt !== null });
const setView = (set: SetRow): PackSetView => ({ id: set.id, name: set.name, price: set.price, chances: chancesOf(set.chances), godPackOdds: set.godPackOdds, items: set.items.filter(item => !item.retiredAt).map(itemView) });
const withItems = { items: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] } };

/** The sets players can buy: on sale, not archived, with at least one item. */
export async function setsOnSale(db: Db): Promise<PackSetView[]> {
  const sets = await db.packSet.findMany({ where: { onSale: true, archivedAt: null }, include: withItems, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return sets.map(setView).filter(set => set.items.length > 0);
}
/** Items from anywhere (any set, retired too), for collections. */
export async function itemsByKey(db: Db, keys: string[]): Promise<PackItemView[]> {
  return keys.length ? (await db.packItem.findMany({ where: { key: { in: keys } } })).map(itemView) : [];
}
/** Every set that is not archived, for the owner. */
export async function adminSets(db: Db): Promise<PackSetAdmin[]> {
  const sets = await db.packSet.findMany({ where: { archivedAt: null }, include: withItems, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return sets.map(set => ({ ...setView(set), onSale: set.onSale, sortOrder: set.sortOrder }));
}
/** A set that can be bought now, or null. */
export async function saleSet(db: Db, id: string) {
  const set = await db.packSet.findFirst({ where: { id, onSale: true, archivedAt: null }, include: withItems });
  return set ? setView(set) : null;
}

/**
 * Draws one pack from a set: each item's rarity by the set's chances (a rarity without items falls back to the
 * nearest one that has some), then an item of that rarity. With a god pack (1 in godPackOdds) every item is epic or
 * legendary, the last always legendary (falling back as above when the set has none).
 */
export function drawPack(set: PackSetView, draw: Draw = secure): { items: string[]; god: boolean } {
  const byRarity = new Map(RARITY_KEYS.map(rarity => [rarity, set.items.filter(item => item.rarity === rarity)]));
  const pick = (wanted: RarityKey) => {
    const order = [...RARITY_KEYS].sort((a, b) => Math.abs(RARITY_KEYS.indexOf(a) - RARITY_KEYS.indexOf(wanted)) - Math.abs(RARITY_KEYS.indexOf(b) - RARITY_KEYS.indexOf(wanted)) || RARITY_KEYS.indexOf(b) - RARITY_KEYS.indexOf(a));
    const choices = order.map(rarity => byRarity.get(rarity)!).find(list => list.length)!;
    return choices[draw(choices.length)]!.key;
  };
  const god = set.godPackOdds > 0 && draw(set.godPackOdds) === 0;
  if (god) return { god, items: Array.from({ length: PACK_SIZE }, (_, index) => pick(index === PACK_SIZE - 1 || draw(4) === 0 ? 'legendary' : 'epic')) };
  return { god, items: Array.from({ length: PACK_SIZE }, () => {
    let roll = draw(100); let rarity: RarityKey = 'common';
    for (const key of RARITY_KEYS) { if (roll < set.chances[key]) { rarity = key; break; } roll -= set.chances[key]; }
    return pick(rarity);
  }) };
}

/** The owner's changes. */
export const packAdmin = {
  async createSet(db: Db, input: { name: string; price: number; onSale: boolean; chances: Chances; godPackOdds: number }) {
    const last = await db.packSet.aggregate({ where: { archivedAt: null }, _max: { sortOrder: true } });
    return (await db.packSet.create({ data: { ...input, sortOrder: (last._max.sortOrder ?? -1) + 1 } })).id;
  },
  async updateSet(db: Db, id: string, input: { name: string; price: number; onSale: boolean; chances: Chances; godPackOdds: number }) {
    return (await db.packSet.updateMany({ where: { id, archivedAt: null }, data: input })).count === 1;
  },
  async archiveSet(db: Db, id: string) { return (await db.packSet.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date(), onSale: false } })).count === 1; },
  async addItem(db: Db, setId: string, input: { name: string; emoji: string; rarity: RarityKey; flavor: string }) {
    const last = await db.packItem.aggregate({ where: { setId }, _max: { sortOrder: true } });
    // A fresh key, never reused: collections refer to it.
    return (await db.packItem.create({ data: { key: `item-${randomUUID().slice(0, 18)}`, setId, ...input, sortOrder: (last._max.sortOrder ?? -1) + 1 } })).key;
  },
  async updateItem(db: Db, key: string, input: { name: string; emoji: string; rarity: RarityKey; flavor: string }) {
    return (await db.packItem.updateMany({ where: { key, retiredAt: null }, data: input })).count === 1;
  },
  async retireItem(db: Db, key: string) { return (await db.packItem.updateMany({ where: { key, retiredAt: null }, data: { retiredAt: new Date() } })).count === 1; },
};
