import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/toast';
import { dateRangeLabel, formatINR } from '@/lib/format';
import { grandTotal, missingPrices, sessionCount } from '@/lib/calc';
import { isIos, isStandalone } from '@/lib/fileShare';
import { clearInstallPrompt, getInstallPrompt, onInstallPromptChange } from '@/sw-register';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { IconClose, IconCopy, IconMore, IconPlus, IconSearch, IconSettings, IconTrash, IconWarning } from '@/components/ui/icons';
import type { CateringEvent, EventStatus } from '@/types';
import { BrandMark } from './components/BrandMark';
import { BackupCard } from './components/BackupCard';
import { STATUS_LABEL, StatusPill, useScrollTop } from './components/ui';

type Filter = 'all' | EventStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Not sent' },
  { value: 'sent', label: 'Sent' },
  { value: 'confirmed', label: 'Confirmed' },
];

function matches(e: CateringEvent, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [e.name, e.location, e.clientName, dateRangeLabel(e.days), ...e.days.map((d) => d.date)].join(' ').toLowerCase();
  return needle.split(/\s+/).every((w) => hay.includes(w));
}

function InstallBanner() {
  const shareCount = useAppStore((s) => s.meta.shareCount);
  const dismissed = useAppStore((s) => s.meta.installDismissed);
  const dismissInstall = useAppStore((s) => s.dismissInstall);
  const [prompt, setPrompt] = useState(getInstallPrompt());
  useEffect(() => onInstallPromptChange(() => setPrompt(getInstallPrompt())), []);

  if (dismissed || shareCount < 2 || isStandalone()) return null;
  const iosHint = !prompt && isIos();
  if (!prompt && !iosHint) return null;

  return (
    <section aria-label="Add to home screen" className="flex items-center gap-3 rounded-[20px] border border-paper-line bg-brand-tint p-4">
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-semibold">Add Catering Quote to your home screen</p>
        {iosHint && <p className="mt-0.5 text-[15px] text-ink-muted">Tap Share → Add to Home Screen</p>}
      </div>
      {prompt && (
        <Button
          onClick={async () => {
            try {
              await prompt.prompt();
            } finally {
              clearInstallPrompt();
            }
          }}
        >
          Add
        </Button>
      )}
      <IconButton label="Hide this message" tone="soft" onClick={dismissInstall}>
        <IconClose size={18} />
      </IconButton>
    </section>
  );
}

function EventCard({ event, onMenu }: { event: CateringEvent; onMenu: () => void }) {
  const missing = missingPrices(event).length;
  return (
    <li className="relative">
      <Link
        to={`/event/${event.id}/menu`}
        className="block rounded-[20px] border border-paper-line bg-white p-4 pr-16 text-ink no-underline shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md"
      >
        <span className="block font-display text-lg font-semibold leading-snug">{event.name}</span>
        <span className="mt-0.5 block text-[15px] text-ink-muted">
          {dateRangeLabel(event.days)}
          {event.location ? ` · ${event.location}` : ''}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={event.status} />
          {missing > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-3 py-1 text-[13px] font-semibold text-warn">
              <IconWarning size={14} />
              {missing} {missing === 1 ? 'price' : 'prices'} missing
            </span>
          )}
        </span>
        <span className="mt-3 grid grid-cols-[1fr_1fr_1.7fr] gap-2">
          <span className="rounded-xl bg-paper-sunk px-3 py-2">
            <span className="block text-[13px] text-ink-muted">Days</span>
            <span className="block font-semibold">{event.days.length}</span>
          </span>
          <span className="rounded-xl bg-paper-sunk px-3 py-2">
            <span className="block text-[13px] text-ink-muted">Meals</span>
            <span className="block font-semibold">{sessionCount(event)}</span>
          </span>
          <span className="rounded-xl bg-brand-soft px-3 py-2">
            <span className="block text-[13px] text-brand-dark">Total</span>
            <span className="block truncate font-bold text-brand-dark">{grandTotal(event) > 0 ? formatINR(grandTotal(event)) : '—'}</span>
          </span>
        </span>
      </Link>
      <IconButton label={`More for ${event.name}`} tone="soft" className="absolute right-3 top-3" onClick={onMenu}>
        <IconMore />
      </IconButton>
    </li>
  );
}

