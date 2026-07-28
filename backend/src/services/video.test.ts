import { describe, expect, it } from 'vitest';
import { formatTimestamp, pickEvenly } from './video.js';

describe('formatTimestamp', () => {
  it('formatează secundele ca m:ss', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(8.67)).toBe('0:08');
    expect(formatTimestamp(155)).toBe('2:35');
    expect(formatTimestamp(3671)).toBe('61:11');
  });
});

describe('pickEvenly', () => {
  it('sub limită returnează tot', () => {
    expect(pickEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it('păstrează primul și ultimul element și respectă limita', () => {
    const items = Array.from({ length: 40 }, (_, i) => i);
    const picked = pickEvenly(items, 12);
    expect(picked.length).toBeLessThanOrEqual(12);
    expect(picked[0]).toBe(0);
    expect(picked[picked.length - 1]).toBe(39);
  });

  it('elementele alese sunt strict crescătoare (fără duplicate)', () => {
    const picked = pickEvenly([10, 20, 30, 40, 50], 3);
    expect(picked).toEqual([10, 30, 50]);
  });
});
