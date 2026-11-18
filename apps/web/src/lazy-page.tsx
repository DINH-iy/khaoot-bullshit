import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';

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

/** A part loaded on demand, with "Opening the …" while it loads and a way out if it cannot. */
export function OnDemand({ what, children }: { what: string; children: ReactNode }) {
  return <LoadProblem><Suspense fallback={<main><p role="status">Opening the {what}…</p></main>}>{children}</Suspense></LoadProblem>;
}
