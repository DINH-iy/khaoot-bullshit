import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { statfs } from 'node:fs/promises';
import type { AdminHealth } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { DatabaseHealth } from '../database/client.js';
import type { RequestMetrics } from '../diagnostics/observability.js';
import { roomUpdateFilters, unreviewedProblems } from './health-recovery.js';

type Level = AdminHealth['level'];
type Part = AdminHealth['parts'][number];
const worst = (levels: Level[]): Level => levels.includes('problem') ? 'problem' : levels.includes('check') ? 'check' : 'ok';
const bytes = (value: number) => value < 1024 ** 3 ? `${(value / 1024 ** 2).toFixed(0)} MB` : `${(value / 1024 ** 3).toFixed(1)} GB`;
const duration = (seconds: number) => seconds < 3600 ? `${Math.round(seconds / 60)} min` : seconds < 172_800 ? `${(seconds / 3600).toFixed(1)} h` : `${Math.round(seconds / 86_400)} days`;

/**
 * The health page's numbers, read now. Each part has a verdict: ok, check (worth a look) or problem (something
 * does not work). Thresholds are deliberately simple; they are a first look, not an alerting system.
 */
export async function readHealth(client: PrismaClient, deps: { version: string; metrics: RequestMetrics; database: DatabaseHealth; connections: () => number; connectedRoomIds: () => string[]; mediaDirectory: string }): Promise<AdminHealth> {
  const now = Date.now(); const parts: Part[] = [];
  let recovery: AdminHealth['recovery'];
  // Server: up since, memory, how busy, requests and errors since it started.
  const metrics = deps.metrics.snapshot();
  const errorShare = metrics.requests ? metrics.serverErrors / metrics.requests : 0;
  const server: Level = metrics.eventLoopP99Ms > 200 || errorShare > 0.05 ? 'problem' : metrics.eventLoopP99Ms > 80 || metrics.serverErrors > 0 ? 'check' : 'ok';
  parts.push({ key: 'server', level: server, facts: [
    { label: 'Running for', value: duration(metrics.uptimeSeconds) }, { label: 'Version', value: deps.version }, { label: 'Node', value: process.version },
    { label: 'Memory used', value: bytes(metrics.memory.rssBytes) }, { label: 'Slowest moments (event loop, 99%)', value: `${metrics.eventLoopP99Ms.toFixed(0)} ms` },
    { label: 'Requests since start', value: String(metrics.requests) }, { label: 'Server errors since start', value: String(metrics.serverErrors) },
  ] });
  // Database: reachable and how fast, its connections, and whether every migration went through.
  let reachable = true; const started = performance.now();
  try { await deps.database.check(); } catch { reachable = false; }
  const roundTrip = performance.now() - started; const pool = deps.database.snapshot();
  const migrations = reachable ? await client.$queryRaw<{ applied: bigint; failed: bigint }[]>`SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::bigint AS applied, count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::bigint AS failed FROM _prisma_migrations`.catch(() => null) : null;
  const failed = Number(migrations?.[0]?.failed ?? 0);
  const database: Level = !reachable || failed > 0 ? 'problem' : roundTrip > 250 || pool.waitingRequests > 0 ? 'check' : 'ok';
  parts.push({ key: 'database', level: database, facts: [
    { label: 'Reachable', value: reachable ? 'yes' : 'no' }, { label: 'Answer time', value: `${roundTrip.toFixed(0)} ms` },
    { label: 'Connections in use', value: `${pool.totalConnections - pool.idleConnections} of ${pool.poolMax}` }, { label: 'Waiting for a connection', value: String(pool.waitingRequests) },
    { label: 'Migrations applied', value: migrations ? String(Number(migrations[0]?.applied ?? 0)) : 'unknown' }, ...(failed ? [{ label: 'Migrations that failed', value: String(failed) }] : []),
  ] });
  if (reachable) {
    const filters = roomUpdateFilters(deps.connectedRoomIds(), now);
    const [open, waiting, oldest, retryable, obsolete] = await Promise.all([
      client.gameSession.count({ where: { status: { not: 'FINISHED' }, roomCode: { not: null } } }),
      client.outboxEvent.count({ where: filters.connected }),
      client.outboxEvent.findFirst({ where: filters.connected, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      client.outboxEvent.count({ where: filters.retryable }),
      client.outboxEvent.count({ where: filters.obsolete }),
    ]);
    const behind = oldest ? (now - oldest.createdAt.getTime()) / 1000 : 0;
    parts.push({ key: 'rooms', level: behind > 120 ? 'problem' : behind > 15 || retryable > 0 ? 'check' : 'ok', facts: [
      { label: 'Open rooms', value: String(open) }, { label: 'Devices connected now', value: String(deps.connections()) },
      { label: 'Updates waiting for connected rooms', value: String(waiting) }, ...(oldest ? [{ label: 'Oldest waiting', value: `${Math.round(behind)} s` }] : []),
      { label: 'Updates that need retrying', value: String(retryable) }, { label: 'Old updates from finished rooms', value: String(obsolete) },
    ] });
    // Problems: the server's own errors and devices' problem reports, last 24 hours.
    const unreviewed = unreviewedProblems(now);
    const [serverErrors, deviceProblems] = await Promise.all([
      client.deviceLog.count({ where: { ...unreviewed, source: 'SERVER' } }),
      client.deviceLog.count({ where: { ...unreviewed, source: { not: 'SERVER' }, reason: 'problem' } }),
    ]);
    recovery = { retryable, obsolete, unreviewed: serverErrors + deviceProblems };
    parts.push({ key: 'problems', level: serverErrors > 10 ? 'problem' : serverErrors > 0 || deviceProblems > 0 ? 'check' : 'ok', facts: [
      { label: 'Unreviewed server errors, last 24 hours', value: String(serverErrors) }, { label: 'Unreviewed device reports, last 24 hours', value: String(deviceProblems) },
    ] });
  }
  // The machine: free disk where files are kept, free memory, and processor load.
  const disk = await statfs(deps.mediaDirectory).then(stats => ({ free: Number(stats.bavail) * Number(stats.bsize), total: Number(stats.blocks) * Number(stats.bsize) }), () => null);
  const freeShare = disk ? disk.free / Math.max(1, disk.total) : 1; const load = loadavg()[0] ?? 0; const cores = Math.max(1, cpus().length);
  parts.push({ key: 'machine', level: freeShare < 0.05 ? 'problem' : freeShare < 0.15 || load > cores ? 'check' : 'ok', facts: [
    ...(disk ? [{ label: 'Free disk', value: `${bytes(disk.free)} of ${bytes(disk.total)}` }] : [{ label: 'Free disk', value: 'unknown' }]),
    { label: 'Free memory', value: `${bytes(freemem())} of ${bytes(totalmem())}` }, { label: 'Processor load (1 min)', value: `${load.toFixed(2)} on ${cores} cores` },
  ] });
  return { checkedAt: new Date(now).toISOString(), version: deps.version, level: worst(parts.map(part => part.level)), parts, recovery };
}
