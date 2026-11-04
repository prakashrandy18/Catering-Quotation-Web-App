import clsx from 'clsx';
import { useToastStore } from '@/store/toast';

/** Toast area above the bottom tab bar. role=status so screen readers announce it. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:top-auto">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={clsx(
            'pointer-events-auto flex min-h-[56px] w-full max-w-[480px] items-center gap-2 rounded-2xl py-1 pl-4 pr-1 text-[15px] text-white shadow-xl',
            t.tone === 'error' ? 'bg-danger' : t.tone === 'warning' ? 'bg-warn' : 'bg-ink',
          )}
        >
          <span className="flex-1 py-2">{t.text}</span>
          {t.actionLabel && (
            <button
              type="button"
              className="min-h-[44px] rounded-xl px-3 font-semibold text-[#CFE3BD] hover:bg-white/10"
              onClick={() => {
                t.onAction?.();
                dismiss(t.id);
              }}
            >
              {t.actionLabel}
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="min-h-[44px] min-w-[44px] rounded-xl text-white/80 hover:bg-white/10" onClick={() => dismiss(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
