import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { config } from '../config.js';
import { pool, withTransaction, toVectorLiteral } from '../db/pool.js';
import { logEvent } from './events.js';
import { embed } from './ollama.js';
import { ocrImage } from './ollama.js';
import { openPdf, MIN_TEXT_CHARS_PER_PAGE } from './pdf.js';
import { chunkPages, type PageText } from './chunker.js';

const EMBED_BATCH_SIZE = 32;

let lastScanAt: string | null = null;
let running = 0;

/** Coadă serializată: o singură operație de indexare rulează la un moment dat,
 *  ca watcher-ul și reindexarea manuală să nu se calce pe picioare. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

export function indexerStatus() {
  return { running: running > 0, lastScanAt };
}

/** Scanează folderul PDF: indexează fișiere noi/modificate, marchează dispărutele. */
export function scanAll(): Promise<{ indexed: number; skipped: number; failed: number; deleted: number }> {
  return enqueue(async () => {
    running++;
    try {
      const found = await listPdfs(config.pdfDir);
      await logEvent('info', 'scan', `Scanare: ${found.length} PDF-uri în ${config.pdfDir}`);
      let indexed = 0,
        skipped = 0,
        failed = 0;

      for (const relPath of found) {
        const result = await indexOne(relPath);
        if (result === 'indexed') indexed++;
        else if (result === 'skipped') skipped++;
        else failed++;
      }

      // Documentele din DB care nu mai există pe disc → deleted.
      const { rows } = await pool.query<{ id: number; rel_path: string }>(
        `SELECT id, rel_path FROM documents WHERE status <> 'deleted'`
      );
      const onDisk = new Set(found);
      let deleted = 0;
      for (const row of rows) {
        if (!onDisk.has(row.rel_path)) {
          await pool.query(
            `UPDATE documents SET status = 'deleted', updated_at = now() WHERE id = $1`,
            [row.id]
          );
          await pool.query(`DELETE FROM document_versions WHERE document_id = $1`, [row.id]);
          await logEvent('info', 'scan', 'Fișier dispărut de pe disc — marcat ca șters', row.rel_path);
          deleted++;
        }
      }

      lastScanAt = new Date().toISOString();
      await logEvent('info', 'scan', `Scanare încheiată: ${indexed} indexate, ${skipped} neschimbate, ${failed} eșuate, ${deleted} șterse`);
      return { indexed, skipped, failed, deleted };
    } finally {
      running--;
    }
  });
}

/** Indexează un singur fișier (folosit de watcher). */
export function indexFile(relPath: string): Promise<'indexed' | 'skipped' | 'failed'> {
  return enqueue(async () => {
    running++;
    try {
      return await indexOne(relPath);
    } finally {
      running--;
    }
  });
}

/** Marchează un document dispărut (folosit de watcher la unlink). */
export function markDeleted(relPath: string): Promise<void> {
  return enqueue(async () => {
    const { rows } = await pool.query<{ id: number }>(`SELECT id FROM documents WHERE rel_path = $1`, [relPath]);
    if (!rows.length) return;
    await pool.query(`UPDATE documents SET status = 'deleted', updated_at = now() WHERE id = $1`, [rows[0].id]);
    await pool.query(`DELETE FROM document_versions WHERE document_id = $1`, [rows[0].id]);
    await logEvent('info', 'watch', 'Fișier șters — index eliminat', relPath);
  });
}

async function listPdfs(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (err) {
      await logEvent('error', 'scan', `Nu pot citi folderul ${current}: ${(err as Error).message}`);
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = join(current, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) out.push(relative(dir, full));
    }
  }
  await walk(dir);
  return out.sort();
}

