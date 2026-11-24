import { z } from 'zod';

/** The names teams get unless the author names them (in this order). */
export const DEFAULT_TEAM_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Teal', 'White', 'Black', 'Gold', 'Silver'];
/** A team's colour: a solid `#rrggbb` (no see-through colours, so the team stays readable everywhere). */
export const TeamColorSchema = z.string().regex(/^#[0-9a-f]{6}$/);
/**
 * The team colours offered to players (and as quick picks to the host, who may also pick any colour).
 * Bright enough to read as a stripe or flag on dark and light looks, and easy to tell apart.
 */
export const TEAM_SWATCHES = ['#e8505b', '#36a2eb', '#5fb84a', '#e6b422', '#8e5be8', '#f28c28', '#f07aa8', '#2bb3a3', '#8d6e63', '#9aa0ad', '#4f6ae0', '#c2185b'] as const;
/** The colour a team starts with: its own colour when it is named after one (Red, Blue…), else the next of the swatches. */
const NAMED: Record<string, string> = { red: '#e8505b', blue: '#36a2eb', green: '#5fb84a', yellow: '#e6b422', purple: '#8e5be8', orange: '#f28c28', pink: '#f07aa8', teal: '#2bb3a3', white: '#b0adbd', black: '#4a4560', gold: '#c99a1f', silver: '#9aa0ad' };
export const defaultTeamColor = (name: string, index: number) => NAMED[name.trim().toLowerCase()] ?? TEAM_SWATCHES[index % TEAM_SWATCHES.length]!;
