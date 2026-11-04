/**
 * Test helper (node only): extracts the text of a PDF with pdf.js (legacy build).
 * Whitespace is normalised "₹ 31,200" is collapsed to "₹31,200" and "( ₹" to "(₹" (separate text runs).
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export interface PdfText {
  pages: string[];
  all: string;
}

export async function pdfText(data: Uint8Array): Promise<PdfText> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: false, isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/₹\s+/g, '₹')
      .replace(/\(\s+/g, '(')
      .trim();
    pages.push(text);
  }
  await doc.destroy();
  return { pages, all: pages.join('\n') };
}