async function indexOne(relPath: string): Promise<'indexed' | 'skipped' | 'failed'> {
  const absPath = join(config.pdfDir, relPath);
  let buffer: Buffer;
  try {
    buffer = await readFile(absPath);
  } catch (err) {
    await logEvent('error', 'read', `Nu pot citi fișierul: ${(err as Error).message}`, relPath);
    return 'failed';
  }

  const hash = createHash('sha256').update(buffer).digest('hex');

  // Documentul există deja cu același conținut activ? → idempotență, skip.
  const existing = await pool.query<{ doc_id: number; version_id: number | null }>(
    `SELECT d.id AS doc_id, v.id AS version_id
     FROM documents d
     LEFT JOIN document_versions v
       ON v.document_id = d.id AND v.status = 'active' AND v.content_hash = $2
     WHERE d.rel_path = $1`,
    [relPath, hash]
  );
  if (existing.rows.length && existing.rows[0].version_id !== null) {
    // Reactivăm documentul dacă fusese marcat șters dar fișierul a reapărut identic.
    await pool.query(`UPDATE documents SET status = 'active', updated_at = now() WHERE id = $1 AND status <> 'active'`, [
      existing.rows[0].doc_id,
    ]);
    return 'skipped';
  }

  const title = basename(relPath, '.pdf');
  const docId =
    existing.rows.length > 0
      ? existing.rows[0].doc_id
      : (
          await pool.query<{ id: number }>(
            `INSERT INTO documents (rel_path, title, status) VALUES ($1, $2, 'indexing')
             ON CONFLICT (rel_path) DO UPDATE SET updated_at = now()
             RETURNING id`,
            [relPath, title]
          )
        ).rows[0].id;

  const versionId = (
    await pool.query<{ id: number }>(
      `INSERT INTO document_versions (document_id, content_hash, status) VALUES ($1, $2, 'indexing') RETURNING id`,
      [docId, hash]
    )
  ).rows[0].id;

  await logEvent('info', 'index', `Indexare pornită (hash ${hash.slice(0, 12)}…)`, relPath);

  try {
    const pdf = await openPdf(new Uint8Array(buffer));
    try {
      const pages: PageText[] = [];
      let ocrPages = 0;
      for (let p = 1; p <= pdf.pageCount; p++) {
        let text = '';
        try {
          text = await pdf.getPageText(p);
        } catch (err) {
          await logEvent('warn', 'parse', `Pagina ${p}: extragere text eșuată (${(err as Error).message})`, relPath);
        }
        if (text.length >= MIN_TEXT_CHARS_PER_PAGE) {
          pages.push({ page: p, text, source: 'text' });
          continue;
        }
        // Pagină fără strat de text → OCR cu glm-ocr.
        try {
          const png = await pdf.renderPagePng(p);
          const ocrText = (await ocrImage(png.toString('base64'))).trim();
          ocrPages++;
          if (ocrText.length >= MIN_TEXT_CHARS_PER_PAGE) {
            pages.push({ page: p, text: ocrText, source: 'ocr' });
          } else {
            await logEvent('warn', 'ocr', `Pagina ${p}: nici OCR nu a găsit text`, relPath);
          }
        } catch (err) {
          await logEvent('error', 'ocr', `Pagina ${p}: OCR eșuat (${(err as Error).message})`, relPath);
        }
      }

      const chunks = chunkPages(pages, config.CHUNK_SIZE, config.CHUNK_OVERLAP);
      if (chunks.length === 0) {
        throw new Error('Documentul nu conține text indexabil (nici nativ, nici prin OCR)');
      }
      if (ocrPages > 0) {
        await logEvent('info', 'ocr', `${ocrPages} pagini procesate prin OCR`, relPath);
      }

      // Embeddings în loturi.
      const vectors: number[][] = [];
      for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
        vectors.push(...(await embed(batch.map((c) => c.text))));
      }

      // Inserăm chunks, apoi comutăm atomic versiunea activă.
      await withTransaction(async (client) => {
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i];
          await client.query(
            `INSERT INTO chunks (version_id, chunk_index, page_start, page_end, source, text, embedding)
             VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
            [versionId, c.index, c.pageStart, c.pageEnd, c.source, c.text, toVectorLiteral(vectors[i])]
          );
        }
        await client.query(
          `UPDATE document_versions SET status = 'active', page_count = $2, indexed_at = now() WHERE id = $1`,
          [versionId, pdf.pageCount]
        );
        await client.query(`DELETE FROM document_versions WHERE document_id = $1 AND id <> $2`, [docId, versionId]);
        await client.query(`UPDATE documents SET status = 'active', title = $2, updated_at = now() WHERE id = $1`, [
          docId,
          title,
        ]);
      });

      await logEvent('info', 'index', `Indexat: ${pdf.pageCount} pagini, ${chunks.length} fragmente`, relPath);
      return 'indexed';
    } finally {
      await pdf.destroy();
    }
  } catch (err) {
    await pool.query(`UPDATE document_versions SET status = 'failed', error = $2 WHERE id = $1`, [
      versionId,
      (err as Error).message,
    ]);
    // Dacă documentul nu are nicio versiune activă, îl marcăm failed; altfel rămâne activă versiunea veche.
    await pool.query(
      `UPDATE documents SET
         status = CASE WHEN EXISTS (SELECT 1 FROM document_versions WHERE document_id = $1 AND status = 'active')
                       THEN 'active' ELSE 'failed' END,
         updated_at = now()
       WHERE id = $1`,
      [docId]
    );
    await logEvent('error', 'index', `Indexare eșuată: ${(err as Error).message}`, relPath);
    return 'failed';
  }
}
