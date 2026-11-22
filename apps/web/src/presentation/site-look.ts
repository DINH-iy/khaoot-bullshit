import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { resolveTheme, SiteLookSchema, type Theme } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { themeClass, useThemeStyle } from './look.js';

// The site's own look (Admin → Join screen): worn by the join screen and the arcade, where no game look applies.
// Read once per page load; without one (or when the server cannot be reached) the default look stays.
let loading: Promise<Theme | undefined> | undefined;
let loaded: { theme: Theme | undefined } | undefined;
const readSiteTheme = () => loading ??= roomApi('/api/site/look').then(data => {
  const parsed = SiteLookSchema.safeParse(data);
  const theme = parsed.success ? parsed.data.theme : undefined;
  loaded = { theme };
  return theme;
}, () => { loading = undefined; return undefined; });

/** An absent result means loading. A resolved result without a theme uses the default. */
export function useSiteThemeState(): { theme: Theme | undefined } | undefined {
  const [result, setResult] = useState(() => loaded);
  useEffect(() => {
    if (loaded) { setResult(loaded); return; }
    let mounted = true;
    void readSiteTheme().then(theme => { if (mounted) setResult(loaded ?? { theme }); });
    return () => { mounted = false; };
  }, []);
  return result;
}

/** Style and classes for a page in the site's look (the arcade's home and lobby pages). */
export function useSiteLookFrame(): { style: CSSProperties; className: string } {
  const theme = useSiteThemeState()?.theme;
  const full = useMemo(() => resolveTheme(theme), [theme]);
  return { style: useThemeStyle(full), className: themeClass(full) };
}
