import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrandSettings, CateringEvent, PdfVariant } from '@/types';
import { generatePdfBlob } from './index';

export interface PdfBlobState {
  blob: Blob | null;
  /** variant of the blob currently held */
  blobVariant: PdfVariant | null;
  loading: boolean;
  error: string | null;
  /** true when the held blob matches the latest event / brand / variant */
  fresh: boolean;
  retry: () => void;
  /** Resolves with a PDF for the latest inputs (generates now if needed). */
  getLatest: () => Promise<Blob>;
}

function keyOf(event: CateringEvent, brand: BrandSettings, variant: PdfVariant): string {
  return variant + '|' + JSON.stringify(event) + '|' + JSON.stringify(brand);
}

/**
 * Generates the PDF for (event, brand, variant), debounced while the user edits.
 * A variant switch regenerates immediately. The same Blob is used for preview, download and share.
 */
export function usePdfBlob(
  event: CateringEvent,
  brand: BrandSettings,
  variant: PdfVariant,
  { debounceMs = 600, enabled = true }: { debounceMs?: number; enabled?: boolean } = {},
): PdfBlobState {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobKey, setBlobKey] = useState<string | null>(null);
  const [blobVariant, setBlobVariant] = useState<PdfVariant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const key = keyOf(event, brand, variant);
  const latest = useRef({ event, brand, variant, key });
  latest.current = { event, brand, variant, key };
  const lastVariant = useRef<PdfVariant | null>(null);
  const inflight = useRef<{ key: string; promise: Promise<Blob> } | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const run = useCallback((): Promise<Blob> => {
    const { event: e, brand: b, variant: v, key: k } = latest.current;
    if (inflight.current?.key === k) return inflight.current.promise;
    setLoading(true);
    setError(null);
    const promise = generatePdfBlob(e, b, v);
    inflight.current = { key: k, promise };
    promise.then(
      (out) => {
        if (!mounted.current) return;
        // ignore results that were overtaken by a newer request
        if (inflight.current?.key !== k) return;
        inflight.current = null;
        setBlob(out);
        setBlobKey(k);
        setBlobVariant(v);
        setLoading(false);
      },
      (err: unknown) => {
        if (!mounted.current || inflight.current?.key !== k) return;
        inflight.current = null;
        console.warn('PDF generation failed', err);
        setError(navigator.onLine === false ? 'You are offline and the PDF maker is not saved on this phone yet.' : 'Could not make the PDF.');
        setLoading(false);
      },
    );
    return promise;
  }, []);

  const blobKeyRef = useRef<string | null>(null);
  blobKeyRef.current = blobKey;
  const lastAttempt = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (blobKeyRef.current === key && attempt === lastAttempt.current) return;
    const immediate = blobKeyRef.current === null || lastVariant.current !== variant || attempt !== lastAttempt.current;
    lastVariant.current = variant;
    lastAttempt.current = attempt;
    if (immediate) {
      void run().catch(() => undefined);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => void run().catch(() => undefined), debounceMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt]);

  const retry = useCallback(() => {
    inflight.current = null;
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  const getLatest = useCallback(async () => {
    if (blob && blobKey === latest.current.key) return blob;
    return run();
  }, [blob, blobKey, run]);

  return { blob, blobVariant, loading, error, fresh: blob !== null && blobKey === key, retry, getLatest };
}
