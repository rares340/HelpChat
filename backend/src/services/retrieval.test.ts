import { describe, expect, it } from 'vitest';
import { normalizeSearchText, rrfFuse } from './retrieval.js';

interface Item {
  id: number;
}
const items = (...ids: number[]): Item[] => ids.map((id) => ({ id }));

describe('normalizeSearchText', () => {
  it('elimină diacriticele, semnele de punctuație și normalizează spațiile', () => {
    expect(normalizeSearchText('  Cum se face “instalarea” în România?  ')).toBe('cum se face instalarea in romania');
  });

  it('returnează șir gol pentru textul vid sau doar semne de punctuație', () => {
    expect(normalizeSearchText('   ???  ')).toBe('');
  });
});

describe('rrfFuse', () => {
  it('un element prezent în ambele liste primește scor din ambele', () => {
    const fused = rrfFuse([items(1, 2), items(1, 3)], (i) => i.id);
    expect(fused[0].item.id).toBe(1);
    expect(fused[0].score).toBeCloseTo(1 / 61 + 1 / 61);
  });

  it('rangul contează: primul din listă bate ultimul', () => {
    const fused = rrfFuse([items(1, 2, 3)], (i) => i.id);
    expect(fused.map((f) => f.item.id)).toEqual([1, 2, 3]);
    expect(fused[0].score).toBeGreaterThan(fused[2].score);
  });

  it('un element de rang mediu în ambele liste bate unul de top într-o singură listă', () => {
    // 7 e pe locul 2 în ambele liste; 1 și 9 sunt câte o dată pe locul 1.
    const fused = rrfFuse([items(1, 7, 2), items(9, 7, 3)], (i) => i.id);
    expect(fused[0].item.id).toBe(7);
  });

  it('liste goale nu produc rezultate', () => {
    expect(rrfFuse([[], []], (i: Item) => i.id)).toEqual([]);
  });

  it('nu dublează elementele comune', () => {
    const fused = rrfFuse([items(1, 2), items(2, 1)], (i) => i.id);
    expect(fused).toHaveLength(2);
  });
});
