import pg from 'pg';
import { config } from '../config.js';

// BIGSERIAL/int8 vine implicit ca string; la scara aplicației e sigur ca număr.
pg.types.setTypeParser(20, Number);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
});

pool.on('error', (err) => {
  console.error('Eroare neașteptată pe conexiunea PostgreSQL:', err.message);
});

/** Rulează un callback într-o tranzacție; rollback automat la eroare. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Formatează un vector JS pentru coloana pgvector: '[0.1,0.2,...]' */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
