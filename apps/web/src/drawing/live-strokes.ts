import { useSyncExternalStore } from 'react';
import { StrokeSchema, type Stroke } from '@party/contracts';

export interface LiveStrokeMessage { stageRunId: string; teamId: string; turn: number; strokeId: number; stroke: Stroke | null; count: number }

/**
 * Strokes of Pass the pencil turns that are still being drawn, as they arrive
 * from the server. Only what is needed until the turn is saved: the saved
 * part replaces them. Kept outside React state, so a picture redraws on its
 * own (at most once a frame) without redrawing the whole room screen.
 */
export function createLiveStrokes() {
  const turns = new Map<string, Map<number, Stroke>>(); const listeners = new Set<() => void>(); let version = 0; let frame: number | null = null;
  const key = (stageRunId: string, teamId: string, turn: number) => `${stageRunId}:${teamId}:${turn}`;
  const notify = () => { if (frame !== null) return; frame = requestAnimationFrame(() => { frame = null; version++; for (const listener of listeners) listener(); }); };
  return {
    apply(input: unknown) {
      const message = input as Partial<LiveStrokeMessage> | null;
      if (!message || typeof message.stageRunId !== 'string' || typeof message.teamId !== 'string' || !Number.isInteger(message.turn) || !Number.isInteger(message.strokeId) || !Number.isInteger(message.count)) return;
      const stroke = message.stroke === null ? null : StrokeSchema.safeParse(message.stroke); if (stroke && !stroke.success) return;
      const id = key(message.stageRunId, message.teamId, message.turn!); const strokes = turns.get(id) ?? new Map<number, Stroke>();
      for (const strokeId of [...strokes.keys()]) if (strokeId >= message.count!) strokes.delete(strokeId);
      if (stroke?.success) strokes.set(message.strokeId!, stroke.data);
      turns.set(id, strokes); if (turns.size > 200) turns.delete(turns.keys().next().value!);
      notify();
    },
    /** A team's live strokes per turn, in order. */
    strokes(stageRunId: string, teamId: string, skipTurns: ReadonlySet<number>): Stroke[] {
      const result: Stroke[] = [];
      for (let turn = 0; turn < 64; turn++) {
        if (skipTurns.has(turn)) continue; const strokes = turns.get(key(stageRunId, teamId, turn));
        if (strokes) result.push(...[...strokes.entries()].sort(([a], [b]) => a - b).map(([, stroke]) => stroke));
      }
      return result;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    version: () => version,
  };
}
export type LiveStrokes = ReturnType<typeof createLiveStrokes>;
/** Redraws the caller whenever live strokes arrive. */
export const useLiveStrokes = (store: LiveStrokes) => useSyncExternalStore(store.subscribe, store.version);
