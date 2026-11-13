import { z } from 'zod';

const Milli = z.string().regex(/^(0|[1-9][0-9]{0,11})$/);

/**
 * The minigame catalog: what each minigame is, its settings and how its result
 * reads. Phones measure their own play (fair over slow networks) and send one
 * result; the server checks it is possible and ranks everyone. Rules that must
 * stay secret (what is behind each door) live only on the server.
 */
export const MinigameSettingsSchemas = {
  // Wait for GO, then tap as fast as possible. Tapping early is a false start.
  reaction: z.object({ minWaitMs: z.number().int().min(1000).max(10_000), maxWaitMs: z.number().int().min(1000).max(15_000) }).strict()
    .refine(settings => settings.minWaitMs <= settings.maxWaitMs, 'The shortest wait must not be longer than the longest'),
  // Tap as often as possible before the time runs out.
  'tap-race': z.object({ seconds: z.number().int().min(3).max(60) }).strict(),
  // Stop a clock at exactly the target; it disappears after a while.
  'stop-clock': z.object({ targetMs: z.number().int().min(2000).max(60_000), visibleMs: z.number().int().min(0).max(60_000) }).strict()
    .refine(settings => settings.visibleMs < settings.targetMs, 'The clock must disappear before the target'),
  // Pick a door; each door hides points, shuffled for every game.
  'lucky-doors': z.object({ doorsMilli: z.array(Milli).min(2).max(8) }).strict(),
  // Draw one circle in one stroke; the server scores how round it is.
  'perfect-circle': z.object({ seconds: z.number().int().min(3).max(30) }).strict(),
  // Pass the pencil: each team draws one picture, members taking turns; then everyone votes for the best (not their own).
  'relay-drawing': z.object({ secondsPerTurn: z.number().int().min(5).max(60), voteSeconds: z.number().int().min(10).max(120) }).strict(),
} as const;
export type MinigameKey = keyof typeof MinigameSettingsSchemas;
export type MinigameSettings<K extends MinigameKey = MinigameKey> = z.infer<typeof MinigameSettingsSchemas[K]>;
export const MINIGAME_KEYS = Object.keys(MinigameSettingsSchemas) as MinigameKey[];
export const isMinigameKey = (key: string): key is MinigameKey => key in MinigameSettingsSchemas;

/** Countdown before every minigame starts, so all phones begin together. */
export const MINIGAME_COUNTDOWN_MS = 3000;

export interface MinigameInfo {
  name: string; description: string; howToPlay: string;
  /** How results compare: higher, lower, or no ranking (points come straight from the game). */
  better: 'higher' | 'lower' | 'none';
  defaults: MinigameSettings; defaultSeconds: number;
}
export const MINIGAMES: { [K in MinigameKey]: MinigameInfo & { defaults: MinigameSettings<K> } } = {
  reaction: { name: 'Reaction duel', description: 'Wait for GO, then tap first.', howToPlay: 'Wait until your screen says GO, then tap as fast as you can. Tap too early and you are out.',
    better: 'lower', defaults: { minWaitMs: 2000, maxWaitMs: 6000 }, defaultSeconds: 20 },
  'tap-race': { name: 'Tap race', description: 'Tap as often as you can.', howToPlay: 'When it starts, tap the big button as often as you can until the time runs out.',
    better: 'higher', defaults: { seconds: 10 }, defaultSeconds: 20 },
  'stop-clock': { name: 'Stop the clock', description: 'Stop a vanishing clock at exactly the target.', howToPlay: 'A clock starts counting. It disappears after a while. Tap Stop when you think it reaches the target.',
    better: 'lower', defaults: { targetMs: 10_000, visibleMs: 3000 }, defaultSeconds: 30 },
  'lucky-doors': { name: 'Lucky doors', description: 'Pick a door and hope for the best.', howToPlay: 'Choose one door. Each door hides a number of points. Nobody knows which is which.',
    better: 'none', defaults: { doorsMilli: ['0', '5000', '10000'] }, defaultSeconds: 20 },
  'perfect-circle': { name: 'Perfect circle', description: 'Draw the roundest circle.', howToPlay: 'Draw one circle with one finger, in one go. The roundest circle wins.',
    better: 'higher', defaults: { seconds: 10 }, defaultSeconds: 25 },
  'relay-drawing': { name: 'Pass the pencil', description: 'Teams draw one picture together, taking turns; then everyone votes.', howToPlay: 'Your team draws one picture. Each player adds to it in turn. Then vote for the best drawing of another team.',
    better: 'higher', defaults: { secondsPerTurn: 15, voteSeconds: 30 }, defaultSeconds: 120 },
};
/** Minigames that only work as a team round. */
export const TEAM_MINIGAMES: readonly MinigameKey[] = ['relay-drawing'];

