// Opens the signed-in host menu again, on the running public link (or on this computer when there is none).
import { readFile } from 'node:fs/promises';
import { loadLocalEnvironment } from '../database/environment.mjs';
import { ensureHostSecrets, hostMenuUrl, openBrowser } from '../host/owner.mjs';

loadLocalEnvironment();
const token = await ensureHostSecrets();
const origin = await readFile(new URL('../../.local/network-origin.json', import.meta.url), 'utf8').then(text => JSON.parse(text).origin).catch(() => null);
const live = origin ? await fetch(`${origin}/api/health/live`, { signal: AbortSignal.timeout(4000) }).then(response => response.ok, () => false) : false;
const base = live ? origin : `http://127.0.0.1:${process.env.PORT || '3001'}`;
console.log((await openBrowser(hostMenuUrl(base, token))) ? `Host menu opened for ${base}.` : 'Could not open a browser.');
