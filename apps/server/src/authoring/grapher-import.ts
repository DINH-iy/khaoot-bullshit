import type { FastifyInstance } from 'fastify';
import { GrapherImportMetadataSchema, GrapherImportRequestSchema } from '@party/contracts';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { RateLimiter, roomAssert } from '../rooms/security.js';

const ORIGIN = 'https://ourworldindata.org';
export function grapherUrls(input: string) {
  const url = URL.parse(input);
  if (!url || url.origin !== ORIGIN || url.username || url.password || !/^\/grapher\/[a-z0-9][a-z0-9-]{0,149}\/?$/.test(url.pathname)) return null;
  const source = new URL(url.pathname.replace(/\/$/, ''), ORIGIN);
  for (const key of ['country', 'time']) {
    const value = url.searchParams.get(key);
    if (value && value.length <= 200) source.searchParams.set(key, value);
  }
  if (source.href.length > 500) return null;
  const endpoint = (extension: string) => {
    const out = new URL(source);
    out.pathname += extension;
    out.searchParams.set('v', '1');
    out.searchParams.set('csvType', 'filtered');
    out.searchParams.set('useColumnShortNames', 'true');
    return out;
  };
  return { source: source.href, csv: endpoint('.csv'), metadata: endpoint('.metadata.json') };
}

async function download(url: URL, limit: number, signal: AbortSignal) {
  const response = await fetch(url, { redirect: 'error', signal });
  const reader = response.body?.getReader();
  if (!response.ok || !reader) {
    await reader?.cancel().catch(() => {});
    throw new Error('Download failed');
  }
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.byteLength;
      if (size > limit) throw new Error('Download too large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function registerGrapherImport(app: FastifyInstance, owner: OwnerAccess) {
  const limiter = new RateLimiter(1024);
  app.post('/api/host/graph-import', { bodyLimit: 4096 }, async (request, reply) => {
    try {
      await owner.requireEditor(request, 'edit');
      roomAssert(limiter.allow(request.ip, 12), 'RATE_LIMITED');
    } catch (error) { return owner.fail(reply, error); }
    const body = GrapherImportRequestSchema.safeParse(request.body);
    const urls = body.success ? grapherUrls(body.data.url) : null;
    if (!urls) return reply.code(400).send({ ok: false, error: { code: 'UNSUPPORTED_GRAPH_URL' } });
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]);
    try {
      const [csv, metadata] = await Promise.all([download(urls.csv, 512 * 1024, signal), download(urls.metadata, 512 * 1024, signal)]);
      return { ok: true, data: { csv, metadata: GrapherImportMetadataSchema.parse(JSON.parse(metadata)), sourceUrl: urls.source } };
    } catch {
      return reply.code(502).send({ ok: false, error: { code: 'GRAPH_DOWNLOAD_FAILED' } });
    } finally { controller.abort(); }
  });
}
