import { useEffect, useState } from 'react';
import { HostMenuSchema } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { rememberOwner } from './owner-session.js';
import { openFeedback } from '../feedback/open-feedback.js';
import { FEEDBACK_UI } from '../feedback/describe-element.js';
import './owner-nav.css';

export type OwnerSection = 'play' | 'host' | 'editor' | 'admin' | 'people' | 'packs' | 'look';
/** Who is working here: the owner, a person with editor rights, or nobody (null). */
export type HostRole = 'owner' | 'editor';
// The editor opens per game, so "Editor" leads to the list of games on the host menu.
const LINKS: { key: OwnerSection; label: string; href: string; editor: boolean }[] = [
  { key: 'play', label: 'Play', href: '/', editor: true },
  { key: 'host', label: 'Host', href: '/?host=1', editor: false },
  { key: 'editor', label: 'Editor', href: '/?host=1#my-games', editor: true },
  { key: 'admin', label: 'Admin', href: '/?admin', editor: false },
  { key: 'people', label: 'People', href: '/?admin=people', editor: false },
  { key: 'packs', label: 'Chips & packs', href: '/?admin=packs', editor: false },
  { key: 'look', label: 'Join screen', href: '/?admin=look', editor: false },
];

/** Asks the host endpoint once who this browser is. Never used on the player screen. */
export function useHostRole() {
  const [role, setRole] = useState<HostRole | null>(null);
  useEffect(() => {
    let mounted = true;
    roomApi('/api/host').then(data => {
      const found = HostMenuSchema.shape.role.parse((data as { role?: unknown }).role);
      rememberOwner(found === 'owner'); if (mounted) setRole(found);
    }, (cause: unknown) => {
      // Only a definite "not signed in" forgets the hint; a network hiccup says nothing.
      if (cause instanceof Error && cause.message === 'UNAUTHORIZED') rememberOwner(false);
    });
    return () => { mounted = false; };
  }, []);
  return role;
}

/** The top bar for the owner (everything) and for editors (Play and Editor only), with Feedback on the right. Nothing for anyone else. */
export function OwnerNav({ current, role }: { current: OwnerSection; role: HostRole | null }) {
  if (!role) return null;
  return <nav className="owner-nav" aria-label={role === 'owner' ? 'Owner' : 'Editor'}>
    <ul>{LINKS.filter(link => role === 'owner' || link.editor).map(link => <li key={link.key}><a href={link.href} aria-current={link.key === current ? 'page' : undefined}>{link.label}</a></li>)}
      <li className="owner-nav-end"><button type="button" {...{ [FEEDBACK_UI]: '' }} onClick={openFeedback}>Feedback</button></li></ul>
  </nav>;
}
