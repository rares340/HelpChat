import { z } from 'zod';
import { registerTool } from '../registry.js';
import { executeFacturiTool, facturiToolDefs } from '../../services/facturi/tools.js';

// Cele 12 tool-uri de facturi (schema `facturi`) sunt expuse prin MCP ca orice
// alt tool: definiția JSON Schema (properties, enum, required) vine neschimbată
// din facturi/tools.ts, iar execuția trece prin executeFacturiTool — validare
// zod + erori/needs_info structurate, nu excepții.
for (const def of facturiToolDefs) {
  registerTool({
    name: def.function.name,
    description: def.function.description,
    inputSchema: z.unknown(),
    jsonSchema: def.function.parameters,
    handler: async (args) => {
      const text = await executeFacturiTool(def.function.name, args);
      try {
        return JSON.parse(text);
      } catch {
        return { error: text };
      }
    },
  });
}
