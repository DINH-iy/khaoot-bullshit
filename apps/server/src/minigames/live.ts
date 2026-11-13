import { MAX_TAPS_PER_SECOND } from './rules.js';

/**
 * Short-lived signals from connected phones that help the server judge
 * minigame results fairly: each phone's measured network delay, and the taps
 * the server saw during a tap race. Memory only and bounded: after a restart
 * it is simply empty, and results fall back to the plain bounds checks.
 * Nothing here is game state; the saved result is the durable record.
 */
export interface LiveSignals {
  /** Median round trip to this player's phone, or null when not measured yet. */
  latencyMs(sessionId: string, playerId: string): number | null;
  /** Taps seen for this race (`null`: none from this player), and whether the server saw taps from anyone in it. */
  taps(stageRunId: string, startsAt: string, playerId: string): { seen: number | null; streamed: boolean };
}

const MAX_PLAYERS_TRACKED = 2048; const MAX_RACES_TRACKED = 256; const SAMPLES = 7;
interface Race { startsAt: string; endsAt: number; counts: Map<string, { count: number; at: number }>; touched: number }

export function createLiveSignals(now: () => number = Date.now) {
  const latency = new Map<string, number[]>(); const races = new Map<string, Race>();
  const evict = <K, V>(map: Map<K, V>, max: number) => { while (map.size > max) map.delete(map.keys().next().value as K); };
  return {
    recordLatency(sessionId: string, playerId: string, ms: number) {
      if (!Number.isFinite(ms) || ms < 0 || ms > 30_000) return;
      const key = `${sessionId}:${playerId}`; const samples = latency.get(key) ?? []; latency.delete(key);
      latency.set(key, [...samples.slice(-(SAMPLES - 1)), ms]); evict(latency, MAX_PLAYERS_TRACKED);
    },
    forgetPlayer(sessionId: string, playerId: string) { latency.delete(`${sessionId}:${playerId}`); },
    /**
     * A phone's running tap count. Accepted only while the race runs, only going
     * up, and never faster than a person can tap since the last report.
     * Returns the count the server believes, or null when the report is refused.
     */
    recordTaps(stageRunId: string, startsAt: string, seconds: number, playerId: string, count: number): number | null {
      const at = now(); const start = Date.parse(startsAt); const endsAt = start + seconds * 1000;
      if (!Number.isInteger(count) || count < 0 || at < start - 500 || at > endsAt + 1500) return null;
      let race = races.get(stageRunId);
      if (!race || race.startsAt !== startsAt) { race = { startsAt, endsAt, counts: new Map(), touched: at }; races.set(stageRunId, race); evict(races, MAX_RACES_TRACKED); }
      race.touched = at;
      const previous = race.counts.get(playerId) ?? { count: 0, at: start };
      // A small burst allowance covers taps that arrive together after a hiccup.
      const possible = previous.count + Math.ceil(MAX_TAPS_PER_SECOND * Math.max(0, Math.min(at, endsAt) - previous.at) / 1000) + 3;
      const accepted = Math.max(previous.count, Math.min(count, possible));
      race.counts.set(playerId, { count: accepted, at: Math.min(at, endsAt) });
      return accepted;
    },
    progress(stageRunId: string) {
      const race = races.get(stageRunId);
      return race ? [...race.counts.entries()].map(([playerId, entry]) => ({ playerId, count: entry.count })) : [];
    },
    signals: {
      latencyMs(sessionId: string, playerId: string) {
        const samples = [...(latency.get(`${sessionId}:${playerId}`) ?? [])].sort((a, b) => a - b);
        return samples.length ? samples[Math.floor(samples.length / 2)]! : null;
      },
      taps(stageRunId: string, startsAt: string, playerId: string) {
        const race = races.get(stageRunId); if (!race || race.startsAt !== startsAt) return { seen: null, streamed: false };
        return { seen: race.counts.get(playerId)?.count ?? null, streamed: race.counts.size > 0 };
      },
    } satisfies LiveSignals,
  };
}
export type Live = ReturnType<typeof createLiveSignals>;
