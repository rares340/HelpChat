import type { z } from 'zod';

/** Definiția unui tool expus de serverul MCP. */
export interface ToolDef<Args = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Args>;
  /**
   * JSON Schema complet (properties, enum, required) — când există, se trimite
   * modelului ca atare, în loc de simplificarea din inputSchema (care știe doar
   * string/number). Folosit de tool-urile de facturi, care au definiții bogate.
   */
  jsonSchema?: Record<string, unknown>;
  handler: (args: Args) => Promise<unknown>;
}

/** Lista albă de tool-uri. Modelul nu poate invoca nimic în afara a ce e aici. */
const tools: ToolDef[] = [];

export function registerTool<Args>(tool: ToolDef<Args>): void {
  if (tools.some((t) => t.name === tool.name)) {
    throw new Error(`Tool MCP duplicat: ${tool.name}`);
  }
  tools.push(tool as unknown as ToolDef);
}

/** Conversie la formatul cerut de MCP (și, mai departe, de Ollama). */
export function listToolsForMcp() {
  return tools.map((t) => {
    if (t.jsonSchema) {
      return { name: t.name, description: t.description, inputSchema: t.jsonSchema };
    }
    const shape = (t.inputSchema as unknown as { _def?: { shape?: Record<string, unknown> } })._def?.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    if (shape) {
      for (const [key, value] of Object.entries(shape)) {
        const def = (value as { _def?: { description?: string; typeName?: string } })._def;
        properties[key] = {
          type: def?.typeName === 'ZodNumber' ? 'number' : 'string',
          description: def?.description ?? '',
        };
        required.push(key);
      }
    }
    return {
      name: t.name,
      description: t.description,
      inputSchema: {
        type: 'object' as const,
        properties,
        required: Object.keys(properties),
      },
    };
  });
}

/** Returnează definiția Ollama-compatibilă (folosită de client pt. câmpul `tools`). */
export function listToolsForOllama() {
  return tools.map((t) => {
    if (t.jsonSchema) {
      return {
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.jsonSchema },
      };
    }
    const shape = (t.inputSchema as unknown as { _def?: { shape?: Record<string, unknown> } })._def?.shape;
    const properties: Record<string, { type: string; description?: string }> = {};
    const required: string[] = [];
    if (shape) {
      for (const [key, value] of Object.entries(shape)) {
        const def = (value as { _def?: { description?: string; typeName?: string } })._def;
        properties[key] = {
          type: def?.typeName === 'ZodNumber' ? 'number' : 'string',
          description: def?.description ?? '',
        };
        required.push(key);
      }
    }
    return {
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: { type: 'object', properties, required },
      },
    };
  });
}

/** Invocare cu validare de argumente. Throw cu mesaj clar dacă tool-ul nu există. */
export async function handleToolCall(name: string, rawArgs: unknown): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool MCP necunoscut: ${name}`);
  const parsed = tool.inputSchema.parse(rawArgs ?? {});
  return await tool.handler(parsed);
}
