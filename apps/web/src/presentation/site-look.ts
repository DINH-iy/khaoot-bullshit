import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { SiteLookSchema, type Theme } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { buildLook, themeClass, themeStyle } from './look.js';

// The site's own look (Admin → Join screen): worn by the join screen and the arcade, where no game look applies.
// Read once per page load; without one (or when the server cannot be reached) the default look stays.
let loading: Promise<Theme | undefined> | undefined;
const readSiteTheme = () => loading ??= roomApi('/api/site/look').then(data => { const parsed = SiteLookSchema.safeParse(data); return parsed.success ? parsed.data.theme : undefined; }, () => { loading = undefined; return undefined; });

/** The site's theme once loaded, or undefined (default look) until then. */
export function useSiteTheme(): Theme | undefined {
  const [theme, setTheme] = useState<Theme | undefined>();
  useEffect(() => { let mounted = true; void readSiteTheme().then(value => { if (mounted) setTheme(value); }); return () => { mounted = false; }; }, []);
  return theme;
}

/** Style and classes for a page in the site's look (the arcade's home and lobby pages). */
export function useSiteLookFrame(): { style: CSSProperties; className: string } {
  const theme = useSiteTheme();
  return useMemo(() => { const look = buildLook(theme ? { themes: [theme] } : undefined); return { style: themeStyle(look.theme), className: themeClass(look.theme) }; }, [theme]);
}
