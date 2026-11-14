import type { FeedbackContext, PickedElement } from '@party/contracts';

/** Elements of the feedback tool itself are never described or picked. */
export const FEEDBACK_UI = 'data-feedback-ui';
const SAFE_PARAMS = ['room', 'code', 'display', 'edit', 'view', 'host', 'admin'];

/**
 * The page a report was made on: the path and harmless query parameters only.
 * The hash is always dropped, since it can carry the owner key or a display key.
 */
export function safePage(href: string): string {
  const url = new URL(href); const kept = new URLSearchParams();
  for (const key of SAFE_PARAMS) { const value = url.searchParams.get(key); if (value !== null) kept.set(key, value.slice(0, 80)); }
  const query = kept.toString().replace(/=(&|$)/g, '$1');
  return `${url.pathname}${query ? `?${query}` : ''}`.slice(0, 300);
}

/** Which screen this is, in words the owner recognises. */
export function screenName(): string {
  const params = new URLSearchParams(location.search);
  if (params.has('admin')) return 'admin';
  if (params.has('edit')) return `editor (${params.get('view') ?? 'flow'})`;
  if (params.has('host')) return 'host menu';
  const room = document.querySelector('main.room');
  const screens: Record<string, string> = { host: 'host screen', display: 'shared screen', player: 'player phone', join: 'join screen' };
  for (const [role, name] of Object.entries(screens)) if (room?.classList.contains(`room-${role}`)) return name;
  return 'unknown';
}

const clip = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);
/** A short CSS path to the element, enough to find it again in the page. */
function selectorOf(element: Element): string {
  const parts: string[] = [];
  for (let at: Element | null = element; at && at !== document.body && parts.length < 5; at = at.parentElement) {
    let part = at.tagName.toLowerCase();
    if (at.id) { parts.unshift(`${part}#${at.id}`); break; }
    const classes = [...at.classList].filter(name => !/^(chosen|active|selected|hover)/.test(name)).slice(0, 2);
    if (classes.length) part += `.${classes.join('.')}`;
    const siblings = at.parentElement ? [...at.parentElement.children].filter(child => child.tagName === at!.tagName) : [];
    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(at) + 1})`;
    parts.unshift(part);
  }
  return parts.join(' > ').slice(0, 400);
}

export function describeElement(element: Element): PickedElement {
  const sources: string[] = [];
  for (let at: Element | null = element.closest('[data-src]'); at && sources.length < 6; at = at.parentElement?.closest('[data-src]') ?? null) {
    const source = at.getAttribute('data-src')!;
    if (!sources.includes(source)) sources.push(source.slice(0, 200));
  }
  const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  return {
    source: sources[0] ?? null, sources: sources.slice(1),
    selector: selectorOf(element), tag: element.tagName.toLowerCase().slice(0, 40),
    // Never what someone typed into a field: that could be private.
    text: input ? '' : clip(element.textContent ?? '', 160),
    label: clip(element.getAttribute('aria-label') ?? element.getAttribute('title') ?? (element instanceof HTMLElement ? element.closest('label')?.textContent ?? '' : ''), 160),
  };
}

export function pageContext(elements: PickedElement[]): FeedbackContext {
  return { page: safePage(location.href), screen: screenName(), viewport: { width: innerWidth, height: innerHeight }, userAgent: navigator.userAgent.slice(0, 300), elements };
}
