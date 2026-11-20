import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RoomSnapshotSchema, formatRoomCode } from '@party/contracts';
import { roomApi } from './api.js';
import { FaIcon } from '../presentation/icons.js';
import './test-bench.css';

const COUNT_KEY = 'party_bench_phones'; const REAL_KEY = 'party_bench_real';
const MAX_PHONES = 4;
const storedCount = () => { try { const value = Number(localStorage.getItem(COUNT_KEY)); return Number.isInteger(value) && value >= 1 ? Math.min(value, MAX_PHONES) : 2; } catch { return 2; } };

/**
 * Test bench (/?bench=<room>): play a whole game alone on one computer. The host screen on the left, phones on
 * the right, each its own player (Player 1, Player 2…) that joins by itself. Every phone is a frame named after
 * its seat (test-seat.ts), so the server keeps their sign-ins apart. Opening it allows bench phones in the room;
 * with "Real phones can join too" the host screen shows the QR code and room code, so real phones join as well.
 */
export function TestBench({ sessionId }: { sessionId: string }) {
  const [code, setCode] = useState<string>(); const [error, setError] = useState('');
  const [count, setCount] = useState(storedCount);
  // Real phones next to the virtual ones: the host screen shows the QR code and room code again.
  const [real, setReal] = useState(() => { try { return localStorage.getItem(REAL_KEY) === '1'; } catch { return false; } });
  const changeReal = (next: boolean) => { setReal(next); try { localStorage.setItem(REAL_KEY, next ? '1' : '0'); } catch { /* this visit only */ } };
  // A frame reloads when its key changes (one counter per phone).
  const [reloads, setReloads] = useState<number[]>(() => Array.from({ length: MAX_PHONES }, () => 0));
  useEffect(() => {
    // Opening the bench lets its phones join this room (Room settings → Joining can switch that off again).
    void roomApi(`/api/rooms/${sessionId}`).then(async data => {
      const snapshot = RoomSnapshotSchema.parse(data);
      await roomApi(`/api/rooms/${sessionId}/settings`, { testBench: true });
      setCode(snapshot.roomCode);
    })
      .catch(() => setError('This browser is not the host of that room. Open the test bench from the host screen (Shared screen & invite).'));
  }, [sessionId]);
  const changeCount = (next: number) => { const value = Math.max(1, Math.min(MAX_PHONES, next)); setCount(value); try { localStorage.setItem(COUNT_KEY, String(value)); } catch { /* this visit only */ } };
  const reload = (index: number) => setReloads(current => current.map((value, at) => at === index ? value + 1 : value));
  return <main className="bench">
    <header className="bench-bar">
      <p className="bench-title"><strong>Test bench</strong>{code && <> · room <code>{formatRoomCode(code)}</code></>}</p>
      <p className="bench-hint">The host screen on the left; each phone is its own player and joins by itself. Add or remove phones with − and +.</p>
      <label className="bench-real"><input type="checkbox" checked={real} onChange={event => changeReal(event.target.checked)} />Real phones can join too</label>
      <div className="bench-count" role="group" aria-label="Phones">
        <button type="button" className="bench-icon" aria-label="One phone less" disabled={count <= 1} onClick={() => changeCount(count - 1)}><FaIcon name="minus" /></button>
        <span aria-live="polite">{count} {count === 1 ? 'phone' : 'phones'}</span>
        <button type="button" className="bench-icon" aria-label="One phone more" disabled={count >= MAX_PHONES} onClick={() => changeCount(count + 1)}><FaIcon name="plus" /></button>
      </div>
    </header>
    {error && <p role="alert" className="bench-error">{error}</p>}
    {code && <div className="bench-stage">
      <iframe key={real ? 'real' : 'bench'} className="bench-host" title="Host screen" src={`/?room=${sessionId}&bench=${real ? 'real' : '1'}`} />
      <div className="bench-phones" data-count={count}>
        {Array.from({ length: count }, (_, index) => <BenchPhone key={index} seat={index + 1} code={code}
          reloadKey={reloads[index] ?? 0} onReload={() => reload(index)} />)}
      </div>
    </div>}
  </main>;
}

function BenchPhone({ seat, code, reloadKey, onReload }: { seat: number; code: string; reloadKey: number; onReload: () => void }) {
  const screen = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const wrapper = screen.current;
    if (!wrapper) return;
    const measure = () => setScale(wrapper.clientWidth / 390);
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper); measure();
    return () => observer.disconnect();
  }, []);
  const name = `Player ${seat}`;
  return <figure className="bench-phone">
    <figcaption><span>{name}</span><button type="button" className="bench-icon" aria-label={`Reload ${name}`} title="Reload this phone" onClick={onReload}><FaIcon name="rotate" /></button></figcaption>
    <div ref={screen} className="bench-screen">
      <iframe key={reloadKey} name={`party-seat-${seat}`} title={`Phone of ${name}`} style={{ transform: `scale(${scale})` }} src={`/?code=${code}&name=${encodeURIComponent(name)}`} />
    </div>
  </figure>;
}
