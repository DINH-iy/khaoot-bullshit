import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { registerGrapherImport } from '../../src/authoring/grapher-import.js';
import { readConfig } from '../../src/config.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createOwnerAccess } from '../../src/hosting/owner-access.js';

it('only imports for editors, maps a public chart to bounded Grapher requests, and refuses other destinations', async () => {
  const token = 'a'.repeat(43);
  const config = readConfig({ NODE_ENV: 'test', LOCAL_OWNER_TOKEN: token, ROOM_TOKEN_SECRET: 'a'.repeat(64) });
  const app = Fastify();
  const csv = 'entity,code,year,life_expectancy\nNetherlands,NLD,2000,78';
  const metadata = { chart: { title: 'Life expectancy' }, columns: { life_expectancy: { unit: 'years' } } };
  const fetch = vi.fn(async (url: URL, _options: RequestInit) => new Response(url.pathname.endsWith('.csv') ? csv : JSON.stringify(metadata)));
  vi.stubGlobal('fetch', fetch);
  try {
    registerGrapherImport(app, createOwnerAccess(app, config, {} as PrismaClient));
    const post = (url: string, signedIn = true) => app.inject({
      method: 'POST', url: '/api/host/graph-import', payload: { url },
      headers: { 'x-party-request': '1', origin: config.PUBLIC_ORIGIN, ...(signedIn ? { cookie: `party_owner=${token}` } : {}) },
    });
    const link = 'https://ourworldindata.org/grapher/life-expectancy?country=~NLD&time=2000..2022&ignored=1';
    expect((await post(link, false)).statusCode).toBe(401);
    for (const invalid of [
      'https://ourworldindata.org@example.org/grapher/life-expectancy',
      'https://example.org/grapher/life-expectancy',
      'http://ourworldindata.org/grapher/life-expectancy',
      'https://ourworldindata.org/grapher/life-expectancy.csv',
    ]) {
      expect((await post(invalid)).json()).toEqual({ ok: false, error: { code: 'UNSUPPORTED_GRAPH_URL' } });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect((await post(link)).json()).toMatchObject({ ok: true, data: { csv, metadata } });
    expect(fetch.mock.calls.map(([url]) => url.pathname)).toEqual(['/grapher/life-expectancy.csv', '/grapher/life-expectancy.metadata.json']);
    for (const [url, options] of fetch.mock.calls) {
      expect(url.origin).toBe('https://ourworldindata.org');
      expect(Object.fromEntries(url.searchParams)).toEqual({ country: '~NLD', time: '2000..2022', v: '1', csvType: 'filtered', useColumnShortNames: 'true' });
      expect(options.redirect).toBe('error');
    }
    fetch.mockResolvedValueOnce(new Response('a'.repeat(512 * 1024 + 1)));
    expect((await post(link)).json()).toEqual({ ok: false, error: { code: 'GRAPH_DOWNLOAD_FAILED' } });
  } finally {
    vi.unstubAllGlobals();
    await app.close();
  }
});
