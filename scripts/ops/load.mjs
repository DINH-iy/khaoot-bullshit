// Capacity test: how many rooms can play at the same time on this machine.
// Starts its own copy of the built server on a separate port, opens synthetic rehearsal
// rooms (never real ones) with simulated phones that behave like the web app, plays a quiz
// in every room at once, and measures answer and screen-update times plus server CPU/memory.
// Runs level after level (for example 1, 2, 4, 8 rooms) and stops at the first that fails.
// Results: printed table and .local/load-results/. See docs/testing/load-test.md.
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { io } from 'socket.io-client';
import { loadLocalEnvironment, projectRoot } from '../database/environment.mjs';
import { projectProcesses } from './processes.mjs';

const { values: options } = parseArgs({ options: {
  rooms: { type: 'string', default: '1,2,4,6,8,10,12,15,20' },
  players: { type: 'string', default: '20' },
  questions: { type: 'string', default: '6' },
  think: { type: 'string', default: '3' }, // Seconds; each phone answers after a random 0..think delay.
  spread: { type: 'string', default: '0' }, // Seconds; rooms start at random offsets. 0 = all at once (worst case).
  port: { type: 'string', default: '3101' },
  'max-answer-p95': { type: 'string', default: '500' },
  'max-screen-p95': { type: 'string', default: '1500' },
  'keep-going': { type: 'boolean', default: false },
} });
const num = (name, min, max) => { const value = Number(options[name]); if (!Number.isInteger(value) || value < min || value > max) throw new Error(`--${name} must be a whole number from ${min} to ${max}.`); return value; };
const levels = options.rooms.split(',').map(value => Number(value.trim()));
if (!levels.length || levels.some(value => !Number.isInteger(value) || value < 1 || value > 100)) throw new Error('--rooms is a list of room counts from 1 to 100, for example 1,2,4,8.');
const players = num('players', 1, 250); const questions = num('questions', 1, 50); const think = num('think', 0, 60);
const spread = num('spread', 0, 600); const port = num('port', 1024, 65535);
const limits = { answerP95: num('max-answer-p95', 1, 60000), screenP95: num('max-screen-p95', 1, 60000) };

loadLocalEnvironment();
const database = process.env.DATABASE_URL;
const dbUrl = database ? new URL(database) : null;
// Never against live party data: only a local development or dedicated load database.
if (process.env.NODE_ENV === 'production' || !dbUrl || !['127.0.0.1', 'localhost'].includes(dbUrl.hostname) || !/_(dev|load)$/.test(decodeURIComponent(dbUrl.pathname)))
  throw new Error('The load test runs only against a local PostgreSQL database whose name ends in _dev or _load, never production.');
if (!existsSync(new URL('../../apps/server/dist/index.js', import.meta.url))) throw new Error('Build first: npm run build');

const { createDatabase } = await import('../../apps/server/dist/database/client.js');
const { provisionRehearsal } = await import('../../apps/server/dist/rooms/rehearsal.js');
const { closeRoom } = await import('../../apps/server/dist/rooms/close.js');
const { parseDefinition } = await import('../../apps/server/dist/game/definition.js');

// The game every room plays: a quiz of choice questions with every third one a written answer.
const kinds = Array.from({ length: questions }, (_, i) => (i % 3 === 2 ? 'text' : 'choice'));
const definition = parseDefinition({
  formatVersion: 1, title: 'Load test quiz', startNodeKey: 'q1',
  nodes: kinds.map((kind, i) => ({ key: `q${i + 1}`, stages: [kind === 'choice'
    ? { key: 'answer', kind: 'collect', prompt: `Load test question ${i + 1}`, durationMs: null,
      input: { kind: 'choice', options: ['a', 'b', 'c', 'd'].map(key => ({ key, label: `Option ${key.toUpperCase()}` })) },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '10000' } }
    : { key: 'answer', kind: 'collect', prompt: `Load test excuse ${i + 1}`, durationMs: null, input: { kind: 'text', maxLength: 240 }, scoring: { kind: 'none' } }] })),
  edges: kinds.slice(1).map((_, i) => ({ key: `e${i + 1}`, from: `q${i + 1}`, to: `q${i + 2}` })),
});
const kindOf = nodeKey => kinds[Number(nodeKey.slice(1)) - 1];

