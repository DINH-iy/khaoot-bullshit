import { useEffect, useState } from 'react';
import { HostAccessSchema, type HostAccess } from '@party/contracts';
import { isUnavailablePageError } from '../navigation.js';
import { roomApi } from '../room/api.js';

export type HostRole = NonNullable<HostAccess['role']>;
type Access = HostRole | 'denied' | 'error';
type Check = { identity: object | null | undefined; role: Access; localSignIn: boolean };

/** Checks the browser's current server permissions without loading the game list. */
export function useHostAccess({ enabled = true, identity, refreshOnFocus = false }: {
  enabled?: boolean; identity?: object | null; refreshOnFocus?: boolean;
} = {}) {
  const [check, setCheck] = useState<Check>();
  useEffect(() => {
    if (!enabled) { setCheck(undefined); return; }
    let latest = 0;
    const load = () => {
      const request = ++latest;
      setCheck(undefined);
      void roomApi('/api/host/access').then(data => {
        if (request !== latest) return;
        const access = HostAccessSchema.parse(data);
        setCheck({ identity, role: access.role ?? 'denied', localSignIn: access.localSignIn });
      }).catch(cause => {
        if (request === latest) setCheck({ identity, role: isUnavailablePageError(cause) ? 'denied' : 'error', localSignIn: false });
      });
    };
    load();
    if (refreshOnFocus) window.addEventListener('focus', load);
    return () => { latest++; window.removeEventListener('focus', load); };
  }, [enabled, identity, refreshOnFocus]);
  return enabled && check?.identity === identity ? check : undefined;
}

export function hostMenuHref(role: Access | null | undefined) {
  return role === 'owner' ? '/?host=1' : role === 'editor' ? '/?host=1#my-games' : undefined;
}
