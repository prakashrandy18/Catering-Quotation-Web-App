import clsx from 'clsx';
import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { IconMinus, IconPlus } from './icons';

export const inputClass =
  'block w-full min-h-[52px] rounded-2xl border border-paper-strong bg-white px-4 text-base text-ink placeholder:text-ink-faint ' +
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, className, id, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={fid} className="text-[15px] font-semibold text-ink">
        {label}
      </label>
      <input ref={ref} id={fid} className={clsx(inputClass, error && 'border-danger')} aria-invalid={!!error} {...rest} />
      {hint && !error && <p className="text-sm text-ink-muted">{hint}</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
});

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
}

export function TextArea({ label, hint, className, id, ...rest }: TextAreaProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={fid} className="text-[15px] font-semibold text-ink">
        {label}
      </label>
      <textarea id={fid} className={clsx(inputClass, 'min-h-[96px] py-3 leading-relaxed')} {...rest} />
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

interface NumberStepperProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  prefix?: string; // "₹"
  placeholder?: string;
  allowEmpty?: boolean;
  id?: string;
}

/** Typeable number with ± buttons (numeric keypad on phones). */
export function NumberStepper({ label, value, onChange, step = 10, min = 0, prefix, placeholder = '—', allowEmpty = true, id }: NumberStepperProps) {
  const auto = useId();
  const fid = id ?? auto;
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    setText(value == null ? '' : String(value));
  }, [value]);

  const commit = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) {
      if (allowEmpty) onChange(null);
      return;
    }
    onChange(Math.max(min, parseInt(digits, 10)));
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={fid} className="flex-1 text-[15px] font-semibold text-ink">
        {label}
      </label>
      <button
        type="button"
        aria-label={`Less ${label}`}
        className="flex h-12 w-12 items-center justify-center rounded-xl border border-paper-strong bg-white text-ink hover:bg-paper-sunk"
        onClick={() => onChange(Math.max(min, (value ?? 0) - step))}
      >
        <IconMinus />
      </button>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-ink-muted">{prefix}</span>}
        <input
          id={fid}
          inputMode="numeric"
          pattern="[0-9]*"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          className={clsx(
            'h-12 w-[92px] rounded-xl border border-paper-strong bg-white text-center font-display text-lg font-bold text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30',
            prefix && 'pl-6',
          )}
        />
      </div>
      <button
        type="button"
        aria-label={`More ${label}`}
        className="flex h-12 w-12 items-center justify-center rounded-xl border border-paper-strong bg-white text-ink hover:bg-paper-sunk"
        onClick={() => onChange((value ?? 0) + step)}
      >
        <IconPlus />
      </button>
    </div>
  );
}
