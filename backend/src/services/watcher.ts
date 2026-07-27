import chokidar from 'chokidar';
import { relative } from 'node:path';
import { config } from '../config.js';
import { indexFile, markDeleted, scanAll } from './indexer.js';
import { logEvent } from './events.js';

/** Scanare completă la pornire + monitorizare continuă a folderului PDF. */
export function startWatcher(): void {
  scanAll().catch((err) => logEvent('error', 'scan', `Scanarea inițială a eșuat: ${err.message}`));

  const watcher = chokidar.watch(config.pdfDir, {
    ignoreInitial: true,
    // Așteaptă ca fișierul să fie scris complet (copieri mari) înainte de indexare.
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  });

  const isPdf = (path: string) => path.toLowerCase().endsWith('.pdf');
  const rel = (path: string) => relative(config.pdfDir, path);

  watcher
    .on('add', (path) => {
      if (isPdf(path)) void indexFile(rel(path));
    })
    .on('change', (path) => {
      if (isPdf(path)) void indexFile(rel(path));
    })
    .on('unlink', (path) => {
      if (isPdf(path)) void markDeleted(rel(path));
    })
    .on('error', (err) => void logEvent('error', 'watch', (err as Error).message));

  console.log(`Monitorizez folderul: ${config.pdfDir}`);
}
