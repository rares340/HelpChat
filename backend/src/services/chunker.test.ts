import { describe, expect, it } from 'vitest';
import { chunkPages, type PageText } from './chunker.js';

const page = (n: number, text: string, source: 'text' | 'ocr' = 'text'): PageText => ({ page: n, text, source });

describe('chunkPages', () => {
  it('returnează listă goală pentru pagini fără text', () => {
    expect(chunkPages([], 1000, 150)).toEqual([]);
    expect(chunkPages([page(1, '   ')], 1000, 150)).toEqual([]);
  });

  it('un text scurt produce un singur fragment cu pagina corectă', () => {
    const chunks = chunkPages([page(3, 'Un paragraf scurt despre deviz.')], 1000, 150);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, pageStart: 3, pageEnd: 3, source: 'text' });
  });

  it('respectă dimensiunea aproximativă și suprapunerea', () => {
    const sentence = 'Aceasta este o propoziție de test cu suficiente cuvinte. ';
    const chunks = chunkPages([page(1, sentence.repeat(60))], 500, 100);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(500);
    }
    // Suprapunere: începutul fragmentului 2 se regăsește la finalul fragmentului 1.
    const tail = chunks[0].text.slice(-40);
    expect(chunks[1].text).toContain(tail.slice(0, 20));
  });

  it('indexele fragmentelor sunt consecutive de la zero', () => {
    const chunks = chunkPages([page(1, 'cuvânt '.repeat(500))], 400, 50);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it('urmărește paginile: fragmentele care traversează pagini au intervalul corect', () => {
    const chunks = chunkPages(
      [page(1, 'Text pe prima pagină. '.repeat(20)), page(2, 'Text pe a doua pagină. '.repeat(20))],
      10_000,
      0
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[0].pageEnd).toBe(2);
  });

  it('marchează fragmentul ca OCR dacă atinge o pagină OCR', () => {
    const chunks = chunkPages(
      [page(1, 'Pagină nativă. '.repeat(10)), page(2, 'Pagină scanată. '.repeat(10), 'ocr')],
      10_000,
      0
    );
    expect(chunks[0].source).toBe('ocr');
  });

  it('preferă tăierea la limită de propoziție', () => {
    const text = `Prima propoziție este aici. ${'a'.repeat(300)}. A doua propoziție vine după. ${'b'.repeat(300)}`;
    const chunks = chunkPages([page(1, text)], 400, 0);
    expect(chunks[0].text.endsWith('.')).toBe(true);
  });
});
