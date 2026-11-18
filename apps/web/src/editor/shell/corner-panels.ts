import { useEffect, useState } from 'react';

// The editor's bottom-left corner (History, Problems): one list open at a time, so an open list never sits on or
// pushes aside the other. Open or folded is remembered in this browser.
const EVENT = 'party:corner-open';
export function useCornerPanel(name: string, storageKey: string) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(storageKey) === '1'; } catch { return false; } });
  const change = (next: boolean) => {
    setOpen(next); try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* only for this page */ }
    if (next) window.dispatchEvent(new CustomEvent(EVENT, { detail: name }));
  };
  useEffect(() => {
    const other = (event: Event) => { if ((event as CustomEvent<string>).detail !== name) { setOpen(false); try { localStorage.setItem(storageKey, '0'); } catch { /* fine */ } } };
    window.addEventListener(EVENT, other); return () => window.removeEventListener(EVENT, other);
  }, [name, storageKey]);
  return [open, change] as const;
}