/** Settings for a minigame, or null when they do not fit it. */
export function parseMinigameSettings(game: string, settings: unknown): MinigameSettings | null {
  if (!isMinigameKey(game)) return null;
  const parsed = MinigameSettingsSchemas[game].safeParse(settings ?? MINIGAMES[game].defaults);
  return parsed.success ? parsed.data : null;
}

/** A result in words, for screens: "231 ms", "57 taps", "0.12 s off", "Door 2". */
export function formatMinigameResult(game: MinigameKey, value: number | null, settings: MinigameSettings): string {
  if (value === null) return game === 'reaction' ? 'False start' : 'No result';
  if (game === 'reaction') return `${value} ms`;
  if (game === 'tap-race') return `${value} ${value === 1 ? 'tap' : 'taps'}`;
  if (game === 'stop-clock') { const off = Math.abs(value - (settings as MinigameSettings<'stop-clock'>).targetMs) / 1000; return `${(value / 1000).toFixed(2)} s · ${off.toFixed(2)} s off`; }
  if (game === 'perfect-circle') return `${(value / 10).toFixed(1)}% round`;
  if (game === 'relay-drawing') return `${value} ${value === 1 ? 'vote' : 'votes'}`;
  return `Door ${value + 1}`;
}

/** What a phone sends: one number whose meaning depends on the minigame (see the catalog). */
// `stroke`: the circle drawn in Perfect circle (scored by the server); `teamId`: the team voted for in Pass the pencil.
export const MinigameValueSchema = z.object({ kind: z.literal('minigame'), value: z.number().int().min(0).max(600_000), early: z.literal(true).optional(),
  stroke: z.array(z.number().int().min(0).max(1000)).min(24).max(800).optional(), teamId: z.string().uuid().optional() }).strict();

/** The minigame as a screen sees it while it runs. Never contains secret parts (which door hides what). */
export const PublicMinigameSchema = z.object({
  game: z.enum(MINIGAME_KEYS as [MinigameKey, ...MinigameKey[]]), settings: z.record(z.string(), z.unknown()),
  // Server time: when the countdown ends and play begins (null while teams are being made), and for a reaction duel, when GO shows.
  startsAt: z.string().datetime().nullable(), goAt: z.string().datetime().nullable(),
  // Pass the pencil: the turns, who draws when, each team's parts so far (everyone may watch), and when voting starts.
  relay: z.object({ turns: z.number().int().min(1), voteAt: z.string().datetime().nullable(),
    teams: z.array(z.object({ teamId: z.string().uuid(), name: z.string(), drawers: z.array(z.string().uuid()), parts: z.array(z.object({ turn: z.number().int().min(0), assetId: z.string().uuid() }).strict()) }).strict()) }).strict().nullable(),
}).strict();
/** After the reveal: everyone's result and place, and for lucky doors what was behind each door. */
export const MinigameRevealSchema = z.object({
  kind: z.literal('minigame'), game: z.enum(MINIGAME_KEYS as [MinigameKey, ...MinigameKey[]]),
  entries: z.array(z.object({ playerId: z.string().uuid().nullable(), teamId: z.string().uuid().nullable(), value: z.number().int().nullable(), place: z.number().int().min(1).nullable(),
    stroke: z.array(z.number().int()).optional() }).strict()),
  doorsMilli: z.array(Milli).nullable(),
}).strict();
