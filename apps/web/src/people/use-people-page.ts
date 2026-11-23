import { useCallback, useEffect, useState } from 'react';
import { PeoplePageSchema, type PeoplePage } from '@party/contracts';
import { roomApi } from '../room/api.js';

/**
 * The owner's people a page at a time (A–Z), searched on the server, so every list of people works the same
 * however many there are: Admin → People, a group's members, a room's "Add people" and the editor's invites.
 * Typing waits a moment before searching, and a new search starts on the first page.
 */
export function usePeoplePage({ withKeys = false, enabled = true }: { withKeys?: boolean; enabled?: boolean } = {}) {
  const [search, setSearch] = useState(''); const [query, setQuery] = useState(''); const [page, setPage] = useState(0);
  const [data, setData] = useState<PeoplePage>(); const [failed, setFailed] = useState(false); const [version, setVersion] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!enabled) return; let live = true;
    const params = new URLSearchParams({ page: String(page), ...(query ? { search: query } : {}), ...(withKeys ? { withKeys: '1' } : {}) });
    void roomApi(`/api/host/people?${params}`).then(result => { if (live) { setData(PeoplePageSchema.parse(result)); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [page, query, withKeys, enabled, version]);
  // The last person on the last page was removed: show the page before it.
  useEffect(() => { if (data && page > 0 && !data.people.length && data.total > 0) setPage(Math.max(0, Math.ceil(data.total / data.pageSize) - 1)); }, [data, page]);
  const reload = useCallback(() => setVersion(current => current + 1), []);
  /** Pages in all, for the page buttons. */
  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
  return { search, setSearch, query, page, setPage, pages, data, failed, reload };
}
export type PeoplePaging = ReturnType<typeof usePeoplePage>;
