import { GRAPH_REVEAL_MS, GraphPlaybackSchema, graphPlaybackPosition, type GraphPlayback, type GraphPlaybackAction } from '@party/contracts';

export function readGraphPlayback(presentation: unknown, revealedAt: Date): GraphPlayback {
  return GraphPlaybackSchema.safeParse((presentation as { graphPlayback?: unknown } | null)?.graphPlayback).data
    ?? { positionMs: 0, playingSince: revealedAt.toISOString() };
}

export function changeGraphPlayback(presentation: unknown, revealedAt: Date, action: GraphPlaybackAction, now: Date): GraphPlayback {
  const current = readGraphPlayback(presentation, revealedAt);
  const positionMs = graphPlaybackPosition(current, now.getTime());
  if (action === 'replay') return { positionMs: 0, playingSince: now.toISOString() };
  if (action === 'finish') return { positionMs: GRAPH_REVEAL_MS, playingSince: null };
  if (action === 'pause') return { positionMs, playingSince: null };
  return { positionMs, playingSince: positionMs < GRAPH_REVEAL_MS ? now.toISOString() : null };
}
