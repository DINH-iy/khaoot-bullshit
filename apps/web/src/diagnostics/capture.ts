import { FEEDBACK_UI } from '../feedback/describe-element.js';
import { deviceLog, keepOverReload, note, restoreAfterReload, useFetch } from './recorder.js';
import { logPath } from './device-log.js';

const CONTROLS = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="radio"], [role="checkbox"], [role="switch"], [role="option"], input, select, textarea, summary, label';
const clip = (value: string | null | undefined, max = 60) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * What was tapped, in words: the control's kind and its name. Never what is typed in a field or which value a
 * field holds; a text field is named by its label only.
 */
export function describeTap(target: Element): string | null {
  const control = target.closest(CONTROLS); if (!control) return null;
  const field = control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement;
  const labelled = clip(control.getAttribute('aria-label')) || clip(control.getAttribute('title'))
    || (field ? clip(textOutsideFields((control as HTMLInputElement).labels?.[0])) || clip(control.getAttribute('name')) : clip(textOutsideFields(control)));
  const kind = field ? (control instanceof HTMLInputElement ? `${control.type} field` : control.tagName === 'SELECT' ? 'list' : 'text field')
    : control.getAttribute('role') ?? (control.tagName === 'A' ? 'link' : control.tagName.toLowerCase());
  return `${labelled || '(no name)'} (${kind})`;
}

/** An element's own words, without anything inside a field it contains (a textarea's text is what was typed). */
function textOutsideFields(element: Element | undefined): string {
  if (!element) return '';
  if (!element.querySelector('input, textarea, select, [contenteditable]')) return element.textContent ?? '';
  const copy = element.cloneNode(true) as Element; copy.querySelectorAll('input, textarea, select, [contenteditable]').forEach(field => field.remove());
  return copy.textContent ?? '';
}

let installed = false;
/** Starts the device log: once per page, before anything else runs. */
export function installDeviceLog() {
  if (installed || typeof window === 'undefined') return; installed = true;
  restoreAfterReload();

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(`[${FEEDBACK_UI}]`)) return;
    const what = describeTap(target); if (what) note({ kind: 'tap', what });
  }, { capture: true, passive: true });

  // Every request to this server: what, the answer's code, its request id and how long it took.
  const original = window.fetch.bind(window); useFetch(original);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const local = url.startsWith('/') || url.startsWith(location.origin);
    const path = local ? logPath(url.startsWith('/') ? url : url.slice(location.origin.length)) : '';
    if (!local || !path.startsWith('/api/') || path === '/api/diagnostics') return original(input, init);
    const what = `${(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()} ${path}`; const start = performance.now();
    try {
      const response = await original(input, init);
      const ms = Math.round(performance.now() - start); deviceLog.requests.add(ms);
      const requestId = response.headers.get('x-request-id') ?? undefined;
      if (response.ok) note({ kind: 'request', what, code: String(response.status), ms, ...(requestId ? { requestId } : {}) });
      else void response.clone().json().then((reply: { error?: { code?: unknown } }) => typeof reply?.error?.code === 'string' ? reply.error.code : String(response.status), () => String(response.status))
        .then(code => note({ kind: 'request', what, code: code.slice(0, 60), ms, ...(requestId ? { requestId } : {}) }, response.status >= 500));
      return response;
    } catch (error) {
      const name = error instanceof Error || error instanceof DOMException ? error.name : '';
      // Stopped on purpose (a screen that closed) is not a problem; no answer in time, or no connection, is.
      const code = name === 'TimeoutError' ? 'timeout' : name === 'AbortError' ? 'stopped' : 'no connection';
      note({ kind: 'request', what, code, ms: Math.round(performance.now() - start) }, code === 'no connection');
      throw error;
    }
  };

  window.addEventListener('error', event => {
    const message = clip(event.message, 120);
    // Browser extensions and a known harmless browser warning are not the app's problems.
    if (!message || /ResizeObserver loop/.test(message) || (event.filename && !event.filename.startsWith(location.origin))) return;
    const file = event.filename ? `${logPath(event.filename).split('/').pop()}:${event.lineno}` : '';
    note({ kind: 'error', what: `${message}${file ? ` (${file})` : ''}`.slice(0, 160) }, true);
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason instanceof Error ? `${event.reason.name}: ${event.reason.message}` : typeof event.reason === 'string' ? event.reason : 'Unknown rejection';
    note({ kind: 'error', what: `Unhandled: ${clip(reason, 140)}` }, true);
  });

  document.addEventListener('visibilitychange', () => { note({ kind: 'page', what: document.hidden ? 'hidden' : 'visible' }); if (document.hidden) keepOverReload(); });
  window.addEventListener('pagehide', keepOverReload);
  window.addEventListener('online', () => note({ kind: 'connection', what: 'online' }));
  window.addEventListener('offline', () => note({ kind: 'connection', what: 'offline' }));
  window.addEventListener('load', () => {
    const timing = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    note({ kind: 'page', what: `opened ${logPath(location.pathname)}${location.search ? ' (with a room or menu)' : ''}`, ...(timing ? { ms: Math.round(timing.loadEventStart || timing.domContentLoadedEventEnd) } : {}) });
  }, { once: true });
  // Moments the page could not respond (Chrome and Edge): how smooth it ran on this device.
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) deviceLog.longTasks.add(entry.duration); }).observe({ type: 'longtask', buffered: true }); }
  catch { /* not supported on this browser */ }
}
