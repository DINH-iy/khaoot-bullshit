import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { loadLocalEnvironment } from '../database/environment.mjs';
loadLocalEnvironment();
const database = process.env.DATABASE_URL;
if (process.env.NODE_ENV === 'production' || !database || !new URL(database).pathname.endsWith('_dev') || !['127.0.0.1', 'localhost'].includes(new URL(database).hostname)) throw new Error('Public smoke fixtures require local development storage.');
const { origin } = JSON.parse(await readFile(new URL('../../.local/network-origin.json', import.meta.url), 'utf8'));
if (!origin.startsWith('https://')) throw new Error('Use the HTTPS rehearsal URL.');
const { createDatabase } = await import('../../apps/server/dist/database/client.js');
const { provisionRehearsal } = await import('../../apps/server/dist/rooms/rehearsal.js');
const db = createDatabase(database, 2); const sockets = []; let f;
async function api(path, body, cookie) {
  const response = await fetch(origin + path, { method: 'POST', headers: { origin, 'x-party-request': '1', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const reply = await response.json(); if (!reply.ok) throw new Error(reply.error.code);
  return { data: reply.data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function connect(cookie, transports = ['websocket']) {
  const socket = io(origin, { autoConnect: false, forceNew: true, auth: { sessionId: f.sessionId }, extraHeaders: { Origin: origin, Cookie: cookie }, transports, timeout: 8000, reconnection: false }); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); }); return socket;
}
function emit(socket, event, data) {
  return new Promise((resolve, reject) => socket.timeout(8000).emit(event, data, (error, reply) => { if (error) reject(new Error('Public acknowledgement timeout')); else if (!reply.ok) reject(new Error(reply.error.code)); else resolve(reply.data); }));
}
try {
  f = await provisionRehearsal(db.client); // Separate synthetic room, never the user's phone room.
  const hostAccess = await api(`/api/rooms/${f.sessionId}/claim`, { token: f.hostToken }); const host = await connect(hostAccess.cookie);
  const joined = await api('/api/rooms/join', { roomCode: f.roomCode, displayName: 'Public smoke test', joinId: randomUUID() });
  const player = await connect(joined.cookie); const polling = await connect(joined.cookie, ['polling']);
  const sync = socket => emit(socket, 'room.sync', { sessionId: f.sessionId });
  const hostCommand = async (type, extra = {}) => emit(host, 'room.command', { formatVersion: 1, type, sessionId: f.sessionId, commandId: randomUUID(), expectedRevision: (await sync(host)).view.revision, ...extra });
  const stage = (await hostCommand('session.start')).stageRunId;
  const command = { formatVersion: 1, type: 'submission.submit', sessionId: f.sessionId, commandId: randomUUID(), stageRunId: stage, value: { kind: 'choice', choiceKey: 'canberra' } };
  const receipt = await emit(player, 'room.command', command);
  if (JSON.stringify(receipt) !== JSON.stringify(await emit(player, 'room.command', command))) throw new Error('Retry receipt mismatch');
  if (!(await sync(polling)).view.ownSubmission) throw new Error('Polling snapshot missing saved answer');
  const samples = [];
  for (let i = 0; i < 5; i++) { const start = performance.now(); await emit(player, 'room.heartbeat', { nonce: String(i) }); samples.push(Math.round(performance.now() - start)); }
  if (await db.client.scoreEntry.count({ where: { sessionId: f.sessionId } }) !== 1) throw new Error('Duplicate score effect');
  let state = await sync(host);
  while (state.view.status !== 'FINISHED') {
    if (state.view.stage.status === 'ACTIVE') await hostCommand('stage.close', { stageRunId: state.view.stage.id });
    await hostCommand('stage.advance', { stageRunId: state.view.stage.id }); state = await sync(host);
  }
  const report = { checkedAt: new Date().toISOString(), path: 'public HTTPS', websocket: 'passed', polling: 'passed', savedRetry: 'passed', roundTripMs: samples, actualAndroid5G: 'pending user test' };
  await writeFile(new URL('../../.local/network-smoke-results.json', import.meta.url), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} finally {
  for (const socket of sockets) socket.disconnect();
  if (f) {
    await db.client.roomCredential.updateMany({ where: { sessionId: f.sessionId }, data: { revokedAt: new Date() } });
    await db.client.playerCredential.updateMany({ where: { sessionId: f.sessionId }, data: { revokedAt: new Date() } });
  }
  await db.close();
}