const db = createDatabase(database, 2);
const origin = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(done => setTimeout(done, ms));
let aborted = false; let server; let serverError = '';
process.once('SIGINT', () => { aborted = true; console.log('\nStopping after cleanup…'); });

// ---------- Measuring the machine ----------
const linux = existsSync('/proc/self/stat');
const ticks = linux ? Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim()) || 100 : 100;
function procCpuSeconds(pid) {
  if (linux) { const stat = readFileSync(`/proc/${pid}/stat`, 'utf8'); const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' '); return (Number(fields[11]) + Number(fields[12])) / ticks; }
  const time = execFileSync('ps', ['-o', 'time=', '-p', String(pid)], { encoding: 'utf8' }).trim(); // [[DD-]HH:]MM:SS(.ss)
  const [days, rest] = time.includes('-') ? time.split('-') : ['0', time];
  return Number(days) * 86400 + rest.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}
function procRssMb(pid) {
  if (linux) { const line = readFileSync(`/proc/${pid}/status`, 'utf8').split('\n').find(row => row.startsWith('VmRSS:')); return line ? Number(line.split(/\s+/)[1]) / 1024 : 0; }
  return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()) / 1024;
}
// PostgreSQL runs as many processes; on Linux they are visible even inside Docker. On macOS Docker hides them.
function postgresPids() {
  if (!linux) return [];
  return readdirSync('/proc').filter(name => /^\d+$/.test(name)).filter(pid => { try { return readFileSync(`/proc/${pid}/comm`, 'utf8').trim() === 'postgres'; } catch { return false; } });
}
function memAvailableMb() {
  if (linux) { const line = readFileSync('/proc/meminfo', 'utf8').split('\n').find(row => row.startsWith('MemAvailable:')); if (line) return Number(line.split(/\s+/)[1]) / 1024; }
  return null; // macOS counts file cache as used memory, so its free figure would mislead.
}
function temperatureC() { try { return Number(readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8')) / 1000; } catch { return null; } }
function startSampler() {
  const samples = []; let last = { at: performance.now(), server: procCpuSeconds(server.pid), postgres: new Map(), self: process.cpuUsage() };
  for (const pid of postgresPids()) { try { last.postgres.set(pid, procCpuSeconds(pid)); } catch { /* exited */ } }
  const timer = setInterval(() => {
    try {
      const at = performance.now(); const seconds = (at - last.at) / 1000; const serverCpu = procCpuSeconds(server.pid);
      const postgres = new Map(); let pgCpu = 0; let pgRss = 0;
      for (const pid of postgresPids()) { try { const cpu = procCpuSeconds(pid); postgres.set(pid, cpu); pgCpu += cpu - (last.postgres.get(pid) ?? cpu); pgRss += procRssMb(pid); } catch { /* exited */ } }
      const self = process.cpuUsage(last.self);
      samples.push({ serverCpu: (serverCpu - last.server) / seconds * 100, serverRss: procRssMb(server.pid), postgresCpu: linux ? pgCpu / seconds * 100 : null, postgresRss: linux ? pgRss : null,
        generatorCpu: (self.user + self.system) / 1e6 / seconds * 100, memAvailable: memAvailableMb(), load1: os.loadavg()[0], temperature: temperatureC() });
      last = { at, server: serverCpu, postgres, self: process.cpuUsage() };
    } catch { /* server exited; reported elsewhere */ }
  }, 1000);
  return { stop() { clearInterval(timer); return samples; } };
}

// ---------- Talking to the server like the web app does ----------
const percentile = (values, p) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)]; };
function newStats() { return { answer: [], screen: [], sync: [], heartbeat: [], hostCommand: [], errors: {}, joined: 0, answers: 0 }; }
const fail = (stats, code) => { stats.errors[code] = (stats.errors[code] ?? 0) + 1; };

