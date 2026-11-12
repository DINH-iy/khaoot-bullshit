import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';
import type { Identity, Health } from '@party/contracts';
import type { Config } from './config.js';
import type { DatabaseHealth } from './database/client.js';
import { AuthenticationUnavailable, createTokenVerifier, type TokenVerifier } from './auth.js';
import { RequestMetrics, now } from './observability.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { registerRoomNetworking } from './rooms/network.js';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'node:url';

export function buildApp(config: Config, options: { verifyToken?: TokenVerifier; logStream?: NodeJS.WritableStream; database?: DatabaseHealth & { client?: PrismaClient } } = {}) {
  const app = Fastify({
    bodyLimit: 16 * 1024,
    requestTimeout: 10000,
    connectionTimeout: 10000,
    trustProxy: false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    logger: {
      level: config.LOG_LEVEL,
      ...(options.logStream ? { stream: options.logStream } : {}),
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'token', 'authorization', 'cookie'], censor: '[REDACTED]' },
      serializers: { req: (request: FastifyRequest) => ({ method: request.method, path: request.url.split('?')[0] }) },
      base: { service: 'party-server', version: config.APP_VERSION },
    },
  });
  const verifier = options.verifyToken ?? createTokenVerifier(config);
  const metrics = new RequestMetrics();
  const requests = new WeakMap<FastifyRequest, { start: number; span: Span }>();
  const identities = new WeakMap<FastifyRequest, Identity>();
  void app.register(helmet, { contentSecurityPolicy: { directives: {
    'upgrade-insecure-requests': config.PUBLIC_ORIGIN.startsWith('https:') ? [] : null,
    'connect-src': ["'self'", config.PUBLIC_ORIGIN.replace(/^http/, 'ws')],
  } } });

  app.addHook('onRequest', async (request, reply) => {
    const span = trace.getTracer('party-server').startSpan('http.request', { attributes: { 'http.request.method': request.method } });
    requests.set(request, { start: now(), span });
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
  });
  app.addHook('onSend', async (request, reply, payload) => {
    const state = requests.get(request);
    if (state) reply.header('server-timing', `app;dur=${(now() - state.start).toFixed(2)}`);
    return payload;
  });
  app.addHook('onResponse', async (request, reply) => {
    const state = requests.get(request);
    if (!state) return;
    const durationMs = now() - state.start;
    metrics.record(durationMs, reply.statusCode);
    state.span.setAttributes({ 'http.route': request.routeOptions.url ?? 'unmatched', 'http.response.status_code': reply.statusCode });
    if (reply.statusCode >= 500) state.span.setStatus({ code: SpanStatusCode.ERROR });
    state.span.end();
    request.log.info({ event: 'request_completed', route: request.routeOptions.url ?? 'unmatched', statusCode: reply.statusCode, durationMs }, 'Request completed');
  });
  app.addHook('onClose', async () => { metrics.close(); await options.database?.close(); });

  const problem = (request: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) => reply.code(status).send({ error: { code, message, requestId: request.id } });
  app.setErrorHandler((error, request, reply) => {
    const httpError = error instanceof Error && 'statusCode' in error ? error : undefined;
    const statusCode = typeof httpError?.statusCode === 'number' && httpError.statusCode >= 400 && httpError.statusCode < 500 ? httpError.statusCode : 500;
    if (statusCode === 500) request.log.error({ err: error, event: 'request_failed' }, 'Unexpected request failure');
    else request.log.warn({ event: 'request_rejected', statusCode }, 'Request rejected');
    return problem(request, reply, statusCode, statusCode === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', statusCode === 500 ? 'An unexpected error occurred.' : 'The request could not be processed.');
  });
  app.setNotFoundHandler((request, reply) => problem(request, reply, 404, 'NOT_FOUND', 'Route not found.'));

  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!verifier) return problem(request, reply, 503, 'AUTH_UNAVAILABLE', 'Sign-in is not configured.');
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) {
      reply.header('www-authenticate', 'Bearer');
      return problem(request, reply, 401, 'UNAUTHORIZED', 'A valid access token is required.');
    }
    try { identities.set(request, await verifier(authorization.slice(7))); }
    catch (error) {
      if (error instanceof AuthenticationUnavailable) return problem(request, reply, 503, 'AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
      request.log.warn({ event: 'authentication_rejected' }, 'Access token rejected');
      reply.header('www-authenticate', 'Bearer');
      return problem(request, reply, 401, 'UNAUTHORIZED', 'A valid access token is required.');
    }
  };
  const health = (ready: boolean, database: Health['checks']['database']): Health => ({ status: ready ? 'ok' : 'not_ready', service: 'party-server', version: config.APP_VERSION, checks: { authentication: verifier ? 'configured' : 'not_configured', database } });
  app.get('/api/health/live', async () => health(true, options.database ? 'not_checked' : 'not_configured'));
  app.get('/api/health/ready', async (request, reply) => {
    let database: Health['checks']['database'] = 'not_configured';
    if (options.database) {
      try { await options.database.check(); database = 'available'; }
      catch { database = 'unavailable'; request.log.warn({ event: 'database_check_failed' }, 'Database readiness check failed'); }
    }
    const ready = Boolean(verifier) && database === 'available';
    return reply.code(ready ? 200 : 503).send(health(ready, database));
  });
  app.get('/api/me', { preHandler: authenticate }, async request => identities.get(request));
  app.get('/api/ops/metrics', { preHandler: authenticate }, async (request, reply) => {
    if (!identities.get(request)?.scopes.includes('ops:read')) return problem(request, reply, 403, 'FORBIDDEN', 'Operational access is required.');
    return { ...metrics.snapshot(), database: options.database?.snapshot() ?? null };
  });
  if (options.database?.client && config.ROOM_TOKEN_SECRET) registerRoomNetworking(app, options.database.client, config, verifier);
  if (config.SERVE_WEB) {
    void app.register(staticFiles, { root: fileURLToPath(new URL('../../web/dist/', import.meta.url)), prefix: '/', wildcard: false, index: false, cacheControl: false });
    app.get('/', async (_request, reply) => reply.sendFile('index.html'));
  }
  return app;
}
