import { Fragment, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RoomScreen } from './room/room-screen.js';
import { HostMenu } from './hosting/host-menu.js';
import { FeedbackButton } from './feedback/feedback-button.js';
import { applyTheme } from './theme.js';
import { lazyPage, OnDemand } from './lazy-page.js';
import { onNavigate } from './navigation.js';
import './style.css';

// The editor and the admin menu load only when opened, so phones never download them.
const EditorShell = lazyPage(() => import('./editor/shell/editor-shell.js').then(module => module.EditorShell));
const ArcadePage = lazyPage(() => import('./arcade/arcade-page.js').then(module => module.ArcadePage));
const AdminPage = lazyPage(() => import('./admin/admin-page.js').then(module => module.AdminPage));
const TestBench = lazyPage(() => import('./room/test-bench.js').then(module => module.TestBench));
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
// The organiser's light or dark choice; players' phones follow their device and the game's look.
const start = new URLSearchParams(location.search);
if (start.get('edit') || start.has('admin') || start.has('host')) applyTheme();

/** The screen for the current address. The arcade moves between its lobby and rounds without a page reload. */
function App() {
  const [address, setAddress] = useState(location.search);
  useEffect(() => onNavigate(() => setAddress(location.search)), []);
  const params = new URLSearchParams(address); const editing = params.get('edit');
  // Another screen (or another room or lobby) starts fresh, as if the page had loaded there; within the admin
  // menu or one editor the screen stays and reads the address itself.
  const screen = editing ? `edit:${editing}` : params.has('admin') ? 'admin' : params.has('host') ? 'host' : params.has('bench') ? `bench:${params.get('bench')}`
    : params.has('arcade') ? `arcade:${params.get('arcade')}` : `room:${address}`;
  return <Fragment key={screen}>{editing && /^[0-9a-f-]{36}$/i.test(editing)
    ? <OnDemand what="editor"><EditorShell gameId={editing} /></OnDemand>
    : params.has('admin') ? <OnDemand what="admin menu"><AdminPage /></OnDemand>
    : params.has('host') ? <HostMenu />
    : /^[0-9a-f-]{36}$/i.test(params.get('bench') ?? '') ? <OnDemand what="test bench"><TestBench sessionId={params.get('bench')!} /></OnDemand>
    : params.has('arcade') ? <OnDemand what="arcade"><ArcadePage lobbyId={params.get('arcade') || null} /></OnDemand> : <RoomScreen />}</Fragment>;
}
createRoot(root).render(<StrictMode><App /><FeedbackButton /></StrictMode>);
