import { DEFAULT_ECONOMY, EconomySchema, type Economy } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Transaction } from '../game/model.js';

// The chip economy (start chips, what playing earns): the owner's setting, one row in site_settings.
// A missing or invalid row means the standard values, so the games always work.
export async function readEconomy(db: PrismaClient | Transaction): Promise<Economy> {
  const row = await db.siteSetting.findUnique({ where: { key: 'economy' } });
  const parsed = EconomySchema.safeParse(row?.value); return parsed.success ? parsed.data : DEFAULT_ECONOMY;
}
export async function writeEconomy(db: PrismaClient | Transaction, economy: Economy) {
  await db.siteSetting.upsert({ where: { key: 'economy' }, create: { key: 'economy', value: economy }, update: { value: economy } });
}
