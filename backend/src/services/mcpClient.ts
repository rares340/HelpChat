import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { config } from '../config.js';

interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: unknown;
}

let client: Client | null = null;
let toolsCache: ToolDescriptor[] = [];

interface StartedState {
  client: Client;
  tools: ToolDescriptor[];
}

let started: Promise<StartedState | null> | null = null;

/** Pornește clientul MCP. Idempotent — apăsările repetate întorc aceeași promisiune. */
export function startMcpClient(): Promise<StartedState | null> {
  if (started) return started;
  started = (async () => {
    if (!config.MCP_ENABLED) return null;
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', config.MCP_SERVER_PATH],
      cwd: process.cwd(),
    });
    const c = new Client({ name: 'helpchat-client', version: '0.1.0' });
    await c.connect(transport);
    const { tools } = await c.listTools();
    client = c;
    toolsCache = tools as ToolDescriptor[];
    console.log(`MCP: ${toolsCache.length} tooluri încărcate (${toolsCache.map((t) => t.name).join(', ')})`);
    return { client: c, tools: toolsCache };
  })().catch((err) => {
    console.warn(`MCP: pornirea a eșuat: ${(err as Error).message}. Chatul continuă fără tool-uri.`);
    return null;
  });
  return started;
}

/** Forma Ollama-compatibilă pentru câmpul `tools` din request. */
export function getOllamaTools(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}> {
  return toolsCache.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

/** Apelează un tool și returnează output-ul parsat. Throw dacă clientul nu e pornit. */
export async function callMcpTool(name: string, args: unknown): Promise<unknown> {
  if (!client) throw new Error('MCP client nu este pornit (MCP_ENABLED=false?)');
  const start = Date.now();
  const result = await client.callTool({ name, arguments: args as Record<string, unknown> });
  const durationMs = Date.now() - start;
  const text = (result.content as Array<{ type: string; text?: string }>).find((c) => c.type === 'text')?.text;
  const parsed = text ? JSON.parse(text) : null;
  console.log(`MCP: tool=${name} dur=${durationMs}ms isError=${result.isError ?? false}`);
  return parsed;
}

export function isMcpReady(): boolean {
  return client !== null;
}
