import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { EventOutletContext } from '@/components/EventLayout';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/toast';
import { fromIsoDate, parseDate, toIsoDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Sheet';
import { Field, inputClass, TextArea } from '@/components/ui/Field';
import { IconPlus, IconTrash } from '@/components/ui/icons';
import type { Day, EventStatus } from '@/types';
import { Card, Segmented, useScrollTop } from './components/ui';

const STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: 'Not sent' },
  { value: 'sent', label: 'Sent' },
  { value: 'confirmed', label: 'Confirmed' },
];

/** The day after `date` ("DD-MM-YYYY"), or today if the date cannot be read. */
function nextDate(date: string | undefined): string {
  const p = date ? parseDate(date) : null;
  const base = p ? new Date(Date.UTC(p.y, p.m - 1, p.d)) : new Date();
  if (p) base.setUTCDate(base.getUTCDate() + 1);
  return fromIsoDate(base.toISOString().slice(0, 10));
}

export default function EventDetailsScreen() {
  useScrollTop();
  const { event } = useOutletContext<EventOutletContext>();
  const updateEventDetails = useAppStore((s) => s.updateEventDetails);
  const setStatus = useAppStore((s) => s.setStatus);
  const addDay = useAppStore((s) => s.addDay);
  const updateDay = useAppStore((s) => s.updateDay);
  const removeDay = useAppStore((s) => s.removeDay);
  const [removing, setRemoving] = useState<Day | null>(null);

  const removingIndex = removing ? event.days.findIndex((d) => d.id === removing.id) : -1;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Event details</h1>
        <p className="text-ink-muted">Changes are saved as you type.</p>
      </div>

      <Field
        label="Event name"
        value={event.name}
        onChange={(e) => updateEventDetails(event.id, { name: e.target.value })}
        error={event.name.trim() ? undefined : 'Please type a name for this event.'}
        autoComplete="off"
      />
      <Field label="Client name" hint="Printed on the quote for the client." value={event.clientName} onChange={(e) => updateEventDetails(event.id, { clientName: e.target.value })} autoComplete="off" />
      <Field
        label="Client phone"
        type="tel"
        inputMode="tel"
        value={event.clientPhone}
        onChange={(e) => updateEventDetails(event.id, { clientPhone: e.target.value })}
        autoComplete="off"
      />
      <Field label="Location" value={event.location} onChange={(e) => updateEventDetails(event.id, { location: e.target.value })} autoComplete="off" />
      <TextArea
        label="Notes"
        hint="Printed on the client quote, under the cost breakdown."
        value={event.notes}
        onChange={(e) => updateEventDetails(event.id, { notes: e.target.value })}
        rows={3}
      />

      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">Status</span>
        <Segmented label="Status" value={event.status} options={STATUS_OPTIONS} onChange={(s) => setStatus(event.id, s)} />
      </div>

      <section aria-labelledby="days-h" className="flex flex-col gap-3">
        <h2 id="days-h" className="font-display text-lg font-semibold">
          Days
        </h2>
        {event.days.map((d, i) => {
          const iso = toIsoDate(d.date);
          return (
            <Card key={d.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold">Day {i + 1}</span>
                <Button
                  variant="danger"
                  disabled={event.days.length <= 1}
                  icon={<IconTrash size={18} />}
                  aria-label={`Remove day ${i + 1}`}
                  onClick={() => setRemoving(d)}
                >
                  Remove
                </Button>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`day-date-${d.id}`} className="text-[15px] font-semibold">
                  Date
                </label>
                <input
                  id={`day-date-${d.id}`}
                  type="date"
                  className={inputClass}
                  value={iso}
                  onChange={(e) => {
                    const v = fromIsoDate(e.target.value);
                    if (v) updateDay(event.id, d.id, { date: v });
                  }}
                />
              </div>
              <Field
                label="Day title"
                hint="For example: Viratham & Reception"
                value={d.title}
                onChange={(e) => updateDay(event.id, d.id, { title: e.target.value })}
                autoComplete="off"
              />
            </Card>
          );
        })}
        <Button
          variant="secondary"
          block
          icon={<IconPlus size={18} />}
          onClick={() => {
            const last = event.days[event.days.length - 1];
            addDay(event.id, { date: nextDate(last?.date), title: `Day ${event.days.length + 1}` });
            toast({ text: 'Added a day' });
          }}
        >
          Add a day
        </Button>
      </section>

      <Link to={`/event/${event.id}/menu`} className="inline-flex min-h-[48px] items-center font-semibold text-brand underline">
        Back to the menu
      </Link>

      <ConfirmDialog
        open={!!removing}
        title={`Remove Day ${removingIndex + 1}?`}
        message={
          removing && (
            <>
              This day has {removing.sessions.length} {removing.sessions.length === 1 ? 'meal' : 'meals'}. They will be removed too. You can bring them back from
              Recent changes.
            </>
          )
        }
        confirmLabel="Yes, remove day"
        danger
        onConfirm={() => {
          if (removing) removeDay(event.id, removing.id);
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
