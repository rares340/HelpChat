import { scanAll } from '../services/indexer.js';
import { pool } from '../db/pool.js';

// npm run index -- --force  → reindexează tot, ignorând hash-urile
const force = process.argv.includes('--force');
const result = await scanAll(force);
console.log(
  `\nRezultat: ${result.indexed} indexate, ${result.skipped} neschimbate, ${result.failed} eșuate, ${result.deleted} șterse.`
);
await pool.end();
process.exit(result.failed > 0 ? 1 : 0);
