import { z } from 'zod';
import { registerTool } from '../registry.js';
import { pool } from '../../db/pool.js';

const argsSchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .default(30)
    .describe('Câte zile în urmă să acopere (implicit 30, max 365).'),
});

registerTool({
  name: 'get_usage_stats',
  description:
    'Returnează numărul de conversații și mesaje pe fiecare zi din ultimele N zile. ' +
    'Util pentru întrebări de tipul „cât de mult s-a folosit sistemul recent", „activitate pe săptămâna trecută".',
  inputSchema: argsSchema,
  handler: async ({ days }) => {
    const { rows } = await pool.query(
      `SELECT day, conversations, messages
         FROM v_usage_daily
        WHERE day >= (current_date - $1::int)
        ORDER BY day ASC`,
      [days]
    );
    return { days, daily: rows };
  },
});
