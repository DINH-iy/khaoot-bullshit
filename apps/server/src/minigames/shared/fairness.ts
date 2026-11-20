/** Allowed difference between a phone's clock (after correction) and the server's. */
export const CLOCK_SLACK_MS = 2000;

/** What the server knows about the phone that sent a result (see live.ts). */
export interface Fairness { latencyMs: number | null; taps: { seen: number | null; streamed: boolean } }
export const NO_FAIRNESS: Fairness = { latencyMs: null, taps: { seen: null, streamed: false } };
/**
 * How much earlier than its arrival a phone may say it acted: the delay of the
 * GO message to the phone plus the result coming back (about one round trip),
 * with room for drawing the screen. Capped, so a phone that answers pings
 * slowly on purpose cannot buy itself time.
 */
export const networkAllowance = (latencyMs: number | null) => latencyMs === null ? 450 : Math.round(Math.min(600, Math.max(200, latencyMs * 1.3 + 150)));