export default function EventsScreen() {
  useScrollTop();
  const events = useAppStore((s) => s.events);
  const brand = useAppStore((s) => s.brand);
  const duplicateEvent = useAppStore((s) => s.duplicateEvent);
  const deleteEvent = useAppStore((s) => s.deleteEvent);
  const setStatus = useAppStore((s) => s.setStatus);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [copyName, setCopyName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const shown = useMemo(() => events.filter((e) => (filter === 'all' || e.status === filter) && matches(e, query)), [events, filter, query]);
  const menuEvent = events.find((e) => e.id === menuId);
  const copyEvent = events.find((e) => e.id === copyId);
  const deleteTarget = events.find((e) => e.id === deleteId);

  const businessLines = useMemo(() => {
    const words = brand.businessName.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 2) return [brand.businessName.trim() || 'Catering Quote', ''];
    return [words.slice(0, 2).join(' '), words.slice(2).join(' ')];
  }, [brand.businessName]);

  return (
    <div className="min-h-dvh bg-paper pb-[calc(104px+env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-md px-5 pt-6 md:max-w-3xl lg:max-w-5xl">
        <header className="flex items-center gap-3">
          <BrandMark brand={brand} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-display text-[15px] font-semibold">{businessLines[0]}</div>
            {businessLines[1] && <div className="truncate text-sm text-ink-muted">{businessLines[1]}</div>}
          </div>
          <Link
            to="/settings"
            aria-label="Settings"
            className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-paper-line bg-white text-ink hover:bg-paper-sunk"
          >
            <IconSettings size={20} />
          </Link>
        </header>

        <h1 className="mt-5 font-display text-[28px] font-bold leading-tight">Your events</h1>

        <div className="mt-4 space-y-3">
          <div className="relative">
            <label htmlFor="event-search" className="sr-only-text">
              Search events
            </label>
            <input
              id="event-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, place or date"
              className="block min-h-[52px] w-full rounded-2xl border border-paper-strong bg-white pl-11 pr-4 text-base placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <IconSearch size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
          </div>
          <div role="group" aria-label="Show events" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={clsx(
                  'min-h-[44px] rounded-full border px-4 text-[15px] font-semibold',
                  filter === f.value ? 'border-ink bg-ink text-white' : 'border-paper-strong bg-white text-ink hover:bg-paper-sunk',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <main className="mt-4">
          {events.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-paper-strong bg-white p-6 text-center">
              <p className="font-display text-lg font-semibold">No events yet</p>
              <p className="mt-1 text-ink-muted">Tap “New event” to make your first menu and quotation.</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-paper-strong bg-white p-6 text-center">
              <p className="font-display text-lg font-semibold">No events match</p>
              <p className="mt-1 text-ink-muted">Try another word, or choose “All”.</p>
            </div>
          ) : (
            <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 lg:grid-cols-3">
              {shown.map((e) => (
                <EventCard key={e.id} event={e} onMenu={() => setMenuId(e.id)} />
              ))}
            </ul>
          )}
        </main>

        <div className="mt-6 space-y-3">
          <InstallBanner />
          <BackupCard />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-paper via-paper/95 to-transparent px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto flex max-w-md justify-center md:max-w-3xl lg:max-w-5xl">
          <ButtonLink to="/new" size="lg" block icon={<IconPlus size={20} />} className="shadow-[0_8px_20px_rgba(0,0,0,0.18)] md:max-w-sm">
            New event
          </ButtonLink>
        </div>
      </div>

      {/* ⋯ menu */}
      <Sheet open={!!menuEvent} onClose={() => setMenuId(null)} title={menuEvent?.name ?? 'Event'}>
        {menuEvent && (
          <div className="flex flex-col gap-2 pb-2">
            <Button
              variant="secondary"
              block
              icon={<IconCopy size={18} />}
              onClick={() => {
                setCopyName(`${menuEvent.name} (copy)`);
                setCopyId(menuEvent.id);
                setMenuId(null);
              }}
            >
              Duplicate
            </Button>
            {(['draft', 'sent', 'confirmed'] as EventStatus[])
              .filter((s) => s !== menuEvent.status)
              .map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  block
                  onClick={() => {
                    setStatus(menuEvent.id, s);
                    setMenuId(null);
                    toast({ text: `${menuEvent.name} marked as ${STATUS_LABEL[s]}`, tone: 'success' });
                  }}
                >
                  Mark as {STATUS_LABEL[s]}
                </Button>
              ))}
            <Button
              variant="danger"
              block
              icon={<IconTrash size={18} />}
              onClick={() => {
                setDeleteId(menuEvent.id);
                setMenuId(null);
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </Sheet>

      {/* Duplicate: ask for a name */}
      <Sheet
        open={!!copyEvent}
        onClose={() => setCopyId(null)}
        title="Duplicate event"
        footer={
          <Button
            block
            size="lg"
            disabled={!copyName.trim()}
            onClick={() => {
              if (!copyEvent) return;
              const id = duplicateEvent(copyEvent.id, copyName.trim());
              setCopyId(null);
              if (id) toast({ text: `Made a copy: ${copyName.trim()}`, tone: 'success' });
            }}
          >
            Make a copy
          </Button>
        }
      >
        <div className="pb-2">
          <Field label="Name for the copy" value={copyName} onChange={(e) => setCopyName(e.target.value)} autoFocus />
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.name ?? 'event'}?`}
        message="This removes the whole event and its changes from this phone. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            deleteEvent(deleteTarget.id);
            toast({ text: `Deleted ${deleteTarget.name}` });
          }
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
