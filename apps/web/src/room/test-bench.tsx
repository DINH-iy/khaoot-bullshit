import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GameIdSchema, RoomSnapshotSchema, formatRoomCode } from '@party/contracts';
import { newId, roomApi } from './api.js';
import { FaIcon } from '../presentation/icons.js';
import { TryoutControls } from './tryout/controls.js';
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
  const [rememberedTryout, setRememberedTryout] = useState(() => GameIdSchema.safeParse(new URLSearchParams(location.search).get('tryout')).data);
  const [activeId, setActiveId] = useState(rememberedTryout ?? sessionId);
  const [loaded, setLoaded] = useState<{ id: string; code: string; tryout: boolean }>();
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const launchRequest = useRef<{ sessionId: string; commandId: string }>(null);
  const benchRoom = loaded?.id === activeId ? loaded : undefined;
  const changeRoom = (id: string) => {
    const url = new URL(location.href);
    if (id === sessionId) url.searchParams.delete('tryout');
    else url.searchParams.set('tryout', id);
    history.replaceState(history.state, '', url);
    setActiveId(id);
  };
  const openTryout = async () => {
    if (opening) return;
    if (rememberedTryout) { changeRoom(rememberedTryout); return; }
    setOpening(true);
    setError('');
    launchRequest.current ??= { sessionId: newId(), commandId: newId() };
    try {
      const result = await roomApi<{ sessionId: string }>('/api/host/minigame-tryout', launchRequest.current);
      setRememberedTryout(result.sessionId);
      changeRoom(result.sessionId);
      launchRequest.current = null;
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'UNAUTHORIZED') setError('Sign in as owner or editor to open Minigame Tryout.');
      else setError('Could not open Minigame Tryout. Try again.');
    } finally { setOpening(false); }
  };
  const [count, setCount] = useState(storedCount);
  // Real phones next to the virtual ones: the host screen shows the QR code and room code again.
  const [real, setReal] = useState(() => { try { return localStorage.getItem(REAL_KEY) === '1'; } catch { return false; } });
  const changeReal = (next: boolean) => { setReal(next); try { localStorage.setItem(REAL_KEY, next ? '1' : '0'); } catch { /* this visit only */ } };
  // A frame reloads when its key changes (one counter per phone).
  const [reloads, setReloads] = useState<number[]>(() => Array.from({ length: MAX_PHONES }, () => 0));
  useEffect(() => {
    let current = true;
    setError('');
    // Opening a regular bench lets its phones join. A tryout is created with bench access.
    void roomApi(`/api/rooms/${activeId}`).then(async data => {
      const snapshot = RoomSnapshotSchema.parse(data);
      if (snapshot.role !== 'host' || snapshot.roomClosed || (activeId !== sessionId && !snapshot.tryout)) throw new Error('Bench access denied');
      if (!snapshot.settings.testBench) await roomApi(`/api/rooms/${activeId}/settings`, { testBench: true });
      if (current) setLoaded({ id: activeId, code: snapshot.roomCode, tryout: snapshot.tryout === true });
    }).catch(() => {
      if (!current) return;
      if (activeId === sessionId) setError('This browser is not the host of that room. Open the test bench from the host screen (Shared screen & invite).');
      else {
        setRememberedTryout(undefined);
        changeRoom(sessionId);
      }
    });
    return () => { current = false; };
  }, [activeId, sessionId]);
  const changeCount = (next: number) => { const value = Math.max(1, Math.min(MAX_PHONES, next)); setCount(value); try { localStorage.setItem(COUNT_KEY, String(value)); } catch { /* this visit only */ } };
  const reload = (index: number) => setReloads(current => current.map((value, at) => at === index ? value + 1 : value));
  return <main className="bench">
    <header className="bench-bar">
      <p className="bench-title"><strong>Test bench</strong>{benchRoom && <> · room <code>{formatRoomCode(benchRoom.code)}</code></>}</p>
      <p className="bench-hint">The host screen on the left; each phone is its own player and joins by itself. Add or remove phones with − and +.</p>
      {activeId !== sessionId ? <button type="button" className="bench-mode" onClick={() => changeRoom(sessionId)}>Back to test bench</button>
        : benchRoom?.tryout ? <a className="bench-back link-button" href="/?host=1">Back to host menu</a>
        : benchRoom && <button type="button" className="bench-mode" disabled={opening} onClick={() => void openTryout()}>
          {opening ? 'Opening tryout…' : 'Minigame Tryout'}
        </button>}
      <label className="bench-real"><input type="checkbox" checked={real} onChange={event => changeReal(event.target.checked)} />Real phones can join too</label>
      <div className="bench-count" role="group" aria-label="Phones">
        <button type="button" className="bench-icon" aria-label="One phone less" disabled={count <= 1} onClick={() => changeCount(count - 1)}><FaIcon name="minus" /></button>
        <span aria-live="polite">{count} {count === 1 ? 'phone' : 'phones'}</span>
        <button type="button" className="bench-icon" aria-label="One phone more" disabled={count >= MAX_PHONES} onClick={() => changeCount(count + 1)}><FaIcon name="plus" /></button>
      </div>
    </header>
    {error && <p role="alert" className="bench-error">{error}</p>}
    {benchRoom?.tryout && <TryoutControls key={`controls:${benchRoom.id}`} sessionId={benchRoom.id} phones={count} />}
    {benchRoom && <div className="bench-stage" key={`frames:${benchRoom.id}`}>
      <iframe key={real ? 'real' : 'bench'} className="bench-host" title="Host screen" src={`/?room=${benchRoom.id}&bench=${real ? 'real' : '1'}`} />
      <div className="bench-phones" data-count={count}>
        {Array.from({ length: count }, (_, index) => <BenchPhone key={index} seat={index + 1} code={benchRoom.code}
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
