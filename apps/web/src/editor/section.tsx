import type { ReactNode } from 'react';

/**
 * One group of settings in the scene panel: a heading with a one-line summary of
 * what is set, which opens to show the fields. Groups start closed except the
 * first, so the panel shows the scene at a glance instead of every field at once.
 */
export function Section({ title, summary, open = false, children }: { title: string; summary?: string; open?: boolean; children: ReactNode }) {
  return <details className="ed-section" open={open || undefined}>
    <summary><svg className="ed-chevron" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="ed-section-title">{title}</span>{summary && <span className="ed-section-summary">{summary}</span>}</summary>
    <div className="ed-section-body">{children}</div>
  </details>;
}
