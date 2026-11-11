import { fileURLToPath } from 'node:url';
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const serverRoot = fileURLToPath(new URL('../../apps/server/', import.meta.url));
export function loadLocalEnvironment() {
  try { process.loadEnvFile(new URL('../../.env', import.meta.url)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export function testDatabaseUrl(value) {
  if (!value) throw new Error('TEST_DATABASE_URL must be explicitly configured.');
  const url = new URL(value);
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !decodeURIComponent(url.pathname).endsWith('_test') || !['127.0.0.1', 'localhost', 'postgres-test'].includes(url.hostname)) {
    throw new Error('Integration tests require a local PostgreSQL database ending in _test.');
  }
  return value;
}
