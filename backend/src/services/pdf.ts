import { createCanvas } from '@napi-rs/canvas';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Sub acest număr de caractere considerăm pagina fără strat de text → candidat OCR. */
export const MIN_TEXT_CHARS_PER_PAGE = 20;

export interface OpenedPdf {
  pageCount: number;
  getPageText(pageNo: number): Promise<string>;
  /** Randează pagina ca PNG (pentru OCR). Scale 2 ≈ 150 dpi. */
  renderPagePng(pageNo: number, scale?: number): Promise<Buffer>;
  destroy(): Promise<void>;
}

export async function openPdf(data: Uint8Array): Promise<OpenedPdf> {
  const doc: PDFDocumentProxy = await getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  return {
    pageCount: doc.numPages,

    async getPageText(pageNo: number): Promise<string> {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str;
        text += item.hasEOL ? '\n' : ' ';
      }
      return text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
    },

    async renderPagePng(pageNo: number, scale = 2): Promise<Buffer> {
      const page = await doc.getPage(pageNo);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
      return canvas.toBuffer('image/png');
    },

    async destroy(): Promise<void> {
      await doc.destroy();
    },
  };
}
