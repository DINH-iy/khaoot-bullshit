import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './environment.mjs';
const destination = resolve(projectRoot, '.env');
const devPassword = randomBytes(24).toString('hex');
const testPassword = randomBytes(24).toString('hex');
const example = await readFile(resolve(projectRoot, '.env.example'), 'utf8');
const content = example.replaceAll('REPLACE_DEV_PASSWORD', devPassword).replaceAll('REPLACE_TEST_PASSWORD', testPassword);
try {
  await writeFile(destination, content, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored .env with random local database credentials. No credentials printed.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env already exists; left unchanged. Check database settings against .env.example.');
}
