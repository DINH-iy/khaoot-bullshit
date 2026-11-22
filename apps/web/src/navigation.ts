// Moving to another screen of the app without reloading the page (the arcade: lobby ⇄ round). The page stays
// loaded, so nothing goes blank and no tap is lost; main.tsx shows the screen for the new address.
const EVENT = 'party:navigate';
export function navigate(url: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  window.dispatchEvent(new Event(EVENT));
}
/** Calls `changed` after navigate() and after the browser's back and forward buttons. */
export function onNavigate(changed: () => void) {
  window.addEventListener(EVENT, changed); window.addEventListener('popstate', changed);
  return () => { window.removeEventListener(EVENT, changed); window.removeEventListener('popstate', changed); };
}

/** An explicit access denial or missing resource from a page or its session. */
export function isUnavailablePageError(cause: unknown) {
  const code = cause instanceof Error ? cause.message : cause;
  return typeof code === 'string' && [
    'UNAUTHORIZED', 'FORBIDDEN', 'ORIGIN_REJECTED', 'AUTH_UNAVAILABLE', 'CREDENTIAL_EXPIRED',
    'NOT_FOUND', 'ROOM_NOT_AVAILABLE', 'INVALID_COMMAND',
  ].includes(code);
}

export function replaceWithHome() {
  location.replace('/');
}
