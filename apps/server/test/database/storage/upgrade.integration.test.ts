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
    const directory = new URL('../../../database/migrations/', import.meta.url);
    const migrations = (await readdir(directory, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
    expect(migrations).toContain('20261119222000_idle_room_closing');
    await pool.query(await readFile(new URL(`${migrations[0]}/migration.sql`, directory), 'utf8'));
    const { rows: creators } = await pool.query('INSERT INTO creators (issuer, subject) VALUES ($1, $2) RETURNING id', ['https://identity.example/', randomUUID()]);
    const { rows: games } = await pool.query('INSERT INTO games ("creatorId", title) VALUES ($1, $2) RETURNING id', [creators[0].id, 'Preserved game']);
    await pool.query('INSERT INTO game_drafts ("gameId", definition) VALUES ($1, $2)', [games[0].id, { schemaVersion: 1, nodes: [] }]);
    for (const migration of migrations.slice(1)) await pool.query(await readFile(new URL(`${migration}/migration.sql`, directory), 'utf8'));
    const { rows } = await pool.query('SELECT title, definition FROM games JOIN game_drafts ON games.id = game_drafts."gameId" WHERE games.id = $1', [games[0].id]);
    expect(rows).toEqual([{ title: 'Preserved game', definition: { schemaVersion: 1, nodes: [] } }]);
    await expect(pool.query('UPDATE game_drafts SET revision = -1 WHERE "gameId" = $1', [games[0].id])).rejects.toThrow();
    expect((await pool.query("SELECT to_regclass('stage_judgments') AS name")).rows).toEqual([{ name: 'stage_judgments' }]);
    // Existing rooms start with no pending idle closure.
    expect((await pool.query("SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = 'game_sessions' AND column_name = 'idleCloseAt'")).rows)
      .toEqual([{ is_nullable: 'YES', column_default: null }]);
    // Player looks are optional: earlier players keep the default look made from their ID.
    expect((await pool.query("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'session_players' AND column_name = 'look'")).rows).toEqual([{ is_nullable: 'YES' }]);
    // Feedback is a table of its own: adding it leaves every game table as it was.
    expect((await pool.query("SELECT to_regclass('feedback_items') AS name")).rows).toEqual([{ name: 'feedback_items' }]);
    // Prefabs and phone challenges are tables of their own.
    expect((await pool.query("SELECT to_regclass('side_challenges') AS name")).rows).toEqual([{ name: 'side_challenges' }]);
    expect((await pool.query("SELECT to_regclass('scene_prefabs') AS name")).rows).toEqual([{ name: 'scene_prefabs' }]);
    // The owner's own versions of built-in games: at most one per built-in game.
    expect((await pool.query("SELECT to_regclass('\"games_creatorId_builtInKey_key\"') AS name")).rows).toEqual([{ name: '"games_creatorId_builtInKey_key"' }]);
    // The arcade is tables of its own, with one unfinished round per lobby at most.
    expect((await pool.query("SELECT to_regclass('arcade_rounds_one_open_per_lobby') AS name")).rows).toEqual([{ name: 'arcade_rounds_one_open_per_lobby' }]);
    // Challenge stakes may be bets and payouts without a side-game round; slot and blackjack ones still need their round.
    const rule = (await pool.query("SELECT pg_get_constraintdef(oid) AS rule FROM pg_constraint WHERE conname = 'chips_valid_amount'")).rows[0].rule as string;
    expect(rule).toContain('tictactoe'); expect(rule).toContain('"roundId" IS NOT NULL');
    // Keys and editor rights only add columns: nobody becomes an editor by upgrading.
    expect((await pool.query("SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'people' AND column_name IN ('canEdit', 'keySealed') ORDER BY column_name")).rows).toEqual([{ column_name: 'canEdit', is_nullable: 'NO', column_default: 'false' }, { column_name: 'keySealed', is_nullable: 'YES', column_default: null }]);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}"`);
  }
});