// Every simulated phone gets its own visitor address (as real phones behind the tunnel do), so per-address limits apply per phone.
async function api(path, body, address, retries = 8) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(origin + path, { method: 'POST', headers: { origin, 'x-party-request': '1', 'content-type': 'application/json', 'cf-connecting-ip': address }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const reply = await response.json();
    if (reply.ok) return { data: reply.data, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
    if (reply.error.code !== 'RATE_LIMITED' || attempt >= retries) throw new Error(reply.error.code);
    await sleep(Math.min(8000, 500 * 2 ** attempt));
  }
}
async function connect(sessionId, cookie, address) {
  for (let attempt = 0; ; attempt++) {
    const socket = io(origin, { autoConnect: false, forceNew: true, auth: { sessionId }, extraHeaders: { Origin: origin, Cookie: cookie, 'cf-connecting-ip': address }, transports: ['websocket'], timeout: 8000, reconnection: false });
    try { await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); }); return socket; }
    catch (error) { socket.disconnect(); if (error.data?.code !== 'RATE_LIMITED' || attempt >= 6) throw new Error(error.data?.code ?? 'CONNECT_FAILED'); await sleep(Math.min(8000, 500 * 2 ** attempt)); }
  }
}
function emit(socket, event, data) {
  return new Promise((resolve, reject) => socket.timeout(5000).emit(event, data, (error, reply) => {
    if (error) reject(new Error('TIMEOUT')); else if (!reply.ok) reject(new Error(reply.error.code)); else resolve(reply.data);
  }));
}

// A phone: syncs on every change (debounced, one at a time, like use-room.ts) and every 10 s with a heartbeat.
function phone(socket, sessionId, stats) {
  let view = null; let syncing = null; let again = false; let debounce; let stopped = false; const waiters = new Set();
  const sync = async () => {
    if (syncing) { again = true; return; } const start = performance.now();
    syncing = (async () => {
      try { view = (await emit(socket, 'room.sync', { sessionId })).view; stats.sync.push(performance.now() - start); for (const waiter of [...waiters]) waiter(); }
      catch (error) { if (!stopped) fail(stats, `sync ${error.message}`); }
    })();
    await syncing; syncing = null; if (again) { again = false; request(); }
  };
  // The server allows one sync per connection at a time: wait for a running one, then read the room fresh.
  const fresh = async () => {
    while (syncing) await syncing;
    syncing = emit(socket, 'room.sync', { sessionId }).then(data => { view = data.view; return data.view; });
    try { return await syncing; } finally { syncing = null; }
  };
  const request = () => { clearTimeout(debounce); debounce = setTimeout(() => void sync(), 150); };
  socket.on('room.changed', request); socket.on('presence.changed', request);
  const heartbeat = async () => { const start = performance.now(); try { await emit(socket, 'room.heartbeat', { nonce: String(Date.now()) }); stats.heartbeat.push(performance.now() - start); } catch (error) { if (!stopped) fail(stats, `heartbeat ${error.message}`); } };
  const interval = setInterval(() => { void heartbeat(); request(); }, 10000);
  void sync(); void heartbeat();
  const until = (check, ms = 60000) => new Promise((resolve, reject) => {
    if (check(view)) { resolve(view); return; }
    const waiter = () => { if (check(view)) { done(); resolve(view); } };
    const timer = setTimeout(() => { done(); reject(new Error('STUCK')); }, ms);
    const done = () => { clearTimeout(timer); waiters.delete(waiter); };
    waiters.add(waiter);
  });
  return {
    sync, fresh, until, socket,
    // Waits until this phone shows the stage, then answers after a random think time.
    async play(stageId, openedAt) {
      try {
        const shown = await until(current => current?.stage?.id === stageId && current.stage.status === 'ACTIVE');
        stats.screen.push(performance.now() - openedAt);
        await sleep(Math.random() * think * 1000);
        const value = kindOf(shown.stage.nodeKey) === 'text' ? { kind: 'text', text: `Load test excuse ${randomUUID().slice(0, 8)}` } : { kind: 'choice', choiceKey: 'abcd'[Math.floor(Math.random() * 4)] };
        const start = performance.now();
        await emit(socket, 'room.command', { formatVersion: 1, type: 'submission.submit', sessionId, commandId: randomUUID(), stageRunId: stageId, value });
        stats.answer.push(performance.now() - start); stats.answers++;
      } catch (error) { fail(stats, `answer ${error.message}`); }
    },
    stop() { stopped = true; clearInterval(interval); clearTimeout(debounce); socket.disconnect(); },
  };
}

