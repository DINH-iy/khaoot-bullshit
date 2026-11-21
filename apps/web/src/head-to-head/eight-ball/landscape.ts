import { useEffect, useRef, useState } from 'react';

type BrowserOrientation = ScreenOrientation & { lock?: (mode: 'landscape') => Promise<void>; unlock?: () => void };

export function usePoolLandscape() {
  const [landscape, setLandscape] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const ownedFullscreen = useRef(false);
  const mounted = useRef(true);
  const pending = useRef(false);

  function release() {
    if (!ownedFullscreen.current) return;
    ownedFullscreen.current = false;
    (screen.orientation as BrowserOrientation | undefined)?.unlock?.();
    if (document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => {});
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; release(); };
  }, []);

  useEffect(() => {
    if (!landscape) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [landscape]);

  const open = async () => {
    if (pending.current) return;
    pending.current = true;
    const orientation = screen.orientation as BrowserOrientation | undefined;
    try {
      if (orientation?.lock && document.fullscreenEnabled && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        ownedFullscreen.current = true;
        if (mounted.current) await orientation.lock('landscape');
      }
    } catch {
      // A platform lock can deny native rotation. The game view can still turn sideways.
    } finally {
      pending.current = false;
      if (mounted.current) setLandscape(true);
      else release();
    }
  };

  return { landscape, dialog, open, close: () => { release(); setLandscape(false); } };
}
