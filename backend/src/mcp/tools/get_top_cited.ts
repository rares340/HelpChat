import { z } from 'zod';
import { registerTool } from '../registry.js';
import { pool } from '../../db/pool.js';

const argsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe('Câte documente să returnezi (implicit 10, max 100).'),
});

registerTool({
  name: 'get_top_cited',
  description:
    'Returnează cele mai citate documente în răspunsurile anterioare, pe baza câmpului messages.citations. ' +
    'Util pentru întrebări de tipul „ce manuale sunt folosite cel mai des", „ce document e cel mai popular".',
  inputSchema: argsSchema,
  handler: async ({ limit }) => {
    const { rows } = await pool.query(
      `SELECT document_id, rel_path, title, citation_count
         FROM v_top_cited_documents
        LIMIT $1::int`,
      [limit]
    );
    return { count: rows.length, documents: rows };
  },
});
