import clsx from 'clsx';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { buildBlankEvent, buildWeddingTemplate } from '@/data/seed';
import { newId } from '@/lib/id';
import { dateRangeLabel, fromIsoDate } from '@/lib/format';
import { sessionCount } from '@/lib/calc';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import type { CateringEvent } from '@/types';
import { PageHeader, useScrollTop } from './components/ui';
import { IconWarning } from '@/components/ui/icons';

type StartFrom = 'copy' | 'wedding' | 'blank';
const MAX_DAYS = 10;

/** All ISO dates (yyyy-mm-dd) from `from` to `to`, inclusive. */
function isoRange(from: string, to: string): string[] {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return [];
  const out: string[] = [];
  for (let t = a; t <= b && out.length <= 400; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Copy an old event, re-dating its days (in order) to the new dates. */
function copyFromEvent(src: CateringEvent, name: string, dates: string[], location: string): CateringEvent {
  const now = Date.now();
  const copy = structuredClone(src);
  const days = dates.map((date, i) => {
    const old = copy.days[i];
    if (!old) return { id: newId('dy'), date, title: `Day ${i + 1}`, sessions: [] };
    return {
      ...old,
      id: newId('dy'),
      date,
      sessions: old.sessions.map((s) => ({
        ...s,
        id: newId('se'),
        entries: s.entries.map((en) => ({ ...en, id: newId('en') })),
      })),
    };
  });
  return {
    ...copy,
    id: newId('ev'),
    name: name.trim(),
    location: location.trim(),
    status: 'draft',
    days,
    createdAt: now,
    updatedAt: now,
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-03-10" -> "Wed, 10 Mar 2027 (10-03-2027)" */
function dateReadout(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getUTCDay()]}, ${Number(m[3])} ${MONTHS[d.getUTCMonth()]} ${m[1]} (${fromIsoDate(iso)})`;
}

function DateReadout({ iso }: { iso: string }) {
  return (
    <div className="mt-1.5 text-[15px]" aria-live="polite">
      {iso && <p className="font-semibold text-ink">{dateReadout(iso)}</p>}
      <p className="text-sm text-ink-muted">Tap to pick from the calendar</p>
    </div>
  );
}

interface Errors {
  name?: string;
  from?: string;
  to?: string;
  copy?: string;
}

export default function NewEventScreen() {
  useScrollTop();
  const navigate = useNavigate();
  const events = useAppStore((s) => s.events);
  const createEvent = useAppStore((s) => s.createEvent);

  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [location, setLocation] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [start, setStart] = useState<StartFrom>(events.length > 0 ? 'copy' : 'wedding');
  const [copyId, setCopyId] = useState<string>(events[0]?.id ?? '');
  const [errors, setErrors] = useState<Errors>({});

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Please type a name for this event.';
    if (!from) e.from = 'Please choose the first date.';
    if (!to) e.to = 'Please choose the last date.';
    else if (from && to < from) e.to = 'The last date cannot be before the first date.';
    else if (from && isoRange(from, to).length > MAX_DAYS) e.to = `An event can have at most ${MAX_DAYS} days.`;
    if (start === 'copy' && !events.some((ev) => ev.id === copyId)) e.copy = 'Please pick the event to copy.';
    return e;
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    const dates = isoRange(from, to).map(fromIsoDate);
    let event: CateringEvent;
    if (start === 'copy') {
      const src = events.find((x) => x.id === copyId)!;
      event = copyFromEvent(src, name, dates, location);
      event.clientName = clientName.trim();
      event.clientPhone = clientPhone.trim();
    } else {
      event = (start === 'wedding' ? buildWeddingTemplate : buildBlankEvent)(name, dates, location);
      event.clientName = clientName.trim();
      event.clientPhone = clientPhone.trim();
    }
    const id = createEvent(event);
    navigate(`/event/${id}/menu`);
  };

  const days = from && to ? isoRange(from, to).length : 0;
  const copySrc = start === 'copy' ? events.find((x) => x.id === copyId) : undefined;
  const lost = copySrc && days > 0 && days <= MAX_DAYS ? copySrc.days.map((day, i) => ({ day, n: i + 1 })).filter(({ n }) => n > days) : [];

  const options: { value: StartFrom; title: string; text: string }[] = [
    {
      value: 'copy',
      title: 'Copy an old event',
      text: 'Same days, meals and dishes. You change what is different.',
    },
    {
      value: 'wedding',
      title: 'Wedding template',
      text: 'Tiffin, lunch, snacks and dinner with empty menus.',
    },
    {
      value: 'blank',
      title: 'Blank',
      text: 'Start with nothing and add your own meals.',
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <PageHeader title="New event" backTo="/" backLabel="Back to events" />
      <form onSubmit={submit} noValidate className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 pt-6">
        <Field
          label="Event name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="For example: Thara Wedding"
          autoFocus
          autoComplete="off"
          aria-required="true"
          error={errors.name}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Field
              label="From"
              type="date"
              value={from}
              onChange={(e) => {
                const v = e.target.value;
                setFrom(v);
                if (!to || to < v) setTo(v);
              }}
              aria-required="true"
              error={errors.from}
            />
            <DateReadout iso={from} />
          </div>
          <div>
            <Field label="To" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-required="true" error={errors.to} />
            <DateReadout iso={to} />
          </div>
        </div>
        {days > 0 && days <= MAX_DAYS && !errors.to && (
          <p className="-mt-3 text-[15px] text-ink-muted">
            {days} {days === 1 ? 'day' : 'days'}: one Day is made for each date.
          </p>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-display text-lg font-semibold">Start the menu from</legend>
          {options.map((o) => {
            const on = start === o.value;
            const descId = `start-${o.value}-desc`;
            return (
              <div
                key={o.value}
                className={clsx(
                  'relative flex items-start gap-3 rounded-[18px] border-2 p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand',
                  on ? 'border-brand bg-brand-tint' : 'border-paper-line bg-white hover:bg-paper-sunk',
                )}
              >
                {/* the real radio covers the whole card, so a tap anywhere picks it */}
                <input
                  type="radio"
                  name="start-from"
                  id={`start-${o.value}`}
                  value={o.value}
                  checked={on}
                  aria-describedby={descId}
                  onChange={() => {
                    setStart(o.value);
                    if (o.value === 'copy' && !copyId) setCopyId(events[0]?.id ?? '');
                  }}
                  className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
                />
                <span
                  aria-hidden="true"
                  className={clsx(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                    on ? 'border-brand' : 'border-paper-strong',
                  )}
                >
                  {on && <span className="h-3 w-3 rounded-full bg-brand" />}
                </span>
                <div className="min-w-0">
                  <label htmlFor={`start-${o.value}`} className="block text-base font-semibold">
                    {o.title}
                  </label>
                  <p id={descId} className="text-[15px] text-ink-muted">
                    {o.text}
                  </p>
                </div>
              </div>
            );
          })}
        </fieldset>

        {start === 'copy' && (
          <div role="radiogroup" aria-labelledby="copy-h" className="flex flex-col gap-2 rounded-[18px] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <h3 id="copy-h" className="font-display text-base font-semibold">
              Which event do you want to copy?
            </h3>
            {events.length === 0 ? (
              <p className="text-ink-muted">You have no old events yet. Choose Wedding template or Blank.</p>
            ) : (
              events.map((ev) => (
                <label
                  key={ev.id}
                  className={clsx(
                    'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2',
                    copyId === ev.id ? 'border-brand bg-brand-tint' : 'border-paper-line',
                  )}
                >
                  <input
                    type="radio"
                    name="copy-from"
                    value={ev.id}
                    checked={copyId === ev.id}
                    onChange={() => setCopyId(ev.id)}
                    className="h-5 w-5 shrink-0 accent-[rgb(var(--brand))]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{ev.name}</span>
                    <span className="block text-sm text-ink-muted">
                      {dateRangeLabel(ev.days)} · {ev.days.length} {ev.days.length === 1 ? 'day' : 'days'} · {sessionCount(ev)} meals
                    </span>
                  </span>
                </label>
              ))
            )}
            {errors.copy && <p className="text-sm font-medium text-danger">{errors.copy}</p>}
            <p className="text-sm text-ink-muted">Days are moved to your new dates in order. Extra dates start empty.</p>
            {lost.length > 0 && (
              <div role="alert" className="flex flex-col gap-1 rounded-xl bg-warn-soft p-3 text-[15px] font-medium text-warn">
                {lost.map(({ day, n }) => (
                  <p key={day.id} className="flex items-start gap-1.5">
                    <IconWarning size={18} className="mt-0.5 shrink-0" />
                    <span>
                      Day {n} ({day.date}
                      {day.title && day.title !== `Day ${n}` ? `, ${day.title}` : ''}) will not be copied — add another date to keep it.
                    </span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <Field label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="For example: Avadi" autoComplete="off" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Client name"
            hint="Optional. Printed on the quote."
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            autoComplete="off"
          />
          <Field
            label="Client phone"
            hint="Optional. Printed on the quote."
            type="tel"
            inputMode="tel"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="sticky bottom-0 z-20 -mx-5 mt-auto border-t border-paper-line bg-white px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <Button type="submit" size="lg" block>
            Create event
          </Button>
        </div>
      </form>
    </div>
  );
}
