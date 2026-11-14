import { lazy, Suspense, useCallback, useState } from 'react';
import { FEEDBACK_UI } from './describe-element.js';
import './feedback.css';

// The form loads only when someone opens it, so phones do not download it up front.
const FeedbackPanel = lazy(() => import('./feedback-panel.js').then(module => ({ default: module.FeedbackPanel })));

/** A small tab on the right edge of every screen of the test version. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <>
    {!open && <button type="button" className="feedback-tab" {...{ [FEEDBACK_UI]: '' }} onClick={() => setOpen(true)}>Feedback</button>}
    {open && <Suspense fallback={null}><FeedbackPanel onClose={close} /></Suspense>}
  </>;
}
