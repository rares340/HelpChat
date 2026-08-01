import { z } from 'zod';
import { registerTool } from '../registry.js';

const argsSchema = z.object({
  msg: z.string().optional(),
});

registerTool({
  name: 'ping',
  description: 'Verifică că serverul MCP răspunde. Returnează pong=true și ecoul mesajului trimis.',
  inputSchema: argsSchema,
  handler: ({ msg }) => ({
    pong: true,
    echo: msg ?? null,
    ts: new Date().toISOString(),
  }),
});
