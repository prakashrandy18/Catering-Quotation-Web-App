import clsx from 'clsx';
import type { PdfVariant } from '@/types';

/** "Quote for client" / "Copy for chef (no prices)" switch (aria-pressed buttons, ≥44px). */
export default function VariantToggle({ value, onChange, compact }: { value: PdfVariant; onChange: (v: PdfVariant) => void; compact?: boolean }) {
  const opts: { v: PdfVariant; label: string }[] = [
    { v: 'client', label: 'Quote for client' },
    { v: 'chef', label: 'Copy for chef (no prices)' },
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
            onClick={() => onChange(o.v)}
            className={clsx(
              'min-h-[44px] rounded-xl px-2 font-semibold leading-tight transition-colors',
              compact ? 'text-sm' : 'text-[15px]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              on ? 'bg-white text-brand shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function VariantBanner({ variant }: { variant: PdfVariant }) {
  return variant === 'client' ? (
    <div className="rounded-xl bg-brand-soft px-3 py-2 text-center text-sm font-bold tracking-wide text-brand-dark">CLIENT COPY — WITH PRICES</div>
  ) : (
    <div className="rounded-xl bg-warn-soft px-3 py-2 text-center text-sm font-bold tracking-wide text-warn">CHEF COPY — NO PRICES</div>
  );
}
