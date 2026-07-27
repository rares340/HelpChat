import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { checkOllama } from './ollama.js';

export interface HealthReport {
  ok: boolean;
  db: { ok: boolean; detail?: string };
  ollama: { ok: boolean; problems: string[] };
  embedDim: { ok: boolean; detail?: string };
}

/** Verifică DB, serverele Ollama și potrivirea dimensiunii vectorilor. */
export async function healthCheck(): Promise<HealthReport> {
  const report: HealthReport = {
    ok: true,
    db: { ok: true },
    ollama: { ok: true, problems: [] },
    embedDim: { ok: true },
  };

  try {
    await pool.query('SELECT 1');
    // atttypmod pentru coloane vector = dimensiunea declarată
    const { rows } = await pool.query<{ dim: number }>(
      `SELECT atttypmod AS dim FROM pg_attribute
       WHERE attrelid = 'chunks'::regclass AND attname = 'embedding'`
    );
    if (rows.length && rows[0].dim > 0 && rows[0].dim !== config.EMBED_DIM) {
      report.embedDim = {
        ok: false,
        detail: `Coloana chunks.embedding are ${rows[0].dim} dimensiuni, dar EMBED_DIM=${config.EMBED_DIM}. Schimbarea modelului de embedding cere reindexare completă (vezi README).`,
      };
    }
  } catch (err) {
    report.db = { ok: false, detail: (err as Error).message };
  }

  report.ollama = await checkOllama();
  report.ok = report.db.ok && report.ollama.ok && report.embedDim.ok;
  return report;
}
