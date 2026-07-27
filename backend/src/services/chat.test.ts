import { describe, expect, it } from 'vitest';
import { buildContextBlock, extractCitedLabels, toCitations } from './chat.js';
import type { RetrievedChunk } from './retrieval.js';

const chunk = (over: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  chunkId: 10,
  documentId: 1,
  relPath: 'deviz.pdf',
  title: 'deviz',
  pageStart: 3,
  pageEnd: 3,
  text: 'Valoarea totală este de 4.2 milioane lei.',
  source: 'text',
  score: 0.5,
  ...over,
});

describe('buildContextBlock', () => {
  it('etichetează fragmentele cu [S1], [S2] și include fișierul și pagina', () => {
    const block = buildContextBlock([chunk(), chunk({ chunkId: 11, relPath: 'pv.pdf', pageStart: 1, pageEnd: 2 })]);
    expect(block).toContain('[S1] (deviz.pdf, pag. 3)');
    expect(block).toContain('[S2] (pv.pdf, pag. 1–2)');
    expect(block).toContain('Valoarea totală');
  });
});

describe('extractCitedLabels', () => {
  it('extrage etichetele folosite, inclusiv duplicate și grupate', () => {
    const labels = extractCitedLabels('Suma e 4.2M [S1]. Recepția s-a făcut [S2][S3], confirmată tot în [S1].');
    expect([...labels].sort()).toEqual([1, 2, 3]);
  });

  it('răspuns fără citări → set gol', () => {
    expect(extractCitedLabels('Informația nu se regăsește în documentele indexate.').size).toBe(0);
  });

  it('acceptă și parantezele Unicode 【S1】 folosite uneori de modele', () => {
    expect([...extractCitedLabels('Totalul este 4.750.000 lei【S1】 și C+M 3.100.000 lei【S2】.')].sort()).toEqual([1, 2]);
  });
});

describe('toCitations', () => {
  it('păstrează doar fragmentele citate efectiv în răspuns', () => {
    const chunks = [chunk(), chunk({ chunkId: 11 }), chunk({ chunkId: 12 })];
    const citations = toCitations(chunks, new Set([1, 3]));
    expect(citations.map((c) => c.label)).toEqual(['S1', 'S3']);
    expect(citations.map((c) => c.chunkId)).toEqual([10, 12]);
  });

  it('fără filtru returnează toate fragmentele ca surse candidate', () => {
    expect(toCitations([chunk(), chunk({ chunkId: 11 })])).toHaveLength(2);
  });

  it('taie fragmentele lungi la dimensiunea de snippet', () => {
    const [citation] = toCitations([chunk({ text: 'x'.repeat(1000) })]);
    expect(citation.snippet.length).toBeLessThanOrEqual(401);
    expect(citation.snippet.endsWith('…')).toBe(true);
  });
});
