import { isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';

// Behind a local cloudflared tunnel every visitor arrives from the tunnel on this
// machine, so the TCP peer is always loopback. Cloudflare puts the visitor's address
// in CF-Connecting-IP. That header is trusted only when the owner opts in AND the
// request really came from this machine; anyone else could simply send it.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** The address per-visitor limits use: the TCP peer, or Cloudflare's visitor address when allowed. */
export function clientAddress(peer: string | undefined, headers: IncomingHttpHeaders, trustCloudflareLocal: boolean): string | undefined {
  if (!trustCloudflareLocal || peer === undefined || !LOOPBACK.has(peer)) return peer;
  const forwarded = headers['cf-connecting-ip'];
  // One plain IPv4/IPv6 address only. A repeated header arrives joined with commas (or as a list) and is ignored.
  if (typeof forwarded !== 'string' || forwarded.length > 45) return peer;
  const value = forwarded.trim();
  return isIP(value) ? value.toLowerCase() : peer;
}

/** Makes request.ip the visitor's address for every route, when TRUST_CLOUDFLARE_LOCAL is on. */
export function registerClientAddress(app: FastifyInstance, trustCloudflareLocal: boolean) {
  if (!trustCloudflareLocal) return;
  app.addHook('onRequest', async request => {
    const ip = clientAddress(request.socket.remoteAddress, request.headers, true);
    // An own property shadows Fastify's socket-based getter for this request only.
    Object.defineProperty(request, 'ip', { value: ip, enumerable: true, configurable: true });
  });
}
