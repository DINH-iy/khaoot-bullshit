import { readConfig } from './config.js';
import { startTelemetry } from './telemetry.js';

const config = readConfig(process.env);
const telemetry = startTelemetry(config);
const { buildApp } = await import('./app.js');
const { createDatabase } = await import('./database/client.js');
const app = buildApp(config, config.DATABASE_URL ? { database: createDatabase(config.DATABASE_URL, config.DATABASE_POOL_MAX, () => app.log.error({ event: 'database_pool_error' }, 'An idle database connection failed')) } : {});
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ event: 'shutdown_started', signal }, 'Stopping server');
  const deadline = setTimeout(() => { process.exit(1); }, 10000);
  deadline.unref();
  try {
    await app.close();
    await telemetry?.shutdown();
    clearTimeout(deadline);
  } catch (error) {
    app.log.error({ err: error, event: 'shutdown_failed' }, 'Shutdown failed');
    process.exitCode = 1;
  }
}
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
// Observe fatal exceptions without swallowing them or continuing normal operation.
process.on('uncaughtExceptionMonitor', error => { app.log.fatal({ err: error, event: 'process_crashed' }, 'Fatal process failure'); });
try {
  await app.listen({ host: config.HOST, port: config.PORT });
  if (!config.AUTH_ISSUER) app.log.warn({ event: 'authentication_unconfigured' }, 'Creator sign-in is not configured; room credentials are verified separately');
} catch (error) {
  app.log.fatal({ err: error, event: 'startup_failed' }, 'Startup failed');
  await shutdown('startup_failure');
  process.exitCode = 1;
}
