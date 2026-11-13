import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { GameDefinition, StageDefinition } from './definition.js';
import { locateStage } from './graph.js';
import { requireGame } from './errors.js';
import type { Transaction } from './model.js';

/** Stored on the stage run where the wheel was spun. */
export const WheelSpinSchema = z.object({ wheel: z.string(), entryKey: z.string(), index: z.number().int().min(0), spunAt: z.string().datetime() }).strict();
export type WheelSpin = z.infer<typeof WheelSpinSchema>;
export const readSpin = (presentation: unknown): WheelSpin | null => {
  const parsed = WheelSpinSchema.safeParse((presentation as { wheelSpin?: unknown } | null)?.wheelSpin);
  return parsed.success ? parsed.data : null;
};
const wheelOf = (definition: GameDefinition, key: string) => definition.wheels?.find(wheel => wheel.key === key) ?? null;
type Run = { id: string; number: number; nodeKey: string; stageKey: string; presentation: unknown };
const runsOf = (tx: Transaction, sessionId: string): Promise<Run[]> => tx.stageRun.findMany({ where: { sessionId }, select: { id: true, number: true, nodeKey: true, stageKey: true, presentation: true }, orderBy: { number: 'asc' } });

/**
 * Spins the wheel set on this scene. The server picks at random; with
 * "remove picked" on, entries picked earlier in this game are left out, and
 * the wheel starts over once every entry has had its turn. Spinning again on
 * the same scene replaces that scene's result (the replaced pick goes back on
 * the wheel).
 */
export async function spinWheel(tx: Transaction, sessionId: string, definition: GameDefinition, stage: Run, stageDefinition: StageDefinition, now: Date, random: (max: number) => number = randomInt): Promise<void> {
  const wheel = stageDefinition.spin ? wheelOf(definition, stageDefinition.spin.wheel) : null;
  requireGame(wheel, 'INVALID_STATE');
  const used = new Set(wheel.removePicked ? (await runsOf(tx, sessionId)).filter(run => run.id !== stage.id).map(run => readSpin(run.presentation)).filter(spin => spin?.wheel === wheel.key).map(spin => spin!.entryKey) : []);
  let candidates = wheel.entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => !used.has(entry.key));
  if (!candidates.length) candidates = wheel.entries.map((entry, index) => ({ entry, index }));
  const picked = candidates[random(candidates.length)]!;
  const spin: WheelSpin = { wheel: wheel.key, entryKey: picked.entry.key, index: picked.index, spunAt: now.toISOString() };
  await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: { ...(stage.presentation as object), wheelSpin: spin } } });
}

/**
 * What screens show: whether the host can spin now, the spin of the current
 * scene (with all entries, to draw the wheel), and the last result, which
 * stays visible on later scenes until another spin or a scene that clears it.
 */
export async function wheelView(tx: Transaction, sessionId: string, definition: GameDefinition, current: Run | null, host: boolean) {
  if (!definition.wheels?.length) return { canSpin: false, spin: null, current: null };
  const runs = await runsOf(tx, sessionId);
  let last: { title: string; label: string } | null = null;
  for (const run of runs) {
    const entry = locateStage(definition, run.nodeKey, run.stageKey); const spin = readSpin(run.presentation); const wheel = spin ? wheelOf(definition, spin.wheel) : null;
    if (entry?.stage.wheelClear) last = null;
    const picked = wheel?.entries.find(candidate => candidate.key === spin?.entryKey);
    if (wheel && picked) last = { title: wheel.title, label: picked.label };
  }
  const stage = current ? locateStage(definition, current.nodeKey, current.stageKey)?.stage : null;
  const here = stage?.spin ? wheelOf(definition, stage.spin.wheel) : null; const spin = current ? readSpin(current.presentation) : null;
  return {
    canSpin: Boolean(host && here),
    spin: here && spin && spin.wheel === here.key ? { title: here.title, entries: here.entries.map(entry => entry.label), index: spin.index, label: here.entries[spin.index]?.label ?? '', spunAt: spin.spunAt, seconds: here.spinSeconds } : null,
    current: last,
  };
}
