import type { PrismaClient } from '../generated/prisma/client.js';

// The creator record behind local owner hosting. The owner and editors work on
// its games (and prefabs); rooms the owner opens are hosted by it.
const OWNER = { issuer: 'urn:local-owner', subject: 'owner' };
export const ownerCreator = (client: PrismaClient) => client.creator.upsert({ where: { issuer_subject: OWNER }, create: OWNER, update: {} });
