/**
 * pdf.js (legacy build, for older iOS Safari / Android WebView) loaded on demand.
 * The worker is emitted by Vite as a hashed asset with a relative URL, so it works under any sub-path.
 */
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let loading: Promise<PdfJs> | null = null;

export function loadPdfjs(): Promise<PdfJs> {
  loading ??= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')])
    .then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}
