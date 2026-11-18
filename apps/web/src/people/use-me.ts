import { useCallback, useEffect, useState } from 'react';
import { MeSchema, type Me } from '@party/contracts';
import { roomApi } from '../room/api.js';

// A personal link looks like /#person=<key>. The key is taken out of the address
// at once (never kept in history) and exchanged for this phone's own sign-in.
const initial = new URL(location.href);
const linkToken = new URLSearchParams(initial.hash.slice(1)).get('person');
if (linkToken) history.replaceState(null, '', `${initial.pathname}${initial.search}`);
let claiming: Promise<string | null> | null = linkToken
  ? roomApi<{ name: string }>('/api/people/claim', { token: linkToken }).then(result => result.name).catch(() => null) : null;

/** The sign-in from a personal link in this page's address, while it is still going (an editor invite waits for it). */
export const pendingClaim = () => claiming;

export type Person = NonNullable<Me['person']>;
/** Who this phone is (a person the owner made), or null for a guest; undefined while loading. */
export function useMe() {
  const [person, setPerson] = useState<Person | null>();
  const [linked, setLinked] = useState<{ name: string | null } | null>(null);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (claiming) { const name = await claiming; claiming = null; if (mounted) setLinked({ name }); }
      const me = MeSchema.parse(await roomApi('/api/people/me'));
      if (mounted) setPerson(me.person);
    })().catch(() => { if (mounted) setPerson(null); });
    return () => { mounted = false; };
  }, []);
  const forget = useCallback(async () => { await roomApi('/api/people/forget', {}); setPerson(null); setLinked(null); }, []);
  /** Signs this phone in with a typed personal key. Throws UNAUTHORIZED for a key that does not work. */
  const signIn = useCallback(async (key: string) => {
    const result = await roomApi<{ name: string }>('/api/people/claim', { token: key.trim().slice(0, 64) });
    setLinked({ name: result.name });
    setPerson(MeSchema.parse(await roomApi('/api/people/me')).person);
  }, []);
  /** Asks the server again who this phone is (after it was signed in another way: a new account, an approved name). */
  const refresh = useCallback(async () => { const me = MeSchema.parse(await roomApi('/api/people/me')).person; setPerson(me); return me; }, []);
  return { person, linked, forget, signIn, refresh };
}
