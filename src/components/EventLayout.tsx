import clsx from 'clsx';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useAppStore, useEvent } from '@/store/useAppStore';
import { dateRangeLabel, formatINR } from '@/lib/format';
import { grandTotal } from '@/lib/calc';
import { IconBack, IconChat, IconFile, IconHistory, IconList } from '@/components/ui/icons';
import type { CateringEvent } from '@/types';

const PreviewPanel = lazy(() => import('@/pdf/PreviewPanel'));

const TABS = [
  { to: 'chat', label: 'Chat', icon: IconChat },
  { to: 'menu', label: 'Menu', icon: IconList },
  { to: 'pdf', label: 'PDF', icon: IconFile },
] as const;

/** Context handed to nested event screens via <Outlet context>. */
export interface EventOutletContext {
  event: CateringEvent;
}

/**
 * Shell for every screen inside one event:
 * - phone: header on top, Chat · Menu · PDF tab bar at the bottom
 * - ≥768px: tabs in the header, live PDF preview pane on the right (except on the PDF tab)
 */
export default function EventLayout() {
  const { eventId } = useParams();
  const event = useEvent(eventId);
  const setLastEvent = useAppStore((s) => s.setLastEvent);
  const location = useLocation();
  const onPdfTab = /\/pdf(\/|$)/.test(location.pathname);
  const headerRef = useRef<HTMLElement>(null);

  // Publish the header's real height (it grows with large text) so sticky sub-headers sit right below it.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--event-header-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // New screen → start at the top (HashRouter keeps the old scroll position otherwise).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (event) setLastEvent(event.id);
  }, [event, setLastEvent]);

  if (!event) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display text-2xl font-bold">Event not found</h1>
        <p className="text-ink-muted">It may have been deleted on this phone.</p>
        <Link to="/" className="rounded-2xl bg-brand px-5 py-3 font-semibold text-white">
          Go to your events
        </Link>
      </main>
    );
  }

  const total = grandTotal(event);

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header ref={headerRef} className="sticky top-0 z-30 border-b border-paper-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-1 px-2 py-2 md:px-4">
          <Link to="/" aria-label="Back to all events" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink hover:bg-paper-sunk">
            <IconBack />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg font-semibold leading-tight" data-testid="event-title">
              {event.name}
            </div>
            <div className="text-sm leading-snug text-ink-muted">
              {dateRangeLabel(event.days)}
              {event.location ? ` · ${event.location}` : ''} · <span data-testid="header-total">{formatINR(total)}</span>
            </div>
          </div>
          <nav aria-label="Event sections" className="hidden items-center gap-1 rounded-2xl bg-[#EFEFEB] p-1 md:flex">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[15px] font-semibold',
                    isActive ? 'bg-white text-brand shadow-sm' : 'text-ink-muted hover:text-ink',
                  )
                }
              >
                <t.icon size={18} />
                {t.label}
              </NavLink>
            ))}
          </nav>
          <Link
            to="history"
            aria-label="Recent changes and undo"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink hover:bg-paper-sunk md:ml-2"
          >
            <IconHistory />
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1">
        <main className={clsx('min-w-0 flex-1 pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-6', !onPdfTab && 'md:max-w-[620px] md:border-r md:border-paper-line')}>
          <Outlet context={{ event } satisfies EventOutletContext} />
        </main>
        {!onPdfTab && (
          <aside aria-label="Live PDF preview" className="sticky top-[var(--event-header-h,61px)] hidden h-[calc(100dvh-var(--event-header-h,61px))] min-w-0 flex-1 overflow-y-auto bg-[#EDEDEA] md:block">
            <Suspense fallback={<div className="p-6 text-ink-muted">Loading preview…</div>}>
              <PreviewPanel event={event} />
            </Suspense>
          </aside>
        )}
      </div>

      <nav
        aria-label="Event sections"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-paper-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              clsx('flex min-h-[64px] flex-col items-center justify-center gap-0.5 text-[13px] font-semibold', isActive ? 'text-brand' : 'text-ink-muted')
            }
          >
            <t.icon size={24} />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
