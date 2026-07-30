import { describe, expect, it } from 'vitest';
import {
  buildContextBlock,
  buildSearchQuery,
  effectiveCitedLabels,
  extractCitedLabels,
  formatSourceRef,
  toCitations,
} from './chat.js';
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
  mediaIds: [],
  ...over,
});

describe('buildContextBlock', () => {
  it('etichetează fragmentele cu [S1], [S2] și include documentul și pagina', () => {
    const block = buildContextBlock([chunk(), chunk({ chunkId: 11, title: 'pv', pageStart: 1, pageEnd: 2 })]);
    expect(block).toContain('[S1] (document: "deviz" · pag. 3)');
    expect(block).toContain('[S2] (document: "pv" · pag. 1–2)');
    expect(block).toContain('Valoarea totală');
  });

  it('include folderul sursă (modulul) pentru fișierele din subfoldere', () => {
    const block = buildContextBlock([
      chunk({ relPath: 'SIGMA/INVESTITII/Manual_Adaugare.docx', title: 'Manual_Adaugare' }),
    ]);
    expect(block).toContain('folder: SIGMA/INVESTITII');
    expect(block).not.toContain('pag.');
  });
});

describe('formatSourceRef', () => {
  it('PDF-urile includ pagina, .docx doar fișierul', () => {
    expect(formatSourceRef('deviz.pdf', 3, 3)).toBe('deviz.pdf, pag. 3');
    expect(formatSourceRef('deviz.pdf', 3, 5)).toBe('deviz.pdf, pag. 3–5');
    expect(formatSourceRef('BUGET/Manual_Buget.docx', 1, 1)).toBe('BUGET/Manual_Buget.docx');
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

describe('buildSearchQuery', () => {
  it('fără istoric, întrebarea rămâne neschimbată', () => {
    expect(buildSearchQuery([], 'Cum adaug un produs?')).toBe('Cum adaug un produs?');
  });

  it('întrebările de continuare primesc contextul ultimelor întrebări', () => {
    const history = [
      { role: 'user' as const, content: 'Cum creez un referat de necesitate in Achizitii?' },
      { role: 'assistant' as const, content: 'Pașii sunt...' },
    ];
    const q = buildSearchQuery(history, 'poti sa-mi dai captura de ecran?');
    expect(q).toContain('referat de necesitate');
    expect(q).toContain('captura de ecran');
  });

  it('folosește cel mult ultimele două întrebări ale utilizatorului', () => {
    const history = ['prima', 'a doua', 'a treia'].map((content) => ({ role: 'user' as const, content }));
    const q = buildSearchQuery(history, 'acum');
    expect(q).not.toContain('prima');
    expect(q).toContain('a doua');
    expect(q).toContain('a treia');
  });
});

describe('effectiveCitedLabels', () => {
  it('etichetele explicite au prioritate', () => {
    expect([...effectiveCitedLabels('Răspuns [S2].', 5)]).toEqual([2]);
  });

  it('răspuns fără etichete → fallback pe primele surse', () => {
    expect([...effectiveCitedLabels('Iată captura cerută.', 5)].sort()).toEqual([1, 2, 3]);
  });

  it('refuzul nu primește citări fallback', () => {
    expect(effectiveCitedLabels('Informația nu se regăsește în documentele indexate.', 5).size).toBe(0);
  });

  it('fără fragmente recuperate nu există fallback', () => {
    expect(effectiveCitedLabels('Orice răspuns.', 0).size).toBe(0);
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

  it('capturile atașate devin URL-uri servite de backend', () => {
    const [citation] = toCitations([chunk({ mediaIds: [7, 12] })]);
    expect(citation.media).toEqual([
      { id: 7, url: '/api/media/7' },
      { id: 12, url: '/api/media/12' },
    ]);
  });

  it('antetul contextului anunță numărul de capturi', () => {
    const block = buildContextBlock([chunk({ mediaIds: [7] })]);
    expect(block).toContain('capturi: 1');
  });
});
