import { useEffect, useState } from 'react';

/**
 * The one loader for anything that waits on the server: the party logo with a soft pulse and three dots.
 * `full`: a whole screen (starting up, connecting to a room), centred on the room's dark background, never a blank
 * page. Otherwise a small inline one for a list or a panel. A quick answer shows nothing: it appears after a moment.
 */
export function Loader({ label, full = false, className }: { label: string; full?: boolean; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setShown(true), 180); return () => clearTimeout(timer); }, []);
  const inside = <>
    {full && <p className="page-loader-mark" aria-hidden="true">party<span>.</span></p>}
    <p className="page-loader-dots" aria-hidden="true"><i /><i /><i /></p>
    <p role="status" className={full ? 'visually-hidden' : 'loader-label'}>{label}</p>
  </>;
  return full ? <main className={`page-loader${shown ? ' shown' : ''}${className ? ` ${className}` : ''}`} aria-busy="true">{inside}</main>
    : <div className={`loader-inline${shown ? ' shown' : ''}${className ? ` ${className}` : ''}`} aria-busy="true">{inside}</div>;
}
