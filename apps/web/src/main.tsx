import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NetworkCheck } from './network/network-check.js';
import { HostMenu } from './hosting/host-menu.js';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<StrictMode>{new URLSearchParams(location.search).has('host') ? <HostMenu /> : <NetworkCheck />}</StrictMode>);
