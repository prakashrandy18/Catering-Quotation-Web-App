/**
 * Public API of the PDF module. Light-weight: @react-pdf/renderer is loaded lazily on first use,
 * so importing this file does not grow the main bundle.
 */
import type { BrandSettings, CateringEvent, PdfVariant } from '@/types';
import { pdfFileName } from '@/lib/format';
import { downloadFile, shareOrDownload, type ShareResult } from '@/lib/fileShare';

export type { ShareResult };

let renderModule: Promise<typeof import('./render')> | null = null;
function loadRenderer() {
  renderModule ??= import('./render').catch((err) => {
    renderModule = null; // allow a retry (e.g. after going back online)
    throw err;
  });
  return renderModule;
}

/** Starts downloading the PDF generator in the background (e.g. when the PDF tab is likely next). */
export function preloadPdf(): void {
  void loadRenderer().catch(() => undefined);
}

/** Builds the PDF for an event. Lazy-loads @react-pdf/renderer. */
export async function generatePdfBlob(event: CateringEvent, brand: BrandSettings, variant: PdfVariant): Promise<Blob> {
  const { renderPdfBlob } = await loadRenderer();
  return renderPdfBlob(event, brand, variant);
}

/** The File handed to the share sheet / download ("Thara Wedding – Quotation.pdf"). */
export function pdfFile(blob: Blob, event: CateringEvent, variant: PdfVariant): File {
  return new File([blob], pdfFileName(event.name, variant), { type: 'application/pdf' });
}

/** Downloads an already generated PDF blob. */
export function downloadPdfBlob(blob: Blob, event: CateringEvent, variant: PdfVariant): void {
  downloadFile(blob, pdfFileName(event.name, variant));
}

/** Generates and downloads the PDF (file name from pdfFileName()). */
export async function downloadPdf(event: CateringEvent, brand: BrandSettings, variant: PdfVariant): Promise<void> {
  const blob = await generatePdfBlob(event, brand, variant);
  downloadPdfBlob(blob, event, variant);
}

/** Shares an already generated PDF blob via the system share sheet (WhatsApp…), or downloads it. */
export function sharePdfBlob(blob: Blob, event: CateringEvent, variant: PdfVariant, text?: string): Promise<ShareResult> {
  const file = pdfFile(blob, event, variant);
  return shareOrDownload(file, { title: file.name.replace(/\.pdf$/, ''), text });
}

/** Generates the PDF and opens the share sheet (falls back to a download). */
export async function sharePdf(event: CateringEvent, brand: BrandSettings, variant: PdfVariant, text?: string): Promise<ShareResult> {
  const blob = await generatePdfBlob(event, brand, variant);
  return sharePdfBlob(blob, event, variant, text);
}

/** Default WhatsApp message: "Thara Wedding quotation, 24–26 Feb. Please check." */
export { shareMessage } from './shareText';
