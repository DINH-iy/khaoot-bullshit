// Opens the feedback form from anywhere (for example the owner bar), without
// loading the form itself: FeedbackButton listens and loads it on demand.
const OPEN = 'party:feedback-open';

export function openFeedback() { window.dispatchEvent(new Event(OPEN)); }
export function onOpenFeedback(listener: () => void) {
  window.addEventListener(OPEN, listener);
  return () => window.removeEventListener(OPEN, listener);
}
