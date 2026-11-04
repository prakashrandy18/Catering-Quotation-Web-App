import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { EventOutletContext } from '@/components/EventLayout';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/toast';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Sheet';
import { IconUndo } from '@/components/ui/icons';
import { useScrollTop } from './components/ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clock(d: Date): string {
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "Just now", "10 min ago", "2 hours ago", "Yesterday, 4:10 PM", "12 Feb, 4:10 PM". */
export function whenLabel(at: number, now = Date.now()): string {
  const diff = now - at;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  const d = new Date(at);
  const n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  if (days <= 0) {
    const h = Math.floor(diff / 3_600_000);
    return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  }
  if (days === 1) return `Yesterday, ${clock(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock(d)}`;
}

export default function HistoryScreen() {
  useScrollTop();
  const { event } = useOutletContext<EventOutletContext>();
  const allHistory = useAppStore((s) => s.history);
  const undo = useAppStore((s) => s.undo);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const entries = useMemo(() => allHistory.filter((h) => h.eventId === event.id), [allHistory, event.id]);
  const confirmIndex = entries.findIndex((h) => h.id === confirmId);

  const doUndo = (id: string) => {
    const target = entries.find((h) => h.id === id);
    if (!target) return;
    const redoId = undo(id);
    toast({
      text: `Undone: ${target.summary}`,
      tone: 'success',
      duration: 9000,
      actionLabel: redoId ? 'Redo' : undefined,
      onAction: redoId
        ? () => {
            undo(redoId);
          }
        : undefined,
    });
  };

  return (
    <div className="px-4 pb-6 pt-5">
      <h1 className="font-display text-2xl font-bold">Recent changes</h1>
      <p className="mb-4 text-ink-muted">Saved on this phone</p>

      {entries.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-paper-strong bg-white p-6 text-center">
          <p className="font-display text-lg font-semibold">No changes yet</p>
          <p className="mt-1 text-ink-muted">When you change the menu, each change shows here and can be undone.</p>
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {entries.map((h, i) => (
            <li
              key={h.id}
              className={clsx(
                'flex flex-col gap-2 rounded-2xl border bg-white p-4',
                i === 0 ? 'border-brand shadow-[0_2px_8px_rgba(0,0,0,0.06)]' : 'border-paper-line',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    'rounded-full px-3 py-0.5 text-[13px] font-semibold',
                    h.by === 'claude' ? 'bg-brand-soft text-brand-dark' : 'bg-paper-sunk text-ink',
                  )}
                >
                  {h.by === 'claude' ? 'Claude' : 'You'}
                </span>
                <span className="text-sm text-ink-muted">{whenLabel(h.at)}</span>
                {i === 0 && <span className="ml-auto text-[13px] font-semibold text-brand">Current</span>}
              </div>
              <div className="text-base font-semibold">{h.summary}</div>
              {h.detail && <div className="text-[15px] leading-snug text-ink-muted">{h.detail}</div>}
              {h.before && (
                <Button
                  variant="secondary"
                  className="self-start"
                  icon={<IconUndo size={18} />}
                  onClick={() => (i === 0 ? doUndo(h.id) : setConfirmId(h.id))}
                >
                  Undo this change
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={confirmId !== null && confirmIndex > 0}
        title="Undo this change?"
        message={`This also undoes the ${confirmIndex} ${confirmIndex === 1 ? 'change' : 'changes'} made after it. Continue?`}
        confirmLabel="Yes, undo"
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          const id = confirmId;
          setConfirmId(null);
          if (id) doUndo(id);
        }}
      />
    </div>
  );
}
