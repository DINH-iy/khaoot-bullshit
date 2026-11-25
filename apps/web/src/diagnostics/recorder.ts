import type { DeviceEvent, DeviceLogReason, NewDeviceLog } from '@party/contracts';
import { screenName } from '../feedback/describe-element.js';
import { DeviceLog, UNEXPECTED_CODES } from './device-log.js';

/**
 * This device's log and when it is sent. Nothing is sent while things work: a log goes to the server when
 * something went wrong (at most once a minute, with what happened just after it too) and once when a game ends,
 * so the owner can see how it went. Players never see any of this.
 */
export const deviceLog = new DeviceLog();
const PROBLEM_GAP_MS = 60_000; const PROBLEM_DELAY_MS = 4000; const PROBLEMS_PER_HOUR = 20;
const STORE_KEY = 'party-device-log';

type Place = { sessionId: string | null; lobbyId: string | null; playerId: string | null; role: NewDeviceLog['device']['role'] };
const place: Place = { sessionId: null, lobbyId: null, playerId: null, role: 'other' };
let deviceId = '';
/** The original fetch: sending a log must not log itself. */
let send: typeof fetch = (...args) => fetch(...args);
export function useFetch(original: typeof fetch) { send = original; }

/** The room this device is in now, as the room told it (use-room.ts). */
export function setLogRoom(sessionId: string | null, role?: Place['role'], playerId?: string | null) {
  place.sessionId = sessionId; if (role) place.role = role; if (playerId !== undefined) place.playerId = playerId;
  if (!sessionId) { place.playerId = null; place.role = 'other'; }
}
/** The arcade lobby; kept while its rounds are played (their rooms have their own address). */
export function setLogLobby(lobbyId: string | null) { place.lobbyId = lobbyId; }

let firstProblem: string | null = null; let lastSent = 0; let timer: ReturnType<typeof setTimeout> | undefined;
let sentThisHour: number[] = []; let unsent: NewDeviceLog | null = null; let delivering = false;

/** Records one thing that happened. `problem` (or an unexpected code) also sends the log shortly after. */
export function note(event: Omit<DeviceEvent, 'at' | 'screen'> & { at?: number }, problem = false) {
  const full: DeviceEvent = { at: event.at ?? Date.now(), screen: safeScreen(), ...event };
  deviceLog.add(full);
  if (problem || (full.code !== undefined && UNEXPECTED_CODES.has(full.code))) problemHappened(`${full.code ? `${full.code} · ` : ''}${full.what}`);
  else if (unsent && !delivering && full.kind === 'request' && full.code && /^2\d\d$/.test(full.code)) void deliver(unsent);
}

function problemHappened(summary: string) {
  firstProblem ??= summary;
  if (timer) return;
  // A little later, so the log also shows what came right after (a retry, a reconnect).
  const wait = Math.max(PROBLEM_DELAY_MS, lastSent + PROBLEM_GAP_MS - Date.now());
  timer = setTimeout(() => {
    timer = undefined; const now = Date.now();
    sentThisHour = sentThisHour.filter(at => at > now - 3_600_000);
    const summaryText = firstProblem ?? 'Problem'; firstProblem = null;
    if (sentThisHour.length >= PROBLEMS_PER_HOUR) return;
    sentThisHour.push(now); lastSent = now;
    void deliver(build('problem', summaryText));
  }, wait);
}

/** Once per room on this tab: the whole log when the game is over. */
export function sendGameOver(sessionId: string) {
  const key = `party-log-sent-${sessionId}`;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* a private window sends it each time */ }
  const stats = deviceLog.stats();
  const timing = stats.requests ? ` · answers ${stats.requests.median} ms typical, ${stats.requests.max} ms slowest` : '';
  void deliver(build('game_over', `Game over${timing}${stats.reconnects ? ` · ${stats.reconnects} reconnects` : ''}`));
}

function build(reason: DeviceLogReason, summary: string): NewDeviceLog {
  return {
    id: crypto.randomUUID(), reason, summary: summary.slice(0, 300),
    sessionId: place.sessionId, lobbyId: place.lobbyId, playerId: place.playerId,
    device: { id: device(), role: place.role, userAgent: navigator.userAgent.slice(0, 300), viewport: { width: innerWidth, height: innerHeight } },
    stats: deviceLog.stats(), events: deviceLog.list(),
  };
}

/** Sends a log; one that could not be sent (no connection) is tried again once a request works again. */
async function deliver(report: NewDeviceLog) {
  unsent = report; delivering = true;
  try {
    const body = JSON.stringify(report);
    const response = await send('/api/diagnostics', { method: 'POST', credentials: 'same-origin', headers: { 'x-party-request': '1', 'content-type': 'application/json' }, body, keepalive: body.length < 60_000 });
    // Refused for its content or for space: sending it again would not help.
    if (response.ok || response.status === 400 || response.status === 507) { if (unsent === report) unsent = null; }
  } catch { /* kept in `unsent` */ } finally { delivering = false; }
}

function device() {
  if (deviceId) return deviceId;
  try { deviceId = sessionStorage.getItem('party-device-id') ?? ''; } catch { /* not kept */ }
  if (!deviceId) { deviceId = crypto.randomUUID().slice(0, 8); try { sessionStorage.setItem('party-device-id', deviceId); } catch { /* not kept */ } }
  return deviceId;
}
function safeScreen() { try { return screenName(); } catch { return 'unknown'; } }

/** Keeps the log over a reload of this tab (never longer: sessionStorage ends with the tab). */
export function keepOverReload() { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(deviceLog.list())); } catch { /* full or private */ } }
export function restoreAfterReload() {
  try { const saved = sessionStorage.getItem(STORE_KEY); if (saved && saved.length < 200_000) deviceLog.restore(JSON.parse(saved)); sessionStorage.removeItem(STORE_KEY); } catch { /* nothing kept */ }
}
