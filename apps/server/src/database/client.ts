import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export interface DatabaseHealth {
  check(): Promise<void>;
  close(): Promise<void>;
  snapshot(): { poolMax: number; totalConnections: number; idleConnections: number; waitingRequests: number; lastCheckMs: number | null; healthy: boolean | null };
}

export function createDatabase(connectionString: string, poolMax = 5, onPoolError?: () => void) {
  const pool = new pg.Pool({ connectionString, max: poolMax, connectionTimeoutMillis: 2000, idleTimeoutMillis: 10000, query_timeout: 3000 });
  // Pool errors are observed without logging connection strings or query values.
  let healthy: boolean | null = null;
  let lastCheckMs: number | null = null;
  pool.on('error', () => { healthy = false; onPoolError?.(); });
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  const client = new PrismaClient({ adapter, log: [], errorFormat: 'minimal', transactionOptions: { maxWait: 2000, timeout: 5000 } });
  return {
    client,
    async check(): Promise<void> {
      const start = performance.now();
      try { await client.$queryRaw`SELECT 1`; healthy = true; }
      catch (error) { healthy = false; throw error; }
      finally { lastCheckMs = performance.now() - start; }
    },
    async close(): Promise<void> { await client.$disconnect(); },
    snapshot() { return { poolMax, totalConnections: pool.totalCount, idleConnections: pool.idleCount, waitingRequests: pool.waitingCount, lastCheckMs, healthy }; },
  };
}
