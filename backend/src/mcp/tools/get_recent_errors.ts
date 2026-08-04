import { z } from 'zod';
import { registerTool } from '../registry.js';
import { pool } from '../../db/pool.js';

const argsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(20)
    .describe('Număr maxim de evenimente de returnat (implicit 20, max 200).'),
});

registerTool({
  name: 'get_recent_errors',
  description:
    'Returnează ultimele N evenimente de eroare din jurnalul de ingestie (level=error). ' +
    'Util pentru diagnosticare: „ce a eșuat recent la indexare", „de ce nu se indexează X".',
  inputSchema: argsSchema,
  handler: async ({ limit }) => {
    const { rows } = await pool.query(
      `SELECT id, level, stage, rel_path, message, created_at
         FROM v_recent_errors
        LIMIT $1::int`,
      [limit]
    );
    return { count: rows.length, errors: rows };
  },
});
