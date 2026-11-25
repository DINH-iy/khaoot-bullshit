import { DEVICE_LOG_EVENTS_MAX, type DeviceEvent, type DeviceStats } from '@party/contracts';

/** How long an event is kept on the device. A long game keeps its last half hour. */
export const LOG_MAX_AGE_MS = 30 * 60 * 1000;
/** Repeated taps on the same control this close together count as one event with a count. */
const REPEAT_MS = 5000;
const SAMPLES = 200;

/** Count, median and maximum of a stream of durations, from the last 200 for the median. */
export class Timing {
  private samples: number[] = []; private count = 0; private max = 0;
  add(ms: number) {
    const value = Math.max(0, Math.min(600_000, Math.round(ms)));
    this.count++; this.max = Math.max(this.max, value);
    this.samples.push(value); if (this.samples.length > SAMPLES) this.samples.shift();
  }
  summary() {
    if (!this.count) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return { count: this.count, median: sorted[Math.floor(sorted.length / 2)]!, max: this.max };
  }
}

/**
 * The device's own record of the last few minutes: at most 300 events, none older than half an hour.
 * Plain data in memory; capture.ts fills it and send.ts sends it.
 */
export class DeviceLog {
  private events: DeviceEvent[] = []; private lastTapAt = 0;
  readonly heartbeat = new Timing(); readonly requests = new Timing(); readonly longTasks = new Timing();
  reconnects = 0;
  constructor(private readonly capacity = DEVICE_LOG_EVENTS_MAX, private readonly maxAgeMs = LOG_MAX_AGE_MS) {}

  add(event: DeviceEvent) {
    const last = this.events.at(-1); const previousTap = this.lastTapAt;
    if (event.kind === 'tap') this.lastTapAt = event.at;
    if (event.kind === 'tap' && last?.kind === 'tap' && last.what === event.what && last.screen === event.screen && event.at - previousTap < REPEAT_MS) {
      last.n = (last.n ?? 1) + 1; return;
    }
    this.events.push(event); this.trim(event.at);
  }

  /** The events still within the age limit, oldest first. */
  list(now = Date.now()): DeviceEvent[] { this.trim(now); return this.events.map(event => ({ ...event })); }

  stats(): DeviceStats {
    return { heartbeat: this.heartbeat.summary(), requests: this.requests.summary(), longTasks: this.longTasks.summary(), reconnects: this.reconnects };
  }

  /** Brings back events kept over a reload; anything malformed is dropped. */
  restore(events: unknown, now = Date.now()) {
    if (!Array.isArray(events)) return;
    const kept = events.filter((event): event is DeviceEvent => typeof event === 'object' && event !== null && typeof (event as DeviceEvent).at === 'number' && typeof (event as DeviceEvent).what === 'string');
    this.events = [...kept, ...this.events].sort((a, b) => a.at - b.at); this.trim(now);
  }

  private trim(now: number) {
    const oldest = now - this.maxAgeMs;
    let drop = 0; while (drop < this.events.length && this.events[drop]!.at < oldest) drop++;
    if (this.events.length - drop > this.capacity) drop = this.events.length - this.capacity;
    if (drop) this.events.splice(0, drop);
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/**
 * A request's address as it goes in a log: the path only (no query, no hash), ids shortened to their first
 * 8 characters, and any other long token-like part cut, so no key or token is ever kept.
 */
export function logPath(url: string): string {
  const path = url.split(/[?#]/, 1)[0] ?? '';
  return path.replace(UUID, id => id.slice(0, 8)).split('/').map(part => part.length > 24 ? `${part.slice(0, 6)}…` : part).join('/').slice(0, 120);
}

/** Codes that mean the server or the app failed, as opposed to an ordinary refusal like TOO_LATE. */
export const UNEXPECTED_CODES = new Set(['GAME_UNAVAILABLE', 'INTERNAL_ERROR', 'timeout', 'invalid reply', 'server error']);
