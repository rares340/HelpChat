import { z } from 'zod';
import { registerTool } from '../registry.js';
import { pool } from '../../db/pool.js';

registerTool({
  name: 'get_document_stats',
  description:
    'Returnează câte documente sunt în fiecare stare (active, indexing, failed, deleted) și totalul. ' +
    'Util când utilizatorul întreabă „câte documente avem", „ce procent e indexat", „ce a eșuat".',
  inputSchema: z.object({}),
  handler: async () => {
    const { rows } = await pool.query(
      `SELECT active, indexing, failed, deleted, total FROM v_document_stats`
    );
    return rows[0];
  },
});
