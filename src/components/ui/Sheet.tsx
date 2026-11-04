import clsx from 'clsx';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './icons';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Footer area (sticky at the bottom of the sheet). */
  footer?: ReactNode;
}

/**
 * Bottom sheet on phones, centred dialog on ≥768px. Traps focus, Esc closes,
 * returns focus to the opener, respects reduced motion (see index.css).
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  // Parents pass inline closures: keep the latest in a ref so re-renders do not re-run the
  // focus effect below (which would move focus back to the first button on every render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(
        (el) => !el.hasAttribute('disabled'),
      );
    const first = focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const a = els[0];
        const z = els[els.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="presentation">
      <div className="sheet-backdrop absolute inset-0 bg-black/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'sheet-panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-white shadow-2xl',
          'rounded-t-[26px] md:max-w-[520px] md:rounded-[26px]',
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-paper-line md:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-3">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-paper-sunk text-ink">
            <IconClose size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-paper-line px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel = 'Cancel', danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-[52px] flex-1 rounded-2xl border border-paper-strong bg-white font-semibold">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={clsx('min-h-[52px] flex-1 rounded-2xl font-semibold text-white', danger ? 'bg-danger' : 'bg-brand')}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="text-base leading-relaxed text-ink">{message}</div>
    </Sheet>
  );
}
