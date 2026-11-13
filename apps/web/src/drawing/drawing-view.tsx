import { useEffect, useState } from 'react';
import { DRAWING_COLORS, DRAWING_SIZE, DrawingSchema, strokePath, type Drawing, type Stroke } from '@party/contracts';
import { roomApi } from '../network/api.js';
import { assetUrl } from '../network/media-upload.js';
import './drawing.css';

/** Strokes as SVG paths: crisp at any size, and plain data (whole-number coordinates, palette colours). */
export function Strokes({ strokes }: { strokes: readonly Stroke[] }) {
  return <>{strokes.map((stroke, index) => <path key={index} d={strokePath(stroke)} stroke={DRAWING_COLORS[stroke.c]} strokeWidth={stroke.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}</>;
}

/** One or more drawings on top of each other (a relay drawing is its parts, in turn order). */
export function DrawingView({ drawings, label, className }: { drawings: readonly Drawing[]; label: string; className?: string }) {
  return <svg className={`drawing-view${className ? ` ${className}` : ''}`} viewBox={`0 0 ${DRAWING_SIZE} ${DRAWING_SIZE}`} role="img" aria-label={label}>
    <rect width={DRAWING_SIZE} height={DRAWING_SIZE} fill="#ffffff" />
    {drawings.map((drawing, index) => <Strokes key={index} strokes={drawing.strokes} />)}
  </svg>;
}

// Stored drawings never change, so each is fetched once per page.
const cache = new Map<string, Promise<Drawing>>();
export function loadDrawing(sessionId: string, assetId: string): Promise<Drawing> {
  const key = `${sessionId}/${assetId}`; let pending = cache.get(key);
  if (!pending) {
    pending = fetch(assetUrl(sessionId, assetId), { credentials: 'same-origin' }).then(async response => { if (!response.ok) throw new Error(String(response.status)); return DrawingSchema.parse(await response.json()); });
    pending.catch(() => cache.delete(key)); cache.set(key, pending);
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
  }
  return pending;
}
/** Stored drawings by asset ID, in order; missing ones are left out until they arrive. */
export function useDrawings(sessionId: string, assetIds: readonly string[]): Drawing[] {
  const key = assetIds.join(','); const [drawings, setDrawings] = useState<Drawing[]>([]);
  useEffect(() => {
    let mounted = true;
    void Promise.all(assetIds.map(id => loadDrawing(sessionId, id).catch(() => null))).then(loaded => { if (mounted) setDrawings(loaded.filter(drawing => drawing !== null)); });
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, key]);
  return drawings;
}
/** A stored drawing (an answer, a vote entry, a picture). */
export function StoredDrawing({ sessionId, assetIds, label, className }: { sessionId: string; assetIds: readonly string[]; label: string; className?: string }) {
  const drawings = useDrawings(sessionId, assetIds);
  return <DrawingView drawings={drawings} label={label} {...(className ? { className } : {})} />;
}

export type DrawingPurpose = 'answer' | 'part' | 'avatar';
/** Sends a drawing to the server, which checks and stores it; the returned ID goes into the answer, turn or picture. */
export function uploadDrawing(sessionId: string, purpose: DrawingPurpose, drawing: Drawing): Promise<{ assetId: string }> {
  return roomApi<{ assetId: string }>(`/api/rooms/${sessionId}/drawings`, { purpose, drawing });
}