// ---------- One level: N rooms playing at once ----------
async function runLevel(roomCount) {
  const stats = newStats(); const rooms = []; const phones = [];
  try {
    for (let r = 0; r < roomCount; r++) {
      const fixture = await provisionRehearsal(db.client, definition); rooms.push(fixture);
      const hostAddress = `10.250.${r}.1`;
      const claimed = await api(`/api/rooms/${fixture.sessionId}/claim`, { token: fixture.hostToken }, hostAddress);
      fixture.host = phone(await connect(fixture.sessionId, claimed.cookie, hostAddress), fixture.sessionId, stats); phones.push(fixture.host);
      fixture.phones = [];
    }
    // Phones join a few at a time, like people scanning the code.
    const seats = rooms.flatMap((room, r) => Array.from({ length: players }, (_, p) => ({ room, address: `10.${r + 1}.${Math.floor(p / 250)}.${(p % 250) + 1}`, name: `Load ${r + 1}-${p + 1}` })));
    let next = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (next < seats.length && !aborted) {
        const seat = seats[next++];
        try {
          const joined = await api('/api/rooms/join', { roomCode: seat.room.roomCode, displayName: seat.name, joinId: randomUUID() }, seat.address);
          const device = phone(await connect(seat.room.sessionId, joined.cookie, seat.address), seat.room.sessionId, stats);
          seat.room.phones.push(device); phones.push(device); stats.joined++;
        } catch (error) { fail(stats, `join ${error.message}`); }
      }
    }));
    if (aborted) return { stats, samples: [] };
    await sleep(2000); // Let the lobby settle; the game is what is measured.
    for (const key of ['sync', 'heartbeat']) stats[key] = [];

    const sampler = startSampler(); const started = performance.now();
    await Promise.all(rooms.map(async room => {
      await sleep(Math.random() * spread * 1000);
      const sessionId = room.sessionId;
      const host = async (type, extra = {}) => {
        const start = performance.now();
        const revision = (await room.host.fresh()).revision;
        const result = await emit(room.host.socket, 'room.command', { formatVersion: 1, type, sessionId, commandId: randomUUID(), expectedRevision: revision, ...extra });
        stats.hostCommand.push(performance.now() - start); return result;
      };
      try {
        let open = () => host('session.start');
        while (!aborted) {
          const openedAt = performance.now(); await open();
          const state = await room.host.fresh();
          if (state.status === 'FINISHED' || !state.stage) break;
          const stageRunId = state.stage.id;
          await Promise.all(room.phones.map(device => device.play(stageRunId, openedAt)));
          await sleep(400); // The host glances at the screen before moving on.
          await host('stage.close', { stageRunId });
          open = () => host('stage.advance', { stageRunId });
        }
      } catch (error) { fail(stats, `host ${error.message}`); }
    }));
    stats.seconds = (performance.now() - started) / 1000;
    const samples = sampler.stop();
    // Every answer the server acknowledged must be stored exactly once.
    stats.stored = await db.client.submission.count({ where: { sessionId: { in: rooms.map(room => room.sessionId) } } });
    return { stats, samples };
  } finally {
    for (const device of phones) device.stop();
    for (const room of rooms) {
      try {
        await db.client.$transaction(tx => closeRoom(tx, room.sessionId));
        await db.client.roomCredential.updateMany({ where: { sessionId: room.sessionId }, data: { revokedAt: new Date() } });
        await db.client.playerCredential.updateMany({ where: { sessionId: room.sessionId }, data: { revokedAt: new Date() } });
      } catch { console.error(`Could not close load test room ${room.roomCode}; it is a rehearsal room and can be closed from the host menu.`); }
    }
  }
}

