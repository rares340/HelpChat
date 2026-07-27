import { pool } from '../db/pool.js';

export type EventLevel = 'info' | 'warn' | 'error';

/** Înregistrează un eveniment de ingestie în DB și în consolă (observabilitate). */
export async function logEvent(level: EventLevel, stage: string, message: string, relPath?: string): Promise<void> {
  const prefix = relPath ? `[${relPath}] ` : '';
  const line = `${stage}: ${prefix}${message}`;
  if (level === 'error') console.error('✗', line);
  else if (level === 'warn') console.warn('⚠', line);
  else console.log('·', line);

  try {
    await pool.query('INSERT INTO ingestion_events (level, stage, rel_path, message) VALUES ($1, $2, $3, $4)', [
      level,
      stage,
      relPath ?? null,
      message,
    ]);
  } catch (err) {
    console.error('Nu am putut salva evenimentul în DB:', (err as Error).message);
  }
}
