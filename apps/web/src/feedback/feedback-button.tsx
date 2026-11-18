import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FEEDBACK_UI } from './describe-element.js';
import { onOpenFeedback } from './open-feedback.js';
import './feedback.css';

// The form loads only when someone opens it, so phones do not download it up front.
const FeedbackPanel = lazy(() => import('./feedback-panel.js').then(module => ({ default: module.FeedbackPanel })));

/**
 * A small tab on the right edge of every screen of the test version. Pages with
 * the owner bar hide the tab (feedback.css) and open the form from the bar instead.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  // Pressing Feedback again after a report was sent starts a fresh, empty form (a new panel);
  // while a report is still being written it stays as it is.
  const [round, setRound] = useState(0); const sent = useRef(false);
  const close = useCallback(() => { setOpen(false); sent.current = false; }, []);
  useEffect(() => onOpenFeedback(() => {
    if (sent.current) { sent.current = false; setRound(current => current + 1); }
    setOpen(true);
  }), []);
  // Inside a frame (the test bench's phones and host screen) the page around it has the tab already.
  if (typeof window !== 'undefined' && window.top !== window.self) return null;
  return <>
    {!open && <button type="button" className="feedback-tab" {...{ [FEEDBACK_UI]: '' }} onClick={() => setOpen(true)}>Feedback</button>}
    {open && <Suspense fallback={null}><FeedbackPanel key={round} onClose={close} onSent={value => { sent.current = value; }} /></Suspense>}
  </>;
}
