import { describe, expect, it } from 'vitest';
import { DeviceLog, logPath, Timing } from '../../src/diagnostics/device-log.js';

const event = (at: number, what = `step ${at}`, kind: 'tap' | 'request' = 'request') => ({ at, kind, screen: 'player phone', what });

describe('the log kept on a device', () => {
  it('keeps at most its capacity, dropping the oldest first', () => {
    const log = new DeviceLog(3, 60_000);
    for (let at = 1; at <= 5; at++) log.add(event(at));
    expect(log.list(5).map(entry => entry.what)).toEqual(['step 3', 'step 4', 'step 5']);
  });

  it('forgets events older than its age limit', () => {
    const log = new DeviceLog(100, 1000);
    log.add(event(0)); log.add(event(600)); log.add(event(1200));
    expect(log.list(1700).map(entry => entry.at)).toEqual([1200]);
  });

  it('counts a tap race as one event, but keeps separate controls and pauses apart', () => {
    const log = new DeviceLog(100, 60_000);
    for (let at = 0; at < 50; at++) log.add(event(1000 + at * 100, 'Tap (button)', 'tap'));
    log.add(event(6000, 'Lock in (button)', 'tap'));
    log.add(event(20_000, 'Lock in (button)', 'tap'));
    expect(log.list(20_000).map(entry => [entry.what, entry.n])).toEqual([['Tap (button)', 50], ['Lock in (button)', undefined], ['Lock in (button)', undefined]]);
  });

  it('hands out copies, and restores only well-formed events after a reload', () => {
    const log = new DeviceLog(100, 60_000); log.add(event(10));
    log.list(10)[0]!.what = 'changed';
    expect(log.list(10)[0]!.what).toBe('step 10');
    log.restore([event(5), { at: 'soon' }, null, 'text'], 10);
    expect(log.list(10).map(entry => entry.at)).toEqual([5, 10]);
  });

  it('sums up timings over everything, not only the events still kept', () => {
    const timing = new Timing();
    expect(timing.summary()).toBeNull();
    for (const ms of [30, 10, 20, 900]) timing.add(ms);
    expect(timing.summary()).toEqual({ count: 4, median: 30, max: 900 });
  });
});

describe('request addresses in a log', () => {
  it('keeps the path only, shortens ids and cuts anything that could be a key', () => {
    expect(logPath('/api/arcade/lobbies/1a2b3c4d-0000-4000-8000-123456789abc/start?password=secret#owner=key')).toBe('/api/arcade/lobbies/1a2b3c4d/start');
    expect(logPath('/api/host/claim/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe('/api/host/claim/AbCdEf…');
    expect(logPath('/api/rooms/ABC123/join')).toBe('/api/rooms/ABC123/join');
  });
});
