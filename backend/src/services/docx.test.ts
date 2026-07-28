import { describe, expect, it } from 'vitest';
import { htmlToText } from './docx.js';
import { parseMediaMarkers } from './indexer.js';

describe('htmlToText', () => {
  it('convertește paragrafe și titluri în text cu linii noi', () => {
    expect(htmlToText('<h1>Titlu</h1><p>Primul paragraf.</p><p>Al doilea.</p>')).toBe(
      'Titlu\nPrimul paragraf.\nAl doilea.'
    );
  });

  it('imaginile devin marcaje [IMG:n]', () => {
    const text = htmlToText('<p>Pasul 1</p><img src="img://0" /><p>Pasul 2</p><img src="img://3" />');
    expect(text).toContain('[IMG:0]');
    expect(text).toContain('[IMG:3]');
  });

  it('imaginile ignorate (decor) dispar fără marcaj', () => {
    expect(htmlToText('<p>Text</p><img src="img://skip" />')).toBe('Text');
  });

  it('decodează entitățile HTML', () => {
    expect(htmlToText('<p>Buget &amp; Finanțe &lt;2026&gt; &quot;BL&quot;</p>')).toBe('Buget & Finanțe <2026> "BL"');
  });
});

describe('parseMediaMarkers', () => {
  it('extrage seq-urile și curăță textul', () => {
    const { cleanText, seqs } = parseMediaMarkers('Pasul 1\n[IMG:0]\nPasul 2\n[IMG:3]\nFinal');
    expect(seqs).toEqual([0, 3]);
    expect(cleanText).toBe('Pasul 1\n\nPasul 2\n\nFinal');
    expect(cleanText).not.toContain('[IMG');
  });

  it('marcajele duplicate se rețin o singură dată', () => {
    expect(parseMediaMarkers('[IMG:1] a [IMG:1]').seqs).toEqual([1]);
  });

  it('text fără marcaje rămâne neschimbat', () => {
    const { cleanText, seqs } = parseMediaMarkers('Text simplu.');
    expect(seqs).toEqual([]);
    expect(cleanText).toBe('Text simplu.');
  });
});
