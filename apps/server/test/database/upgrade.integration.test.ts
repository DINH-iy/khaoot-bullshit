import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { afterAll, expect, it } from 'vitest';
import pg from 'pg';

const connection = process.env['DATABASE_URL'];
if (!connection || !new URL(connection).pathname.endsWith('_test')) throw new Error('Upgrade test requires a dedicated test database.');
const admin = new pg.Pool({ connectionString: connection, max: 1, connectionTimeoutMillis: 2000 });
afterAll(async () => { await admin.end(); });

it('upgrades populated initial tables without losing existing game data', async () => {
  // Only this newly generated disposable test database is ever dropped.
  const name = `upgrade_${randomUUID().replaceAll('-', '')}_test`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const target = new URL(connection); target.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1 });
  try {
    const directory = new URL('../../database/migrations/', import.meta.url);
    const migrations = (await readdir(directory, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
    expect(migrations).toHaveLength(4);
    await pool.query(await readFile(new URL(`${migrations[0]}/migration.sql`, directory), 'utf8'));
    const { rows: creators } = await pool.query('INSERT INTO creators (issuer, subject) VALUES ($1, $2) RETURNING id', ['https://identity.example/', randomUUID()]);
    const { rows: games } = await pool.query('INSERT INTO games ("creatorId", title) VALUES ($1, $2) RETURNING id', [creators[0].id, 'Preserved game']);
    await pool.query('INSERT INTO game_drafts ("gameId", definition) VALUES ($1, $2)', [games[0].id, { schemaVersion: 1, nodes: [] }]);
    for (const migration of migrations.slice(1)) await pool.query(await readFile(new URL(`${migration}/migration.sql`, directory), 'utf8'));
    const { rows } = await pool.query('SELECT title, definition FROM games JOIN game_drafts ON games.id = game_drafts."gameId" WHERE games.id = $1', [games[0].id]);
    expect(rows).toEqual([{ title: 'Preserved game', definition: { schemaVersion: 1, nodes: [] } }]);
    await expect(pool.query('UPDATE game_drafts SET revision = -1 WHERE "gameId" = $1', [games[0].id])).rejects.toThrow();
    expect((await pool.query("SELECT to_regclass('stage_judgments') AS name")).rows).toEqual([{ name: 'stage_judgments' }]);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}"`);
  }
});
