import clsx from 'clsx';
import type { PdfVariant } from '@/types';

/** "Quote for client" / "Copy for chef (no prices)" switch (aria-pressed buttons, ≥44px). */
export default function VariantToggle({ value, onChange, compact }: { value: PdfVariant; onChange: (v: PdfVariant) => void; compact?: boolean }) {
  const opts: { v: PdfVariant; label: string; line1: string; line2: string }[] = [
    { v: 'client', label: 'Quote for client', line1: 'Quote for client', line2: 'with prices' },
    { v: 'chef', label: 'Copy for chef (no prices)', line1: 'Copy for chef', line2: 'no prices' },
  ];
  return (
    <div role="group" aria-label="Which PDF" className="grid grid-cols-2 gap-1 rounded-2xl bg-[#E4E4DF] p-1">
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={on}
            aria-label={o.label}
            onClick={() => onChange(o.v)}
            className={clsx(
              'flex min-h-[48px] flex-col items-center justify-center rounded-xl px-2 py-1 font-semibold leading-tight transition-colors',
              compact ? 'text-sm' : 'text-[15px]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              on ? 'bg-white text-brand shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            <span>{o.line1}</span>
            <span className="text-[13px] font-medium opacity-90">{o.line2}</span>
          </button>
        );
      })}
    </div>
  );
}

export function VariantBanner({ variant }: { variant: PdfVariant }) {
  return variant === 'client' ? (
    <div className="rounded-xl bg-brand-soft px-3 py-2 text-center text-sm font-bold leading-snug tracking-wide break-words text-brand-dark">CLIENT COPY — WITH PRICES</div>
  ) : (
    <div className="rounded-xl bg-warn-soft px-3 py-2 text-center text-sm font-bold leading-snug tracking-wide break-words text-warn">CHEF COPY — NO PRICES</div>
  );
}
