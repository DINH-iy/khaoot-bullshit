import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

// Fixed buckets and fixed route names: memory does not grow with players or requests.
const limits = [10, 25, 50, 100, 250, 500, 1000, 5000, Infinity];
export class RequestMetrics {
  private counts = limits.map(() => 0);
  private total = 0;
  private failures = 0;
  private sumMs = 0;
  private loop = monitorEventLoopDelay({ resolution: 20 });
  constructor() { this.loop.enable(); }
  record(durationMs: number, statusCode: number): void {
    this.total++;
    this.sumMs += durationMs;
    if (statusCode >= 500) this.failures++;
    const index = limits.findIndex(limit => durationMs <= limit);
    this.counts[index] = (this.counts[index] ?? 0) + 1;
  }
  snapshot() {
    return {
      requests: this.total,
      serverErrors: this.failures,
      durationSumMs: this.sumMs,
      durationBuckets: limits.map((limit, index) => ({ upperBoundMs: Number.isFinite(limit) ? limit : 'infinity', count: this.counts[index] })),
      eventLoopP99Ms: this.loop.count ? this.loop.percentile(99) / 1e6 : 0,
      uptimeSeconds: process.uptime(),
      memory: { rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed },
    };
  }
  close(): void { this.loop.disable(); }
}
export const now = () => performance.now();
