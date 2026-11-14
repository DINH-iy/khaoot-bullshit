import { useEffect, useState } from 'react';
import { roomApi } from '../network/api.js';
import { rememberOwner } from './owner-session.js';
import './owner-nav.css';

export type OwnerSection = 'play' | 'host' | 'editor' | 'admin' | 'people';
// The editor opens per game, so "Editor" leads to the list of your games on the host menu.
const LINKS: { key: OwnerSection; label: string; href: string }[] = [
  { key: 'play', label: 'Play', href: '/' },
  { key: 'host', label: 'Host', href: '/?host=1' },
  { key: 'editor', label: 'Editor', href: '/?host=1#my-games' },
  { key: 'admin', label: 'Admin', href: '/?admin' },
  { key: 'people', label: 'People', href: '/?admin=people' },
];

/** Asks the owner endpoint once whether this browser is signed in. Never used on the player screen. */
function useOwnerCheck(skip: boolean) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (skip) return;
    let mounted = true;
    roomApi('/api/host').then(() => { rememberOwner(true); if (mounted) setSignedIn(true); }, (cause: unknown) => {
      // Only a definite "not the owner" forgets the hint; a network hiccup says nothing.
      if (cause instanceof Error && cause.message === 'UNAUTHORIZED') rememberOwner(false);
    });
    return () => { mounted = false; };
  }, [skip]);
  return signedIn;
}

/**
 * The owner's top bar: shown only to a signed-in owner. Pass `signedIn` when the
 * page already asked the owner endpoint (the host menu); otherwise it asks itself.
 */
export function OwnerNav({ current, signedIn }: { current: OwnerSection; signedIn?: boolean }) {
  const checked = useOwnerCheck(signedIn !== undefined);
  if (!(signedIn ?? checked)) return null;
  return <nav className="owner-nav" aria-label="Owner">
    <ul>{LINKS.map(link => <li key={link.key}><a href={link.href} aria-current={link.key === current ? 'page' : undefined}>{link.label}</a></li>)}</ul>
  </nav>;
}
