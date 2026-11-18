import { FeedbackList } from './feedback-list.js';
import { PeoplePanel } from './people-panel.js';
import { PacksPanel } from './packs-panel.js';
import { OwnerNav, useHostRole } from '../owner/owner-nav.js';
import './admin.css';

type Section = 'feedback' | 'people' | 'packs';
const TITLES: Record<Section, string> = { feedback: 'Feedback', people: 'People', packs: 'Chips & packs' };

/** The owner's admin menu (/?admin, /?admin=people, /?admin=packs). Same owner sign-in as the host menu; the owner bar switches sections. */
export function AdminPage() {
  const wanted = new URLSearchParams(location.search).get('admin');
  const section: Section = wanted === 'people' || wanted === 'packs' ? wanted : 'feedback';
  const role = useHostRole();
  return <>
    <OwnerNav current={section === 'feedback' ? 'admin' : section} role={role} />
    <main className="admin-page">
      <header className="admin-head"><div><p className="eyebrow">Admin</p><h1>{TITLES[section]}</h1></div></header>
      {section === 'feedback' ? <FeedbackList /> : section === 'people' ? <PeoplePanel /> : <PacksPanel />}
    </main>
  </>;
}
