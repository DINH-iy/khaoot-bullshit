import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RoomScreen } from './network/room-screen.js';
import { HostMenu } from './hosting/host-menu.js';
import './style.css';

// The editor loads only when opened, so phones never download it.
const EditorShell = lazy(() => import('./editor/editor-shell.js').then(module => ({ default: module.EditorShell })));
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
const params = new URLSearchParams(location.search);
const editing = params.get('edit');
createRoot(root).render(<StrictMode>{editing && /^[0-9a-f-]{36}$/i.test(editing)
  ? <Suspense fallback={<main><p role="status">Opening the editor…</p></main>}><EditorShell gameId={editing} /></Suspense>
  : params.has('host') ? <HostMenu /> : <RoomScreen />}</StrictMode>);
