import type { ChunkSource } from '@practica/shared';

export interface PageText {
  page: number;
  text: string;
  source: ChunkSource;
}

export interface TextChunk {
  index: number;
  text: string;
  pageStart: number;
  pageEnd: number;
  source: ChunkSource;
}

interface Span {
  start: number;
  end: number;
  page: number;
  source: ChunkSource;
}

/**
 * Împarte textul unui document în fragmente de ~chunkSize caractere cu
 * suprapunere de overlap, tăind de preferință la limite de paragraf/propoziție
 * și păstrând legătura cu paginile sursă.
 */
export function chunkPages(pages: PageText[], chunkSize: number, overlap: number): TextChunk[] {
  // Construim textul complet și hărțile de offset → pagină.
  let full = '';
  const spans: Span[] = [];
  for (const p of pages) {
    const text = p.text.trim();
    if (!text) continue;
    if (full) full += '\n\n';
    spans.push({ start: full.length, end: full.length + text.length, page: p.page, source: p.source });
    full += text;
  }
  if (!full) return [];

  const chunks: TextChunk[] = [];
  let pos = 0;
  let index = 0;
  while (pos < full.length) {
    let end = Math.min(pos + chunkSize, full.length);
    if (end < full.length) {
      end = findBreak(full, pos, end);
    }
    const text = full.slice(pos, end).trim();
    if (text) {
      const touching = spans.filter((s) => s.start < end && s.end > pos);
      chunks.push({
        index: index++,
        text,
        pageStart: touching.length ? Math.min(...touching.map((s) => s.page)) : pages[0]?.page ?? 1,
        pageEnd: touching.length ? Math.max(...touching.map((s) => s.page)) : pages[0]?.page ?? 1,
        source: touching.some((s) => s.source === 'ocr') ? 'ocr' : 'text',
      });
    }
    if (end >= full.length) break;
    pos = Math.max(end - overlap, pos + 1);
  }
  return chunks;
}

/** Caută înapoi de la `end` o limită naturală: paragraf, apoi propoziție, apoi spațiu. */
function findBreak(full: string, start: number, end: number): number {
  const window = full.slice(start, end);
  const minBreak = Math.floor(window.length * 0.5);

  const paragraph = window.lastIndexOf('\n\n');
  if (paragraph > minBreak) return start + paragraph + 2;

  const sentence = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('.\n'),
    window.lastIndexOf('? '),
    window.lastIndexOf('! ')
  );
  if (sentence > minBreak) return start + sentence + 2;

  const space = window.lastIndexOf(' ');
  if (space > minBreak) return start + space + 1;

  return end;
}
