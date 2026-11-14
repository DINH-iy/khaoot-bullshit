import { FeedbackList } from './feedback-list.js';
import { PeoplePanel } from './people-panel.js';
import { OwnerNav } from '../owner/owner-nav.js';
import './admin.css';

type Section = 'feedback' | 'people';
const TITLES: Record<Section, string> = { feedback: 'Feedback', people: 'People' };

/** The owner's admin menu (/?admin, /?admin=people). Same owner sign-in as the host menu; the owner bar switches sections. */
export function AdminPage() {
  const wanted = new URLSearchParams(location.search).get('admin');
  const section: Section = wanted === 'people' ? 'people' : 'feedback';
  return <>
    <OwnerNav current={section === 'people' ? 'people' : 'admin'} />
    <main className="admin-page">
      <header className="admin-head"><div><p className="eyebrow">Admin</p><h1>{TITLES[section]}</h1></div></header>
      {section === 'feedback' ? <FeedbackList /> : <PeoplePanel />}
    </main>
  </>;
}
