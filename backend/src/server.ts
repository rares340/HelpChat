import { buildServer } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { healthCheck } from './services/health.js';
import { startWatcher } from './services/watcher.js';
import { startMcpClient } from './services/mcpClient.js';

const app = await buildServer();

const health = await healthCheck();
if (!health.ok) {
  console.warn('⚠ Probleme detectate la pornire:');
  if (!health.db.ok) console.warn(`  DB: ${health.db.detail}`);
  for (const p of health.ollama.problems) console.warn(`  Ollama: ${p}`);
  if (!health.embedDim.ok) console.warn(`  Embeddings: ${health.embedDim.detail}`);
} else {
  console.log('✓ DB, Ollama și dimensiunea embeddings verificate.');
}

// Pornește clientul MCP (dacă e activat) — nu blocăm boot-ul dacă pică.
await startMcpClient();

if (health.db.ok) {
  // Versiunile rămase în 'indexing' sunt resturi ale unei porniri întrerupte.
  const { rows } = await pool.query<{ id: number }>(
    `DELETE FROM document_versions WHERE status = 'indexing' RETURNING id`
  );
  if (rows.length) {
    console.warn(`⚠ Am curățat ${rows.length} versiuni rămase în lucru dintr-o rulare întreruptă.`);
  }
  startWatcher();
}

await app.listen({ port: config.PORT, host: '0.0.0.0' });
console.log(`Backend pornit pe http://localhost:${config.PORT}`);
