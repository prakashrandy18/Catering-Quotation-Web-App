/**
 * Live PDF preview in the right pane (≥768px) next to the Menu / Chat.
 * Renders only the first 2 pages to keep memory low; the PDF tab shows everything.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/toast';
import { Button } from '@/components/ui/Button';
import { IconDownload } from '@/components/ui/icons';
import type { CateringEvent, PdfVariant } from '@/types';
import { downloadPdfBlob } from './index';
import { usePdfBlob } from './usePdfBlob';
import PdfPages from './PdfPages';
import VariantToggle, { VariantBanner } from './VariantToggle';

const WIDE = '(min-width: 768px)';

function useIsWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return;
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return wide;
}

export default function PreviewPanel({ event }: { event: CateringEvent }) {
  // The pane is hidden with CSS on phones: do not spend battery making PDFs nobody sees.
  const wide = useIsWide();
  if (!wide) return null;
  return <Panel event={event} />;
}

function Panel({ event }: { event: CateringEvent }) {
  const brand = useAppStore((s) => s.brand);
  const incrementShareCount = useAppStore((s) => s.incrementShareCount);
  const [variant, setVariant] = useState<PdfVariant>('client');
  const pdf = usePdfBlob(event, brand, variant, { debounceMs: 800 });
  const [numPages, setNumPages] = useState(0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const blob = await pdf.getLatest();
      downloadPdfBlob(blob, event, variant);
      incrementShareCount();
      toast({ text: 'PDF saved.', tone: 'success' });
    } catch {
      toast({ text: 'Could not save the PDF. Please try again.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <VariantToggle value={variant} onChange={setVariant} compact />
      <VariantBanner variant={variant} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted" aria-live="polite">
          {pdf.loading ? 'Updating…' : numPages ? `Page 1–${Math.min(2, numPages)} of ${numPages}` : ''}
        </span>
        <Button variant="secondary" icon={<IconDownload size={18} />} disabled={!pdf.blob || saving} onClick={() => void save()}>
          Save PDF
        </Button>
      </div>
      {pdf.error && (
        <div role="alert" className="flex flex-col items-center gap-2 rounded-xl bg-white p-4 text-center">
          <p className="text-base">{pdf.error}</p>
          <Button onClick={pdf.retry}>Try again</Button>
        </div>
      )}
      {!pdf.blob && !pdf.error && <div className="p-6 text-center text-base text-ink-muted">Making your PDF…</div>}
      <PdfPages blob={pdf.blob} maxPages={2} onNumPages={setNumPages} />
      <Link to={`pdf?v=${variant}`} className="mx-auto flex min-h-[44px] items-center rounded-xl px-4 font-semibold text-brand hover:bg-brand-tint">
        Open full preview{numPages > 2 ? ` (${numPages} pages)` : ''} ›
      </Link>
    </div>
  );
}
