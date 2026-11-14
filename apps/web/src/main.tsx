import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RoomScreen } from './network/room-screen.js';
import { HostMenu } from './hosting/host-menu.js';
import { FeedbackButton } from './feedback/feedback-button.js';
import './style.css';

// The editor and the admin menu load only when opened, so phones never download them.
const EditorShell = lazy(() => import('./editor/editor-shell.js').then(module => ({ default: module.EditorShell })));
const AdminPage = lazy(() => import('./admin/admin-page.js').then(module => ({ default: module.AdminPage })));
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
const params = new URLSearchParams(location.search);
const editing = params.get('edit');
const opening = (what: string) => <main><p role="status">Opening the {what}…</p></main>;
createRoot(root).render(<StrictMode>{editing && /^[0-9a-f-]{36}$/i.test(editing)
  ? <Suspense fallback={opening('editor')}><EditorShell gameId={editing} /></Suspense>
  : params.has('admin') ? <Suspense fallback={opening('admin menu')}><AdminPage /></Suspense>
  : params.has('host') ? <HostMenu /> : <RoomScreen />}
  <FeedbackButton /></StrictMode>);
