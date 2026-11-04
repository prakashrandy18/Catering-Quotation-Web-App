import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { loadPdfjs } from './pdfjs';

interface PdfPagesProps {
  blob: Blob | null;
  /** Render only the first N pages (keeps memory low in the side panel). */
  maxPages?: number;
  /** 1 = fit the container width; 2 = twice as wide (scroll to pan). */
  zoom?: number;
  onNumPages?: (n: number) => void;
  onError?: (err: unknown) => void;
  className?: string;
  /** Called after new pages replaced the old ones. */
  onRendered?: () => void;
}

/**
 * Renders a PDF Blob to <canvas> elements (one per page, data-testid="pdf-page") with pdf.js.
 * Keeps the previous pages on screen until the new ones are ready, so edits do not flicker.
 */
export default function PdfPages({ blob, maxPages, zoom = 1, onNumPages, onError, onRendered, className }: PdfPagesProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const cb = useRef({ onNumPages, onError, onRendered });
  cb.current = { onNumPages, onError, onRendered };

  // track the available width (rounded so tiny changes do not re-render)
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(200, Math.round(el.clientWidth / 40) * 40));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!blob || !host || !width) return;
    let cancelled = false;
    let destroy: (() => void) | null = null;
    (async () => {
      const pdfjs = await loadPdfjs();
      const data = new Uint8Array(await blob.arrayBuffer());
      if (cancelled) return;
      const task = pdfjs.getDocument({ data, isEvalSupported: false });
      destroy = () => void task.destroy();
      const doc = await task.promise;
      const total = doc.numPages;
      const count = maxPages ? Math.min(maxPages, total) : total;
      const cssWidth = Math.round(host.clientWidth * zoom) || width * zoom;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const canvases: HTMLCanvasElement[] = [];
      for (let i = 1; i <= count; i++) {
        if (cancelled) return;
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (cssWidth * dpr) / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.dataset.testid = 'pdf-page';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Page ${i} of ${total}`);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.maxWidth = zoom === 1 ? '100%' : 'none';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
        canvas.style.background = '#fff';
        canvas.className = 'pdf-page-canvas';
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is not available');
        await page.render({ canvasContext: ctx, viewport }).promise;
        page.cleanup();
        canvases.push(canvas);
      }
      if (cancelled) return;
      // swap old pages for new ones in one go (old canvases are released)
      host.querySelectorAll('canvas').forEach((c) => {
        c.width = 0;
        c.height = 0;
      });
      host.replaceChildren(
        ...canvases.map((c) => {
          const wrap = document.createElement('div');
          wrap.className = 'pdf-page-wrap';
          wrap.style.boxShadow = '0 6px 20px rgba(0,0,0,0.14)';
          wrap.style.borderRadius = '4px';
          wrap.style.overflow = 'hidden';
          wrap.style.background = '#fff';
          wrap.style.width = 'fit-content';
          wrap.style.maxWidth = zoom === 1 ? '100%' : 'none';
          wrap.style.margin = '0 auto';
          wrap.appendChild(c);
          return wrap;
        }),
      );
      cb.current.onNumPages?.(total);
      cb.current.onRendered?.();
      await doc.destroy();
    })().catch((err) => {
      if (!cancelled) cb.current.onError?.(err);
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [blob, maxPages, zoom, width]);

  return <div ref={hostRef} className={clsx('flex flex-col gap-4', className)} />;
}
