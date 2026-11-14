import { FeedbackList } from './feedback-list.js';
import { PeoplePanel } from './people-panel.js';
import './admin.css';

type Section = 'feedback' | 'people';
const SECTIONS: { key: Section; label: string }[] = [{ key: 'feedback', label: 'Feedback' }, { key: 'people', label: 'People' }];

/** The owner's admin menu (/?admin, /?admin=people). Same owner sign-in as the host menu. */
export function AdminPage() {
  const wanted = new URLSearchParams(location.search).get('admin');
  const section: Section = wanted === 'people' ? 'people' : 'feedback';
  return <main className="admin-page">
    <header className="admin-head"><div><p className="eyebrow">Admin</p><h1>{SECTIONS.find(entry => entry.key === section)!.label}</h1></div>
      <nav aria-label="Admin sections" className="admin-nav">
        {SECTIONS.map(entry => <a key={entry.key} href={`/?admin=${entry.key}`} aria-current={entry.key === section ? 'page' : undefined}>{entry.label}</a>)}
        <a href="/?host">Host menu</a></nav></header>
    {section === 'feedback' ? <FeedbackList /> : <PeoplePanel />}
  </main>;
}