function summarize(roomCount, { stats, samples }) {
  const round = value => (value === null || value === undefined ? null : Math.round(value));
  const peak = key => { const values = samples.map(sample => sample[key]).filter(value => value !== null); return values.length ? Math.max(...values) : null; };
  const average = key => { const values = samples.map(sample => sample[key]).filter(value => value !== null); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };
  const errors = Object.values(stats.errors).reduce((a, b) => a + b, 0);
  const expectedPlayers = roomCount * players;
  const summary = {
    rooms: roomCount, players: expectedPlayers, sockets: roomCount * (players + 1), joined: stats.joined, answers: stats.answers, stored: stats.stored, errors, errorCodes: stats.errors, seconds: round(stats.seconds),
    answerMs: { p50: round(percentile(stats.answer, 50)), p95: round(percentile(stats.answer, 95)), max: round(percentile(stats.answer, 100)) },
    screenMs: { p50: round(percentile(stats.screen, 50)), p95: round(percentile(stats.screen, 95)), max: round(percentile(stats.screen, 100)) },
    syncMs: { p50: round(percentile(stats.sync, 50)), p95: round(percentile(stats.sync, 95)) },
    heartbeatMs: { p95: round(percentile(stats.heartbeat, 95)) },
    hostCommandMs: { p95: round(percentile(stats.hostCommand, 95)) },
    serverCpuPct: { avg: round(average('serverCpu')), peak: round(peak('serverCpu')) }, serverRssMb: round(peak('serverRss')),
    postgresCpuPct: { avg: round(average('postgresCpu')), peak: round(peak('postgresCpu')) }, postgresRssMb: round(peak('postgresRss')),
    generatorCpuPct: round(average('generatorCpu')), memAvailableMinMb: round(samples.some(sample => sample.memAvailable !== null) ? Math.min(...samples.map(sample => sample.memAvailable).filter(value => value !== null)) : null),
    load1Peak: peak('load1'), temperaturePeakC: peak('temperature'),
  };
  const reasons = [];
  if (stats.joined < expectedPlayers) reasons.push(`${expectedPlayers - stats.joined} phones could not join`);
  if (errors) reasons.push(`${errors} errors`);
  if (stats.stored !== stats.answers) reasons.push(`${stats.answers} answers acknowledged but ${stats.stored} stored`);
  if (stats.answers < stats.joined * questions) reasons.push(`${stats.joined * questions - stats.answers} answers missing`);
  if ((summary.answerMs.p95 ?? Infinity) > limits.answerP95) reasons.push(`answer p95 ${summary.answerMs.p95} ms > ${limits.answerP95}`);
  if ((summary.screenMs.p95 ?? Infinity) > limits.screenP95) reasons.push(`screen p95 ${summary.screenMs.p95} ms > ${limits.screenP95}`);
  return { ...summary, passed: reasons.length === 0, reasons };
}

function printRow(row) {
  const cell = (value, width) => String(value ?? '–').padStart(width);
  console.log([cell(row.rooms, 5), cell(row.players, 7), cell(`${row.answerMs.p50}/${row.answerMs.p95}/${row.answerMs.max}`, 18), cell(`${row.screenMs.p50}/${row.screenMs.p95}/${row.screenMs.max}`, 18),
    cell(`${row.serverCpuPct.avg}/${row.serverCpuPct.peak}%`, 12), cell(`${row.serverRssMb} MB`, 8), cell(row.postgresCpuPct.peak === null ? 'n/a' : `${row.postgresCpuPct.peak}%`, 8),
    cell(row.memAvailableMinMb === null ? 'n/a' : `${row.memAvailableMinMb} MB`, 10), cell(row.temperaturePeakC === null ? '–' : `${row.temperaturePeakC.toFixed(0)}°C`, 6), '  ' + (row.passed ? 'pass' : `FAIL: ${row.reasons.join('; ')}`)].join(' '));
}

