import { useEffect, useState } from 'react';

/**
 * The server's time on this device, redrawn every frame while `running`.
 * `offset` is server time minus device time, so a phone with a wrong clock
 * still starts and ends together with everyone else.
 */
export function useServerNow(offset: number, running: boolean): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    if (!running) return;
    let frame = requestAnimationFrame(function tick() { setNow(Date.now() + offset); frame = requestAnimationFrame(tick); });
    return () => cancelAnimationFrame(frame);
  }, [offset, running]);
  return now;
}

