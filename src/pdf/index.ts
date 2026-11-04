// STUB — owned by the pdf agent. Public API of the PDF module (keep these signatures).
import type { BrandSettings, CateringEvent, PdfVariant } from '@/types';

/** Builds the PDF for an event. Lazy-loads @react-pdf/renderer. */
export async function generatePdfBlob(event: CateringEvent, brand: BrandSettings, variant: PdfVariant): Promise<Blob> {
  void event; void brand; void variant;
  throw new Error('PDF module not implemented yet');
}

/** Generates and downloads the PDF (file name from pdfFileName()). */
export async function downloadPdf(event: CateringEvent, brand: BrandSettings, variant: PdfVariant): Promise<void> {
  void event; void brand; void variant;
  throw new Error('PDF module not implemented yet');
}
