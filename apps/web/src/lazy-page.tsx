import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';

// Parts of the app that load when opened (editor, admin, arcade, test bench). The page never reloads by itself:
// a failed download (a network blip on a phone) is tried again a few times, and only if it keeps failing does the
// page say so, with a Reload button for the person to press, instead of going blank.
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function lazyPage<P extends object>(load: () => Promise<ComponentType<P>>) {
  return lazy(async () => {
    for (const pause of [500, 1500, 3000]) { try { return { default: await load() }; } catch { await wait(pause); } }
    return { default: await load() };
  });
}

class LoadProblem extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (!this.state.failed) return this.props.children;
    return <main className="load-problem"><h1>This page did not load</h1><p>Check the connection and try again.</p>
      <button type="button" className="primary" onClick={() => location.reload()}>Reload</button></main>;
  }
}

/**
 * While a part downloads: nothing for the first moment (a quick load shows no loader at all), then the party logo
 * with a soft pulse and three dots, centred, in the page's colours. Never shown during a game: the room screen is in
 * the first download.
 */
function PageLoader({ what }: { what: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setShown(true), 180); return () => clearTimeout(timer); }, []);
  return <main className={`page-loader${shown ? ' shown' : ''}`} aria-busy="true">
    <p className="page-loader-mark" aria-hidden="true">party<span>.</span></p>
    <p className="page-loader-dots" aria-hidden="true"><i /><i /><i /></p>
    <p role="status" className="visually-hidden">Opening the {what}…</p>
  </main>;
}

/** A part loaded on demand, with a loader while it loads and a way out if it cannot. */
export function OnDemand({ what, children }: { what: string; children: ReactNode }) {
  return <LoadProblem><Suspense fallback={<PageLoader what={what} />}>{children}</Suspense></LoadProblem>;
}

/** Downloads parts ahead, once the page is idle, so opening them later needs no loader (only the parts asked for). */
export function prefetchLater(...loads: (() => Promise<unknown>)[]) {
  const run = () => { for (const load of loads) void load().catch(() => {}); };
  const idle = (window as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 }); else setTimeout(run, 1500);
}
