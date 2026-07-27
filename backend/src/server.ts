import { buildServer } from './app.js';
import { config } from './config.js';
import { healthCheck } from './services/health.js';
import { startWatcher } from './services/watcher.js';

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

if (health.db.ok) {
  startWatcher();
}

await app.listen({ port: config.PORT, host: '0.0.0.0' });
console.log(`Backend pornit pe http://localhost:${config.PORT}`);
