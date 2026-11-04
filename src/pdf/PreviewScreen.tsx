/**
 * PDF tab (F05 preview + F06 send sheet).
 * Shows the exact PDF that will be sent, rendered page by page with pdf.js.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import type { EventOutletContext } from '@/components/EventLayout';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { IconClose, IconDownload, IconMinus, IconPlus, IconWarning, IconWhatsApp } from '@/components/ui/icons';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/toast';
import { missingPrices } from '@/lib/calc';
import { pdfFileName } from '@/lib/format';
import { canShareFiles, isStandalone, type ShareResult } from '@/lib/fileShare';
import type { PdfVariant } from '@/types';
import { downloadPdfBlob, pdfFile, sharePdfBlob } from './index';
import { shareMessage } from './shareText';
import { usePdfBlob } from './usePdfBlob';
import PdfPages from './PdfPages';
import VariantToggle, { VariantBanner } from './VariantToggle';

type PendingAction = 'save' | 'send';

/** Mouse-and-keyboard device (no touch screen) or a wide window: WhatsApp Web is a sensible next step. */
function useDesktopLike(): boolean {
  const q = () => {
    if (typeof window === 'undefined') return false;
    const fine = window.matchMedia?.('(pointer: fine)').matches ?? false;
    return fine || window.innerWidth >= 1024;
  };
  const [v, setV] = useState(q);
  useEffect(() => {
    const on = () => setV(q());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

export default function PreviewScreen() {
  const { event } = useOutletContext<EventOutletContext>();
  const brand = useAppStore((s) => s.brand);
  const setStatus = useAppStore((s) => s.setStatus);
  const incrementShareCount = useAppStore((s) => s.incrementShareCount);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const variant: PdfVariant = params.get('v') === 'chef' ? 'chef' : 'client';

  const pdf = usePdfBlob(event, brand, variant, { debounceMs: 600 });
  const [numPages, setNumPages] = useState(0);
  const [renderError, setRenderError] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [warnFor, setWarnFor] = useState<PendingAction | null>(null);
  const [markSent, setMarkSent] = useState(true);
  const [busy, setBusy] = useState<null | 'whatsapp' | 'save'>(null);
  /** The browser could not share the file: it was downloaded instead, so we cannot know if it was sent. */
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const desktopLike = useDesktopLike();

  const missing = useMemo(() => missingPrices(event), [event]);
  const fileName = pdfFileName(event.name, variant);
  const showingOtherVariant = pdf.blobVariant !== null && pdf.blobVariant !== variant;

  const setVariant = (v: PdfVariant) => {
    const next = new URLSearchParams(params);
    next.set('v', v);
    setParams(next, { replace: true });
  };

  /** Before the client copy leaves the phone with missing prices, warn once. */
  const guard = (action: PendingAction, go: () => void) => {
    if (variant === 'client' && missing.length > 0) setWarnFor(action);
    else go();
  };

  const markSentNow = useCallback(() => {
    if (variant === 'client' && event.status === 'draft') setStatus(event.id, 'sent');
  }, [event.id, event.status, setStatus, variant]);

  // ?send=1 (from the side pane) opens the share sheet straight away.
  useEffect(() => {
    if (params.get('send') !== '1') return;
    const next = new URLSearchParams(params);
    next.delete('send');
    setParams(next, { replace: true });
    guard('send', openShare);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openShare = () => {
    setDownloadedOnly(false);
    setConfirmSent(false);
    setShareOpen(true);
  };

  const saveNow = async () => {
    setBusy('save');
    try {
      const blob = await pdf.getLatest();
      let result: ShareResult;
      // In an installed iPhone app a download opens a viewer with no way back → use the share sheet instead.
      if (isStandalone() && canShareFiles(pdfFile(blob, event, variant))) result = await sharePdfBlob(blob, event, variant);
      else {
        downloadPdfBlob(blob, event, variant);
        result = 'downloaded';
      }
      if (result !== 'cancelled') incrementShareCount();
      if (result === 'downloaded') toast({ text: `PDF saved: ${fileName}`, tone: 'success' });
      if (result !== 'cancelled') setShareOpen(false);
    } catch {
      toast({ text: 'Could not save the PDF. Please try again.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const sendWhatsApp = async () => {
    setBusy('whatsapp');
    try {
      const blob = await pdf.getLatest();
      const result = await sharePdfBlob(blob, event, variant, shareMessage(event, variant, brand));
      if (result !== 'cancelled') incrementShareCount();
      // Only a completed share counts as "sent". A plain download proves nothing.
      if (result === 'shared' && markSent) markSentNow();
      if (result === 'downloaded') {
        setDownloadedOnly(true);
        setConfirmSent(false);
        toast({
          text: 'PDF saved. Open WhatsApp and attach it.',
          tone: 'success',
          duration: 10000,
        });
      } else if (result === 'shared') {
        toast({ text: variant === 'client' ? 'Quote sent.' : 'Copy for chef sent.', tone: 'success' });
      }
      if (result === 'shared') setShareOpen(false);
    } catch {
      toast({ text: 'Could not send the PDF. Please try again.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const ready = pdf.blob !== null;

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-3 px-4 pb-[96px] pt-4 md:pb-4">
      <VariantToggle value={variant} onChange={setVariant} />
      <VariantBanner variant={variant} />

      <div className="flex items-center justify-between gap-2 text-sm text-ink-muted">
        <span aria-live="polite">
          {pdf.loading || showingOtherVariant ? 'Making your PDF…' : numPages ? `${numPages} ${numPages === 1 ? 'page' : 'pages'}` : ''}
        </span>
        <button
          type="button"
          onClick={() => setFullScreen(true)}
          disabled={!ready}
          className="min-h-[44px] rounded-xl px-3 font-semibold text-brand hover:bg-brand-tint disabled:opacity-50"
        >
          Full screen
        </button>
      </div>

      <section aria-label="PDF pages" className="relative min-h-[300px] rounded-2xl bg-[#E4E4DF] p-3 sm:p-5">
        {(pdf.error || renderError) && (
          <div role="alert" className="mb-3 flex flex-col items-center gap-3 rounded-xl bg-white p-5 text-center">
            <p className="text-base text-ink">{pdf.error ?? 'Could not show the PDF.'}</p>
            <Button
              variant="primary"
              onClick={() => {
                setRenderError(false);
                pdf.retry();
              }}
            >
              Try again
            </Button>
          </div>
        )}
        {!ready && !pdf.error && (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-ink-muted" role="status">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-paper-line border-t-brand" aria-hidden="true" />
            <span className="text-base">Making your PDF…</span>
          </div>
        )}
        <div className={showingOtherVariant ? 'opacity-40 transition-opacity' : 'transition-opacity'}>
          <PdfPages
            blob={pdf.blob}
            onNumPages={setNumPages}
            onRendered={() => setRenderError(false)}
            onError={(err) => {
              console.warn('PDF preview failed', err);
              setRenderError(true);
            }}
          />
        </div>
      </section>

      {/* bottom action bar: above the phone tab bar, inline on tablets/laptops */}
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-paper-line bg-white px-4 py-2 md:sticky md:bottom-0 md:mx-0 md:rounded-2xl md:border md:py-3">
        <div className="mx-auto flex max-w-[900px] gap-2">
          <Button variant="secondary" className="min-w-0 flex-1 whitespace-nowrap px-3" icon={<IconDownload size={20} className="shrink-0" />} disabled={!ready || busy !== null} onClick={() => guard('save', () => void saveNow())}>
            Save PDF
          </Button>
          <Button
            variant="whatsapp"
            aria-label="Send"
            className="min-w-0 flex-[1.4] whitespace-nowrap px-3"
            icon={<IconWhatsApp size={22} className="shrink-0" />}
            disabled={!ready}
            onClick={() => guard('send', openShare)}
          >
            <span className="flex flex-col items-start text-left leading-tight">
              <span>Send</span>
              <span className="text-[13px] font-medium opacity-95">WhatsApp or save</span>
            </span>
          </Button>
        </div>
      </div>

      {/* missing price warning (client copy only) */}
      <Sheet
        open={warnFor !== null}
        onClose={() => setWarnFor(null)}
        title="Some meals have no price"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-[52px] flex-1 rounded-2xl border border-paper-strong bg-white font-semibold"
              onClick={() => {
                setWarnFor(null);
                if (missing[0]) navigate(`/event/${event.id}/menu/${missing[0].sessionId}`);
              }}
            >
              Add price
            </button>
            <button
              type="button"
              className="min-h-[52px] flex-1 rounded-2xl bg-brand font-semibold text-white"
              onClick={() => {
                const action = warnFor;
                setWarnFor(null);
                if (action === 'save') void saveNow();
                else openShare();
              }}
            >
              Send anyway
            </button>
          </div>
        }
      >
        <div className="flex gap-3 rounded-xl bg-warn-soft p-3 text-warn">
          <IconWarning size={22} className="shrink-0" />
          <p className="text-base">
            <strong>{missing.length === 1 ? '1 meal has no price yet' : `${missing.length} meals have no price yet`}.</strong> The quote will say “Rate to be confirmed” for {missing.length === 1 ? 'it' : 'these meals'}:
          </p>
        </div>
        <ul className="mt-3 flex flex-col gap-1">
          {missing.map((m) => (
            <li key={m.sessionId}>
              <button
                type="button"
                onClick={() => {
                  setWarnFor(null);
                  navigate(`/event/${event.id}/menu/${m.sessionId}`);
                }}
                className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-2 text-left text-base hover:bg-paper-sunk"
              >
                <span>
                  {m.sessionName} <span className="text-ink-muted">· Day {m.dayIndex + 1}</span>
                </span>
                <span className="ml-2 shrink-0 whitespace-nowrap text-sm font-semibold text-brand" aria-hidden="true">Open ›</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      {/* share sheet (F06) */}
      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Send PDF">
        <div className="flex flex-col gap-4 pb-2">
          <VariantToggle value={variant} onChange={setVariant} compact />
          <div className="flex items-center gap-3 rounded-2xl bg-paper-sunk p-3">
            <div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-md border border-paper-line bg-white text-[13px] font-bold text-brand">PDF</div>
            <div className="min-w-0 flex-1">
              <div className="break-words text-[15px] font-semibold">{fileName}</div>
              <div className="text-sm text-ink-muted">
                {variant === 'client' ? 'With prices and totals' : 'No prices · blank price sheet on the last page'}
                {numPages ? ` · ${numPages} pages` : ''}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="whatsapp" size="lg" className="justify-start" icon={<IconWhatsApp size={24} />} disabled={busy !== null} onClick={() => void sendWhatsApp()}>
              {busy === 'whatsapp' ? 'Opening…' : 'Send on WhatsApp'}
            </Button>
            <Button variant="secondary" size="lg" className="justify-start" icon={<IconDownload size={22} />} disabled={busy !== null} onClick={() => void saveNow()}>
              {busy === 'save' ? 'Saving…' : 'Save PDF on phone'}
            </Button>
          </div>
          {downloadedOnly && (
            <div role="status" className="flex flex-col gap-3 rounded-2xl bg-brand-tint p-3">
              <p className="text-base font-semibold">PDF saved on this device. It has not been sent yet.</p>
              <p className="text-sm text-ink-muted">Open WhatsApp and attach the saved PDF, then come back here.</p>
              {desktopLike && (
                <a
                  href="https://web.whatsapp.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-whatsapp px-4 font-semibold text-white no-underline hover:brightness-95"
                >
                  <IconWhatsApp size={22} /> Open WhatsApp Web
                </a>
              )}
              {variant === 'client' && (
                <label className="flex min-h-[48px] items-center gap-3 text-base">
                  <input type="checkbox" checked={confirmSent} onChange={(e) => setConfirmSent(e.target.checked)} className="h-6 w-6 accent-[rgb(var(--brand))]" />
                  <span>Mark as sent</span>
                </label>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  if (confirmSent) markSentNow();
                  setShareOpen(false);
                }}
              >
                Done, I sent it
              </Button>
            </div>
          )}
          {variant === 'client' && !downloadedOnly ? (
            <label className="flex min-h-[48px] items-center gap-3 text-base">
              <input type="checkbox" checked={markSent} onChange={(e) => setMarkSent(e.target.checked)} className="h-6 w-6 accent-[rgb(var(--brand))]" />
              <span>Mark as sent</span>
            </label>
          ) : variant === 'chef' ? (
            <p className="text-sm text-ink-muted">The chef copy has no prices. The message names the chef so it is not mixed up with the client quote.</p>
          ) : null}
          {!canShareFiles() && (
            <p className="text-sm text-ink-muted">This browser cannot attach files to WhatsApp directly. The PDF will be saved; then attach it in WhatsApp.</p>
          )}
        </div>
      </Sheet>

      {fullScreen && <FullScreenPages blob={pdf.blob} title={fileName} onClose={() => setFullScreen(false)} />}
    </div>
  );
}

function FullScreenPages({ blob, title, onClose }: { blob: Blob | null; title: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`${title} full screen`} className="fixed inset-0 z-50 flex flex-col bg-[#3A3C38]">
      <div className="flex items-center gap-2 bg-white px-2 py-2">
        <button type="button" aria-label="Close full screen" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-paper-sunk">
          <IconClose size={22} />
        </button>
        <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-paper-strong disabled:opacity-40"
        >
          <IconMinus size={20} />
        </button>
        <span className="w-12 text-center text-sm text-ink-muted">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-paper-strong disabled:opacity-40"
        >
          <IconPlus size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3" style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
        <PdfPages blob={blob} zoom={zoom} />
      </div>
    </div>
  );
}
