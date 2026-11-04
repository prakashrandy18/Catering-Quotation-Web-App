/**
 * Heavy part of the PDF module (pulls in @react-pdf/renderer). Only reached through dynamic import().
 */
import { pdf, renderToBuffer } from '@react-pdf/renderer';
import type { BrandSettings, CateringEvent, PdfVariant } from '@/types';
import { registerPdfAssets } from './assets';
import { buildPdfModel } from './model';
import { QuotationDocument } from './QuotationDocument';

function element(event: CateringEvent, brand: BrandSettings, variant: PdfVariant) {
  registerPdfAssets();
  return <QuotationDocument model={buildPdfModel(event, brand, variant)} />;
}

/**
 * @react-pdf/layout 4.x calls `Buffer.isBuffer()` after loading each image; in the browser there is no
 * global Buffer, so every image logs a harmless "Buffer is not defined" warning (the image itself is fine).
 * Drop exactly that message while a PDF is being made.
 */
let quiet = 0;
let originalWarn: typeof console.warn | null = null;
async function withQuietBufferWarnings<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof globalThis.Buffer !== 'undefined') return fn();
  if (quiet++ === 0) {
    originalWarn = console.warn;
    const warn = originalWarn;
    console.warn = (...args: unknown[]) => {
      if (args.length === 1 && args[0] === 'Buffer is not defined') return;
      warn.apply(console, args);
    };
  }
  try {
    return await fn();
  } finally {
    if (--quiet === 0 && originalWarn) {
      console.warn = originalWarn;
      originalWarn = null;
    }
  }
}

/** Browser: PDF as a Blob. */
export async function renderPdfBlob(event: CateringEvent, brand: BrandSettings, variant: PdfVariant): Promise<Blob> {
  const blob = await withQuietBufferWarnings(() => pdf(element(event, brand, variant)).toBlob());
  return blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
}

/** Node (tests / scripts): PDF as a Buffer. Call setPdfAssetBase(<public dir>) first. */
export async function renderPdfBuffer(event: CateringEvent, brand: BrandSettings, variant: PdfVariant): Promise<Uint8Array> {
  return renderToBuffer(element(event, brand, variant));
}
