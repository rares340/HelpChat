import { scanAll } from '../services/indexer.js';
import { pool } from '../db/pool.js';

const result = await scanAll();
console.log(
  `\nRezultat: ${result.indexed} indexate, ${result.skipped} neschimbate, ${result.failed} eșuate, ${result.deleted} șterse.`
);
await pool.end();
process.exit(result.failed > 0 ? 1 : 0);
