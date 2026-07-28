import mammoth from 'mammoth';

/** Sub această mărime imaginile sunt considerate decor (iconițe, bullet-uri). */
const MIN_IMAGE_BYTES = 3 * 1024;

export interface ExtractedImage {
  seq: number;
  buffer: Buffer;
  mime: string;
}

export interface DocxContent {
  /** Text cu marcaje [IMG:n] în locurile unde apar imaginile. */
  text: string;
  images: ExtractedImage[];
}

/**
 * Conversie HTML → text simplu, păstrând marcajele [IMG:n] și structura
 * de paragrafe. Suficient pentru manuale (paragrafe, liste, tabele simple).
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<img[^>]*src="img:\/\/(\d+)"[^>]*>/g, '\n[IMG:$1]\n')
    .replace(/<img[^>]*>/g, '')
    .replace(/<\/(p|h[1-6]|li|tr|table|ul|ol)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<td[^>]*>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extrage textul și imaginile dintr-un .docx. Formatul nu are noțiune de
 * pagină fixă, deci întregul conținut este tratat ca o singură unitate —
 * citările pentru .docx indică fișierul, nu pagina. Imaginile (capturi de
 * ecran din manuale) primesc marcaje [IMG:n] în text și sunt atașate
 * fragmentelor în care apar.
 */
export async function extractDocxContent(buffer: Buffer): Promise<DocxContent> {
  const images: ExtractedImage[] = [];

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const data = Buffer.from(await image.readAsBase64String(), 'base64');
        if (data.length < MIN_IMAGE_BYTES) return { src: 'img://skip' };
        const seq = images.length;
        images.push({ seq, buffer: data, mime: image.contentType || 'image/png' });
        return { src: `img://${seq}` };
      }),
    }
  );

  return { text: htmlToText(result.value), images };
}

/** Compatibilitate: doar textul, fără imagini. */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.replace(/\n{3,}/g, '\n\n').trim();
}
