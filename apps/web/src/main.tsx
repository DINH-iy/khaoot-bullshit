import { Fragment, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameIdSchema } from '@party/contracts';
import { RoomScreen } from './room/room-screen.js';
import { HostMenu } from './hosting/host-menu.js';
import { FeedbackButton } from './feedback/feedback-button.js';
import { applyTheme } from './theme.js';
import { lazyPage, OnDemand, prefetchLater } from './lazy-page.js';
import { onNavigate, replaceWithHome } from './navigation.js';
import { installDeviceLog } from './diagnostics/capture.js';
import { setLogLobby } from './diagnostics/recorder.js';
import './style.css';

// What happens on this device, kept in memory and sent only when something goes wrong or a game ends.
installDeviceLog();

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
  const params = new URLSearchParams(address);
  const editing = GameIdSchema.safeParse(params.get('edit')).data;
  const room = params.get('room');
  const bench = params.get('bench');
  const benchId = GameIdSchema.safeParse(bench).data;
  const arcade = params.get('arcade');
  const admin = params.get('admin');
  const invalid = (params.has('edit') && !editing)
    || (room !== null && !GameIdSchema.safeParse(room).success)
    || (room === null && bench !== null && !benchId)
    || (arcade !== null && arcade !== '' && !GameIdSchema.safeParse(arcade).success)
    || (admin !== null && !['', 'feedback', 'people', 'packs', 'look', 'logs', 'rooms', 'storage', 'actions', 'health', 'roles'].includes(admin));
  useEffect(() => { if (invalid) replaceWithHome(); }, [invalid]);
  // An arcade lobby stays the log's place while its rounds are played; elsewhere there is none.
  useEffect(() => { if (arcade && GameIdSchema.safeParse(arcade).success) setLogLobby(arcade); else if (room === null) setLogLobby(null); }, [arcade, room]);
  // Another screen (or another room or lobby) starts fresh, as if the page had loaded there; within the admin
  // menu or one editor the screen stays and reads the address itself.
  const screen = editing ? `edit:${editing}` : params.has('admin') ? 'admin' : params.has('host') ? 'host' : params.has('bench') ? `bench:${params.get('bench')}`
    : params.has('arcade') ? `arcade:${params.get('arcade')}` : `room:${address}`;
  // Parts this person is likely to open next are fetched ahead while idle: the owner's pages fetch the editor and
  // the admin menu; the start page (no room yet) fetches the arcade. A player in a game fetches nothing extra.
  useEffect(() => {
    if (invalid) return;
    if (screen === 'host' || screen === 'admin' || screen.startsWith('edit:')) prefetchLater(() => import('./editor/shell/editor-shell.js'), () => import('./admin/admin-page.js'));
    else if (screen.startsWith('room:') && !params.get('room')) prefetchLater(() => import('./arcade/arcade-page.js'));
  }, [screen, invalid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (invalid) return null;
  return <Fragment key={screen}>{editing
    ? <OnDemand what="editor"><EditorShell gameId={editing} /></OnDemand>
    : params.has('admin') ? <OnDemand what="admin menu"><AdminPage /></OnDemand>
    : params.has('host') ? <HostMenu />
    : !room && benchId ? <OnDemand what="test bench"><TestBench sessionId={benchId} /></OnDemand>
    : params.has('arcade') ? <OnDemand what="arcade"><ArcadePage lobbyId={params.get('arcade') || null} /></OnDemand> : <RoomScreen />}</Fragment>;
}
createRoot(root).render(<StrictMode><App /><FeedbackButton /></StrictMode>);
