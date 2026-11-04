import clsx from 'clsx';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EventStatus } from '@/types';
import { IconBack } from '@/components/ui/icons';

export const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Not sent',
  sent: 'Sent',
  confirmed: 'Confirmed',
};

/** Small coloured pill: Not sent (amber) / Sent (blue) / Confirmed (brand). */
export function StatusPill({ status }: { status: EventStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold',
        status === 'draft' && 'bg-warn-soft text-warn',
        status === 'sent' && 'bg-[#E8F0FA] text-[#1F4E79]',
        status === 'confirmed' && 'bg-brand-soft text-brand-dark',
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  backTo?: string;
  backLabel?: string;
  right?: ReactNode;
  sticky?: boolean;
}

/** White top bar with a back arrow, a title and an optional right-hand action. */
export function PageHeader({ title, subtitle, backTo, backLabel = 'Back', right, sticky = true }: PageHeaderProps) {
  return (
    <header className={clsx('border-b border-paper-line bg-white', sticky && 'sticky top-0 z-30')}>
      <div className="mx-auto flex w-full max-w-2xl items-center gap-1 px-2 py-2 lg:max-w-5xl">
        {backTo && (
          <Link to={backTo} aria-label={backLabel} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-paper-sunk">
            <IconBack />
          </Link>
        )}
        <div className={clsx('min-w-0 flex-1', !backTo && 'pl-3')}>
          <h1 className="truncate font-display text-lg font-semibold leading-tight">{title}</h1>
          {subtitle && <div className="truncate text-sm text-ink-muted">{subtitle}</div>}
        </div>
        {right}
      </div>
    </header>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}

/** A row of big toggle buttons (aria-pressed) — one is always selected. */
export function Segmented<T extends string>({ label, value, options, onChange, className }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={clsx('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={clsx(
              'min-h-[48px] flex-1 rounded-2xl border px-3 text-[15px] font-semibold transition-colors',
              on ? 'border-brand bg-brand text-white' : 'border-paper-strong bg-white text-ink hover:bg-paper-sunk',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('rounded-[20px] border border-paper-line bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]', className)}>{children}</div>;
}

/** The "The PDF can only print English letters" check. */
export function hasNonEnglish(text: string): boolean {
  return /[^\x20-\x7E]/.test(text);
}

export const NON_ENGLISH_WARNING = 'The PDF can only print English letters. Please type this name using English letters.';

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file'));
    r.readAsText(file);
  });
}

/** Hash routing keeps the old scroll position; start each screen at the top. */
export function useScrollTop() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
}
