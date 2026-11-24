import { Icon } from '../presentation/line-icons.js';
import { StageAction } from '../room/stage-action.js';
import { useEffect, useState } from 'react';
import { DrawingSchema, emptyDrawing, type Drawing } from '@party/contracts';
import { useTexts } from '../i18n/texts.js';
import { DRAWING_TEXTS } from './drawing.text.js';
import { useText } from '../presentation/look.js';
import { DrawingPad } from './drawing-pad.js';
import { uploadDrawing } from './drawing-view.js';

const problems = { INVALID_STATE: 'drawingClosed', ALREADY_SUBMITTED: 'drawingSaved', RATE_LIMITED: 'limited', STORAGE_FULL: 'full' } as const;

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
  const t = useText(); const d = useTexts(DRAWING_TEXTS); const [drawing, setDrawing] = useKeptDrawing(stageRunId); const [sending, setSending] = useState(false); const [error, setError] = useState('');
  const send = async () => {
    setSending(true); setError('');
    try { const { assetId } = await uploadDrawing(sessionId, 'answer', drawing); onSubmit(assetId); }
    catch (cause) { setError(d(problems[(cause instanceof Error ? cause.message : '') as keyof typeof problems] ?? 'failed')); }
    finally { setSending(false); }
  };
  // Time is up with a drawing that was not sent yet: send it as it is (drawing rounds take answers a few seconds after
  // the deadline for this). Sent one render later, so a line the pad just finished at the lock is included.
  const [autoSend, setAutoSend] = useState<'no' | 'due' | 'done'>('no');
  useEffect(() => { if (timeUp) setAutoSend(current => current === 'no' ? 'due' : current); }, [timeUp]);
  useEffect(() => { if (autoSend === 'due' && !sending) { setAutoSend('done'); if (drawing.strokes.length) void send(); } }, [autoSend, drawing]);
  return <div className="drawing-answer">
    {/* Small, at the top: the drawing keeps the room. Its full name (“Send my drawing”) is read out. */}
    <StageAction><button type="button" className="primary drawing-submit" aria-label={timeUp ? t('timer.up') : t('drawing.submit')} disabled={disabled || sending || timeUp || !drawing.strokes.length} onClick={() => { void send(); }}>
      <Icon name="send" size={18} /><span>{timeUp ? t('timer.up') : d('send')}</span></button></StageAction>
    {error && <p role="alert" className="error">{error}</p>}
    <DrawingPad value={drawing} onChange={setDrawing} under={input.start ? [input.start] : []} blind={input.blind ?? false} maxStrokes={input.maxStrokes} disabled={timeUp || sending} label={d('yours')} />
  </div>;
}
