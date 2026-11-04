import clsx from 'clsx';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import type { EventOutletContext } from '@/components/EventLayout';
import { useAppStore } from '@/store/useAppStore';
import { dayTotal, dishCount, grandTotal, isPriceMissing, missingPrices, sessionTotal } from '@/lib/calc';
import { formatINR, shortDate, timeLabel } from '@/lib/format';
import { ButtonLink, IconButton } from '@/components/ui/Button';
import { IconChat, IconChevronRight, IconDown, IconEdit, IconPlus, IconUp, IconWarning } from '@/components/ui/icons';
import type { Session } from '@/types';
import { useScrollTop } from './components/ui';

function mealMeta(s: Session): string {
  const parts: string[] = [];
  const t = timeLabel(s.time);
  if (t) parts.push(t);
  parts.push(s.people == null ? 'Unlimited' : `${s.people} people`);
  const n = dishCount(s);
  parts.push(`${n} ${n === 1 ? 'dish' : 'dishes'}`);
  return parts.join(' · ');
}

export default function MenuScreen() {
  useScrollTop();
  const { event } = useOutletContext<EventOutletContext>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const addSession = useAppStore((s) => s.addSession);
  const moveSession = useAppStore((s) => s.moveSession);

  const dayId = params.get('day');
  const dayIndex = Math.max(0, event.days.findIndex((d) => d.id === dayId));
  const day = event.days[dayIndex];
  const missing = missingPrices(event);
  const base = `/event/${event.id}`;

  const addMeal = () => {
    if (!day) return;
    const id = addSession(event.id, day.id, {
      name: 'New meal',
      icon: '🍽️',
      time: '12:00',
      people: 100,
      pricing: { mode: 'perLeaf', rate: null },
    });
    navigate(`${base}/menu/${id}`);
  };

  return (
    <div className="px-4 pb-4 pt-4">
      {missing.length > 0 && (
        <div role="note" className="mb-4 flex items-center gap-3 rounded-2xl bg-warn-soft p-3 text-warn">
          <IconWarning size={22} className="shrink-0" />
          <p className="flex-1 text-[15px] font-semibold">
            {missing.length} {missing.length === 1 ? 'meal has' : 'meals have'} no price yet
          </p>
          <Link
            to={`${base}/menu/${missing[0].sessionId}`}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-warn/40 bg-white px-3 text-[15px] font-semibold text-warn no-underline"
          >
            Fix now
          </Link>
        </div>
      )}

      {event.days.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-paper-strong bg-white p-6 text-center">
          <p className="font-display text-lg font-semibold">This event has no days</p>
          <Link to={`${base}/details`} className="mt-2 inline-flex min-h-[44px] items-center font-semibold text-brand underline">
            Add a day in Event details
          </Link>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Days" className="flex flex-wrap gap-2">
            {event.days.map((d, i) => {
              const on = i === dayIndex;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setParams({ day: d.id }, { replace: true })}
                  className={clsx(
                    'flex min-h-[60px] min-w-[96px] flex-1 flex-col items-center justify-center rounded-2xl border px-3 py-1.5',
                    on ? 'border-brand bg-brand text-white' : 'border-paper-strong bg-white text-ink hover:bg-paper-sunk',
                  )}
                >
                  <span className="font-display text-[15px] font-semibold">{shortDate(d.date)}</span>
                  <span className={clsx('text-[13px]', on ? 'text-white/90' : 'text-ink-muted')}>{dayTotal(d) > 0 || !d.sessions.some(isPriceMissing) ? formatINR(dayTotal(d)) : 'No price yet'}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-[15px] text-ink-muted">
              Day {dayIndex + 1} · {day.date}
              {day.title ? ` · ${day.title}` : ''}
            </p>
            <div className="flex items-center gap-1">
              <Link
                to={`${base}/chat?draft=${encodeURIComponent(`On Day ${dayIndex + 1}, `)}`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold text-brand no-underline hover:bg-paper-sunk"
              >
                <IconChat size={18} />
                Change by talking
              </Link>
              <Link
                to={`${base}/details`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold text-brand no-underline hover:bg-paper-sunk"
              >
                <IconEdit size={18} />
                Event details
              </Link>
            </div>
          </div>

          <ul className="mt-2 flex list-none flex-col gap-3 p-0">
            {day.sessions.map((s, i) => {
              const total = sessionTotal(s);
              const noPrice = isPriceMissing(s);
              return (
                <li key={s.id} className="flex items-stretch gap-1 rounded-[20px] bg-white p-2 pl-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                  <Link
                    to={`${base}/menu/${s.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-2 pr-1 text-ink no-underline hover:bg-paper-sunk"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-2xl" aria-hidden="true">
                      {s.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-base font-semibold leading-snug">{s.name}</span>
                      <span className="block text-sm text-ink-muted">{mealMeta(s)}</span>
                      <span className="mt-1 flex items-center justify-between gap-2">
                        {s.pricing.mode === 'excluded' ? (
                          <span className="text-[15px] font-semibold text-ink-muted">Not included</span>
                        ) : noPrice ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-3 py-1 text-[13px] font-semibold text-warn">
                            <IconWarning size={14} />
                            Price missing
                          </span>
                        ) : (
                          <span className="text-[15px] font-bold text-brand">{formatINR(total ?? 0)}</span>
                        )}
                        <IconChevronRight size={18} className="text-ink-faint" />
                      </span>
                    </span>
                  </Link>
                  <div className="flex shrink-0 flex-col justify-center">
                    <IconButton label={`Move ${s.name} up`} disabled={i === 0} onClick={() => moveSession(event.id, s.id, -1)}>
                      <IconUp />
                    </IconButton>
                    <IconButton label={`Move ${s.name} down`} disabled={i === day.sessions.length - 1} onClick={() => moveSession(event.id, s.id, 1)}>
                      <IconDown />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>

          {day.sessions.length === 0 && (
            <p className="mt-2 rounded-2xl bg-white p-4 text-center text-ink-muted">No meals on this day yet.</p>
          )}

          <button
            type="button"
            onClick={addMeal}
            className="mt-3 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/40 bg-transparent text-base font-semibold text-brand hover:bg-brand-tint"
          >
            <IconPlus size={20} />
            Add a meal
          </button>
        </>
      )}

      <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 mt-5 flex items-center gap-3 border-t border-paper-line bg-white px-4 py-3 md:bottom-0">
        <div className="flex-1">
          <div className="text-sm text-ink-muted">Grand total</div>
          <div className="font-display text-[22px] font-bold leading-tight" data-testid="grand-total">
            {formatINR(grandTotal(event))}
          </div>
        </div>
        <ButtonLink to={`${base}/pdf`} size="lg">
          See PDF
        </ButtonLink>
      </div>
    </div>
  );
}