// ---------- Main ----------
const running = await db.client.gameSession.count({ where: { status: 'RUNNING', roomCode: { not: null }, roomCredentials: { some: {} } } });
if (running) { await db.close(); throw new Error(`${running} room(s) are running in this database. A new server pauses running rooms when it starts, so close them first (or use a separate _load database).`); }
const others = projectProcesses(projectRoot).filter(entry => ['app server', 'development server'].includes(entry.kind));
if (others.length) console.warn('Note: another app server is running on this machine and will compete for CPU. Stop it (npm run stop) for clean numbers.');

// The test server gets its own room secret and no owner access; nothing it hands out works on the real server.
const serverEnv = { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin, SERVE_WEB: 'false', TRUST_CLOUDFLARE_LOCAL: 'true', ROOM_TOKEN_SECRET: randomBytes(32).toString('hex') };
delete serverEnv.LOCAL_OWNER_TOKEN;
server = spawn(process.execPath, ['apps/server/dist/index.js'], { cwd: projectRoot, stdio: ['ignore', 'ignore', 'pipe'], env: serverEnv });
server.stderr.on('data', chunk => { serverError = (serverError + chunk).slice(-2000); });
const results = [];
try {
  const ready = Date.now() + 20000; let up = false;
  while (!up && Date.now() < ready && server.exitCode === null) { up = await fetch(`${origin}/api/health/live`, { signal: AbortSignal.timeout(1000) }).then(response => response.ok, () => false); if (!up) await sleep(250); }
  if (!up) throw new Error(`The test server did not start.${serverError ? `\n${serverError}` : ''}`);
  const cores = os.cpus().length;
  console.log(`Load test on ${os.hostname()} (${os.arch()}, ${cores} cores, ${Math.round(os.totalmem() / 1073741824)} GB RAM, Node ${process.version}), pool ${process.env.DATABASE_POOL_MAX ?? 5}`);
  console.log(`${players} phones per room, ${questions} questions, think 0–${think} s, rooms start ${spread ? `within ${spread} s` : 'all at once'}. CPU % is of one core (${cores * 100}% = all).\n`);
  console.log(' rooms  phones   answer ms p50/95/max  screen ms p50/95/max  server cpu  srv RAM  pg cpu  mem free   temp  result');
  for (const roomCount of levels) {
    if (aborted) break;
    if (roomCount * (players + 1) >= 512) console.warn(`  ${roomCount} rooms need ${roomCount * (players + 1)} connections; the server admits at most 511, so this level will fail at the connection limit.`);
    const row = summarize(roomCount, await runLevel(roomCount));
    results.push(row); printRow(row);
    if (server.exitCode !== null) { console.error(`The server stopped.${serverError ? `\n${serverError}` : ''}`); break; }
    if (!row.passed && !options['keep-going']) break;
    await sleep(3000); // Let the machine settle between levels.
  }
} finally {
  if (server.exitCode === null) { server.kill('SIGTERM'); await new Promise(done => { server.once('exit', done); setTimeout(done, 10000); }); }
  await db.close();
}
const best = results.filter(row => row.passed).at(-1);
console.log(best ? `\nMost rooms that passed: ${best.rooms} (${best.players} phones).` : '\nNo level passed.');
const machine = { hostname: os.hostname(), arch: os.arch(), cores: os.cpus().length, cpu: os.cpus()[0]?.model, totalMemMb: Math.round(os.totalmem() / 1048576), node: process.version, platform: process.platform };
await mkdir(new URL('../../.local/load-results/', import.meta.url), { recursive: true });
const file = new URL(`../../.local/load-results/load-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
await writeFile(file, JSON.stringify({ checkedAt: new Date().toISOString(), machine, options: { players, questions, think, spread, limits, poolMax: Number(process.env.DATABASE_POOL_MAX ?? 5) }, results }, null, 2), { mode: 0o600 });
console.log(`Saved: ${file.pathname}`);
