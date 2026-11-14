import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
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
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => onOpenFeedback(() => setOpen(true)), []);
  return <>
    {!open && <button type="button" className="feedback-tab" {...{ [FEEDBACK_UI]: '' }} onClick={() => setOpen(true)}>Feedback</button>}
    {open && <Suspense fallback={null}><FeedbackPanel onClose={close} /></Suspense>}
  </>;
}
