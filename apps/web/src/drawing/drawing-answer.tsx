import { useEffect, useState } from 'react';
import { DrawingSchema, emptyDrawing, type Drawing } from '@party/contracts';
import { useText } from '../presentation/look.js';
import { DrawingPad } from './drawing-pad.js';
import { uploadDrawing } from './drawing-view.js';

const problems: Record<string, string> = { INVALID_STATE: 'This round is no longer taking drawings.', ALREADY_SUBMITTED: 'Your drawing is already saved.', RATE_LIMITED: 'Too many tries. Wait a moment and send again.', STORAGE_FULL: 'This room has no space left for drawings. Tell the host.' };

/** The unsent drawing survives a refresh or a lost connection (kept on this phone only). */
function useKeptDrawing(stageRunId: string): [Drawing, (drawing: Drawing) => void] {
  const key = `party_drawing_${stageRunId}`;
  const [drawing, setDrawing] = useState<Drawing>(() => { try { const parsed = DrawingSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? 'null')); return parsed.success ? parsed.data : emptyDrawing(); } catch { return emptyDrawing(); } });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(drawing)); } catch { /* only a convenience */ } }, [key, drawing]);
  return [drawing, setDrawing];
}

/** A drawing round on the phone: draw, then send. The drawing is stored first, then the answer names it. */
export function DrawingAnswer({ sessionId, stageRunId, input, disabled, timeUp, onSubmit }: {
  sessionId: string; stageRunId: string; input: { maxStrokes: number; blind?: boolean | undefined; start?: Drawing | undefined }; disabled: boolean; timeUp: boolean; onSubmit: (assetId: string) => void;
}) {
  const t = useText(); const [drawing, setDrawing] = useKeptDrawing(stageRunId); const [sending, setSending] = useState(false); const [error, setError] = useState('');
  const send = async () => {
    setSending(true); setError('');
    try { const { assetId } = await uploadDrawing(sessionId, 'answer', drawing); onSubmit(assetId); }
    catch (cause) { setError(problems[cause instanceof Error ? cause.message : ''] ?? 'Sending failed. Check the connection and send again.'); }
    finally { setSending(false); }
  };
  return <div className="drawing-answer">
    <DrawingPad value={drawing} onChange={setDrawing} under={input.start ? [input.start] : []} blind={input.blind ?? false} maxStrokes={input.maxStrokes} disabled={timeUp || sending} label="Your drawing" />
    {error && <p role="alert" className="error">{error}</p>}
    <button type="button" className="primary" disabled={disabled || sending || timeUp || !drawing.strokes.length} onClick={() => { void send(); }}>{timeUp ? t('timer.up') : t('drawing.submit')}</button>
  </div>;
}
