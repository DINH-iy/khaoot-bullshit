import { useState, type ReactNode } from 'react';

// Which groups the person left open or closed, by title, so selecting another scene
// shows the same groups open ("Who plays" stays open from scene to scene). Kept in this
// browser only, as a convenience; without storage it still works for this visit.
const STORE_KEY = 'party-editor-open-sections';
const remembered: Record<string, boolean> = (() => {
  try { const saved: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}'); return saved && typeof saved === 'object' ? saved as Record<string, boolean> : {}; } catch { return {}; }
})();
function remember(title: string, open: boolean) {
  if (remembered[title] === open) return;
  remembered[title] = open;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(remembered)); } catch { /* storage blocked: remembered for this visit only */ }
}

/**
 * One group of settings in the scene panel: a heading with a one-line summary of
 * what is set, which opens to show the fields. A group is open or closed as it was
 * left last time (on any scene); `open` is only the start for a group never touched.
 * `memory` names it when its title is used elsewhere too (a text group "Teams" is not
 * the Game settings group "Teams"); `forceOpen` shows it open without remembering that
 * (while a search finds something in it).
 */
export function Section({ title, summary, open = false, memory = title, forceOpen = false, problems = [], children }: { title: string; summary?: string; open?: boolean; memory?: string; forceOpen?: boolean; problems?: string[]; children: ReactNode }) {
  const [isOpen, setOpen] = useState(() => remembered[memory] ?? open);
  // The click is handled here (not in the browser's later toggle event), so it is remembered at once,
  // even when the panel redraws right after, for example when a save comes back.
  const set = (now: boolean) => { setOpen(now); remember(memory, now); };
  // A section with a problem is marked (a red line and title) and opens, with the problem in red at its top.
  const shown = forceOpen || isOpen || problems.length > 0;
  return <details className={`ed-section${problems.length ? ' has-problems' : ''}`} open={shown} onToggle={event => { if (!forceOpen && event.currentTarget.open !== isOpen) set(event.currentTarget.open); }}>
    <summary onClick={event => { event.preventDefault(); if (!forceOpen) set(!isOpen); }}><svg className="ed-chevron" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="ed-section-title">{title}</span>{problems.length > 0 ? <span className="ed-section-summary ed-section-alert">{problems.length === 1 ? '1 problem' : `${problems.length} problems`}</span> : summary && <span className="ed-section-summary">{summary}</span>}</summary>
    <div className="ed-section-body">{problems.length > 0 && <ul className="ed-section-problems" role="alert">{problems.map((message, index) => <li key={index}>{message}</li>)}</ul>}{children}</div>
  </details>;
}
