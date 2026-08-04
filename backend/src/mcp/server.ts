import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { handleToolCall, listToolsForMcp } from './registry.js';
// Importul are efect secundar: înregistrează tool-urile.
import './tools/ping.js';
import './tools/get_document_stats.js';
import './tools/get_usage_stats.js';
import './tools/get_recent_errors.js';
import './tools/get_top_cited.js';

const server = new Server(
  { name: 'helpchat-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listToolsForMcp() }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await handleToolCall(name, args);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = (err as Error).message;
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('MCP server ready (stdio)');
