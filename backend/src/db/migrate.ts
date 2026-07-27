import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { config } from '../config.js';

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations');

export async function runMigrations(): Promise<string[]> {
  const applied: string[] = [];
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (done.has(file)) continue;
      const raw = await readFile(resolve(migrationsDir, file), 'utf8');
      const sql = raw.replaceAll('{{EMBED_DIM}}', String(config.EMBED_DIM));
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migrația ${file} a eșuat: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
  return applied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then((applied) => {
      console.log(applied.length ? `Migrații aplicate: ${applied.join(', ')}` : 'Nimic de aplicat — schema e la zi.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
