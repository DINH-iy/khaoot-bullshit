import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEVICE_LOG_BODY_MAX, DEVICE_LOG_EVENTS_MAX, NewDeviceLogSchema } from '../src/index.js';

const log = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(), reason: 'problem', summary: 'GAME_UNAVAILABLE · POST /api/arcade/lobbies/1a2b3c4d/start',
  sessionId: null, lobbyId: randomUUID(), playerId: null,
  device: { id: 'a1b2c3d4', role: 'player', userAgent: 'Test', viewport: { width: 390, height: 844 } },
  stats: { heartbeat: null, requests: { count: 3, median: 40, max: 120 }, longTasks: null, reconnects: 0 },
  events: [{ at: Date.now(), kind: 'request', screen: 'player phone', what: 'POST /api/arcade/lobbies/1a2b3c4d/start', code: 'GAME_UNAVAILABLE', requestId: randomUUID(), ms: 35 }],
  ...overrides,
});
const longest = { at: Date.now(), kind: 'request', screen: 's'.repeat(40), what: 'w'.repeat(160), code: 'c'.repeat(60), requestId: 'r'.repeat(36), ms: 600_000, n: 1_000_000 };

describe('device logs', () => {
  it('accepts a log and cuts over-long text instead of losing the whole log', () => {
    const parsed = NewDeviceLogSchema.parse(log({ summary: 'x'.repeat(1000), events: [{ ...longest, what: 'w'.repeat(5000) }] }));
    expect(parsed.summary).toHaveLength(300); expect(parsed.events[0]!.what).toHaveLength(160);
  });

  it('refuses too many events, unknown event kinds and unknown fields', () => {
    expect(NewDeviceLogSchema.safeParse(log({ events: Array(DEVICE_LOG_EVENTS_MAX + 1).fill(longest) })).success).toBe(false);
    expect(NewDeviceLogSchema.safeParse(log({ events: [{ ...longest, kind: 'keystroke' }] })).success).toBe(false);
    expect(NewDeviceLogSchema.safeParse(log({ events: [{ ...longest, value: 'typed text' }] })).success).toBe(false);
    expect(NewDeviceLogSchema.safeParse(log({ token: 'x' })).success).toBe(false);
    expect(NewDeviceLogSchema.safeParse(log({ reason: 'whenever' })).success).toBe(false);
  });

  it('fits the largest allowed log within the request size limit', () => {
    const largest = log({ summary: 'x'.repeat(300), events: Array(DEVICE_LOG_EVENTS_MAX).fill(longest) });
    expect(NewDeviceLogSchema.safeParse(largest).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(largest))).toBeLessThan(DEVICE_LOG_BODY_MAX);
  });
});
