import clsx from 'clsx';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { EventOutletContext } from '@/components/EventLayout';
import { findSession, useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/toast';
import { SESSION_ICONS } from '@/data/seed';
import { isPriceMissing, sessionTotal } from '@/lib/calc';
import { formatINR, shortDate } from '@/lib/format';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet';
import { Field, inputClass, NumberStepper } from '@/components/ui/Field';
import { IconBack, IconDown, IconPlus, IconTrash, IconUp, IconWarning } from '@/components/ui/icons';
import type { MenuEntry, Pricing } from '@/types';
import { Card, useScrollTop, hasNonEnglish, NON_ENGLISH_WARNING, Segmented } from './components/ui';

type PricingMode = Pricing['mode'];
const PRICING_OPTIONS: { value: PricingMode; label: string }[] = [
  { value: 'perLeaf', label: 'Per plate' },
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'excluded', label: 'Not included in total' },
];

function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-[15px]">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 shrink-0 accent-[rgb(var(--brand))]" />
      {label}
    </label>
  );
}

function Warning({ children }: { children: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 px-1 pb-2 text-sm font-medium text-warn">
      <IconWarning size={16} className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}

interface EntryRowProps {
  entry: MenuEntry;
  index: number;
  count: number;
  onRename: (text: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

function EntryRow({ entry, index, count, onRename, onMove, onRemove }: EntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const inputRef = useRef<HTMLInputElement>(null);
  const isGap = entry.kind === 'gap';
  const label = isGap ? 'blank space' : entry.text;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const t = draft.trim().replace(/\s+/g, ' ');
    if (t && t !== entry.text) onRename(t);
    else setDraft(entry.text);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(entry.text);
      setEditing(false);
    }
  };

  return (
    <li className="border-b border-paper-line last:border-b-0">
      <div className="flex items-center gap-0.5 pl-3 pr-1">
        <div className="min-w-0 flex-1">
          {isGap ? (
            <div className="flex min-h-[44px] items-center">
              <div className="flex-1 border-b-2 border-dotted border-paper-strong pb-0.5 text-sm text-ink-muted">Blank space</div>
            </div>
          ) : editing ? (
            <input
              ref={inputRef}
              aria-label={`Rename ${entry.text}`}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKey}
              className={clsx(inputClass, 'my-1 min-h-[44px]')}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(entry.text);
                setEditing(true);
              }}
              aria-label={`Rename ${entry.kind === 'heading' ? 'heading ' : ''}${entry.text}`}
              className={clsx(
                'flex min-h-[48px] w-full items-center rounded-lg text-left hover:bg-paper-sunk',
                entry.kind === 'heading' ? 'text-sm font-bold uppercase tracking-wide text-brand-dark' : 'text-base',
              )}
            >
              {entry.text}
            </button>
          )}
        </div>
        <IconButton label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)}>
          <IconUp />
        </IconButton>
        <IconButton label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
          <IconDown />
        </IconButton>
        <IconButton label={`Remove ${label}`} onClick={onRemove} className="text-danger">
          <IconTrash size={20} />
        </IconButton>
      </div>
      {!isGap && hasNonEnglish(editing ? draft : entry.text) && <Warning>{NON_ENGLISH_WARNING}</Warning>}
    </li>
  );
}

export default function SessionScreen() {
  useScrollTop();
  const { event } = useOutletContext<EventOutletContext>();
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const updateSession = useAppStore((s) => s.updateSession);
  const addEntry = useAppStore((s) => s.addEntry);
  const updateEntry = useAppStore((s) => s.updateEntry);
  const removeEntry = useAppStore((s) => s.removeEntry);
  const moveEntry = useAppStore((s) => s.moveEntry);
  const removeSession = useAppStore((s) => s.removeSession);
  const moveSessionToDay = useAppStore((s) => s.moveSessionToDay);
  const undo = useAppStore((s) => s.undo);

  const [confirmRemove, setConfirmRemove] = useState(false);
  const [headingOpen, setHeadingOpen] = useState(false);
  const [headingText, setHeadingText] = useState('');

  const base = `/event/${event.id}`;
  const found = findSession(event, sessionId);

  if (!found) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Meal not found</h1>
        <p className="text-ink-muted">It may have been removed.</p>
        <ButtonLink to={`${base}/menu`}>Back to the menu</ButtonLink>
      </div>
    );
  }

  const { session: s, day } = found;
  const menuUrl = `${base}/menu?day=${day.id}`;
  const total = sessionTotal(s);
  const missing = isPriceMissing(s);
  const dishes = s.entries.filter((e) => e.kind === 'dish').length;

  const latestHistoryId = () => useAppStore.getState().history.find((h) => h.eventId === event.id)?.id;

  const removeWithUndo = (entry: MenuEntry) => {
    removeEntry(event.id, s.id, entry.id);
    const hid = latestHistoryId();
    const what = entry.kind === 'gap' ? 'blank space' : entry.text;
    toast({
      text: `Removed ${what}`,
      actionLabel: 'Undo',
      duration: 8000,
      onAction: () => {
        if (hid) undo(hid);
      },
    });
  };

  const setMode = (mode: PricingMode) => {
    if (mode === s.pricing.mode) return;
    const pricing: Pricing = mode === 'perLeaf' ? { mode, rate: null } : mode === 'fixed' ? { mode, amount: null } : { mode };
    updateSession(event.id, s.id, { pricing }, { summary: `${s.name} price changed` });
  };

  return (
    <div className="pb-6">
      <div className="sticky top-[61px] z-20 border-b border-paper-line bg-white md:top-[61px]">
        <div className="flex items-center gap-1 px-2 py-2">
          <Link to={menuUrl} aria-label="Back to menu" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink hover:bg-paper-sunk">
            <IconBack />
          </Link>
          <h1 className="flex-1 font-display text-lg font-semibold">Edit this meal</h1>
          <ButtonLink to={menuUrl} className="min-h-[44px]">
            Done
          </ButtonLink>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-4 py-5">
        <Field label="Meal name" value={s.name} onChange={(e) => updateSession(event.id, s.id, { name: e.target.value })} autoComplete="off" />

        <div role="group" aria-labelledby="icon-label" className="flex flex-col gap-2">
          <span id="icon-label" className="text-[15px] font-semibold">
            Picture
          </span>
          <div className="flex flex-wrap gap-2">
            {SESSION_ICONS.map((o) => (
              <button
                key={o.icon}
                type="button"
                aria-label={o.label}
                aria-pressed={s.icon === o.icon}
                title={o.label}
                onClick={() => updateSession(event.id, s.id, { icon: o.icon })}
                className={clsx(
                  'flex h-12 w-12 items-center justify-center rounded-xl border-2 text-2xl',
                  s.icon === o.icon ? 'border-brand bg-brand-tint' : 'border-paper-line bg-white hover:bg-paper-sunk',
                )}
              >
                <span aria-hidden="true">{o.icon}</span>
              </button>
            ))}
          </div>
        </div>

        <Card className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="meal-time" className="text-[15px] font-semibold">
              Time
            </label>
            <input
              id="meal-time"
              type="time"
              disabled={s.time == null}
              value={s.time ?? ''}
              onChange={(e) => e.target.value && updateSession(event.id, s.id, { time: e.target.value })}
              className={clsx(inputClass, 'disabled:bg-paper-sunk disabled:text-ink-faint')}
            />
            <Check id="no-time" label="No fixed time" checked={s.time == null} onChange={(v) => updateSession(event.id, s.id, { time: v ? null : '12:00' })} />
          </div>

          <div className="flex flex-col gap-1">
            {s.people != null && <NumberStepper label="People" value={s.people} step={10} allowEmpty={false} onChange={(v) => updateSession(event.id, s.id, { people: v ?? 0 })} />}
            <Check
              id="unlimited"
              label={s.people == null ? 'Unlimited (no fixed number of people)' : 'Unlimited'}
              checked={s.people == null}
              onChange={(v) => updateSession(event.id, s.id, { people: v ? null : 100 })}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <span className="text-[15px] font-semibold">How is this meal priced?</span>
          <Segmented label="Pricing" value={s.pricing.mode} options={PRICING_OPTIONS} onChange={setMode} />
          {s.pricing.mode === 'perLeaf' && (
            <NumberStepper
              label="Price per plate (leaf)"
              prefix="₹"
              value={s.pricing.rate}
              step={10}
              allowEmpty
              onChange={(v) => updateSession(event.id, s.id, { pricing: { mode: 'perLeaf', rate: v } })}
            />
          )}
          {s.pricing.mode === 'fixed' && (
            <NumberStepper
              label="Amount"
              prefix="₹"
              value={s.pricing.amount}
              step={1000}
              allowEmpty
              onChange={(v) => updateSession(event.id, s.id, { pricing: { mode: 'fixed', amount: v } })}
            />
          )}
          <div
            className={clsx('flex items-center justify-between gap-2 rounded-xl px-3 py-3', missing ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand-dark')}
          >
            <span className="text-[15px] font-semibold">Total for this meal</span>
            <span className="font-display text-xl font-bold" data-testid="session-total">
              {s.pricing.mode === 'excluded' ? 'Not included' : missing || total == null ? 'Price missing' : formatINR(total)}
            </span>
          </div>
        </Card>

        <section aria-labelledby="dishes-h" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 id="dishes-h" className="font-display text-lg font-semibold">
              Dishes ({dishes})
            </h2>
            <span className="text-sm text-ink-muted">Tap a name to change it</span>
          </div>
          {s.entries.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-paper-strong bg-white p-4 text-center text-ink-muted">No dishes yet. Tap “Add dish”.</p>
          ) : (
            <ul className="m-0 list-none overflow-hidden rounded-2xl border border-paper-line bg-white p-0">
              {s.entries.map((en, i) => (
                <EntryRow
                  key={en.id}
                  entry={en}
                  index={i}
                  count={s.entries.length}
                  onRename={(text) => updateEntry(event.id, s.id, en.id, text)}
                  onMove={(dir) => moveEntry(event.id, s.id, en.id, dir)}
                  onRemove={() => removeWithUndo(en)}
                />
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <ButtonLink to={`${base}/menu/${s.id}/add`} size="lg" icon={<IconPlus size={20} />} className="sm:flex-1">
              Add dish
            </ButtonLink>
            <div className="flex flex-wrap gap-2 sm:flex-1">
              <Button variant="secondary" className="flex-1 border-dashed" onClick={() => addEntry(event.id, s.id, { kind: 'gap', text: '' })}>
                Add blank space
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setHeadingText('');
                  setHeadingOpen(true);
                }}
              >
                Add sub-heading
              </Button>
            </div>
          </div>
        </section>

        {event.days.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="move-day" className="text-[15px] font-semibold">
              Day for this meal
            </label>
            <select
              id="move-day"
              className={inputClass}
              value={day.id}
              onChange={(e) => {
                const target = event.days.find((d) => d.id === e.target.value);
                if (!target || target.id === day.id) return;
                moveSessionToDay(event.id, s.id, target.id);
                toast({ text: `Moved ${s.name} to ${shortDate(target.date)}` });
              }}
            >
              {event.days.map((d, i) => (
                <option key={d.id} value={d.id}>
                  Day {i + 1} · {shortDate(d.date)}
                  {d.title ? ` · ${d.title}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button variant="danger" block icon={<IconTrash size={18} />} onClick={() => setConfirmRemove(true)}>
          Remove this meal
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${s.name}?`}
        message={`This meal and its ${dishes} ${dishes === 1 ? 'dish' : 'dishes'} will be removed from the menu. You can undo it from Recent changes.`}
        confirmLabel="Yes, remove it"
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          const name = s.name;
          navigate(menuUrl);
          removeSession(event.id, s.id);
          const hid = latestHistoryId();
          toast({ text: `Removed ${name}`, actionLabel: 'Undo', duration: 8000, onAction: () => hid && undo(hid) });
        }}
      />

      <Sheet
        open={headingOpen}
        onClose={() => setHeadingOpen(false)}
        title="Add sub-heading"
        footer={
          <Button
            block
            size="lg"
            disabled={!headingText.trim()}
            onClick={() => {
              addEntry(event.id, s.id, { kind: 'heading', text: headingText.trim() });
              setHeadingOpen(false);
            }}
          >
            Add sub-heading
          </Button>
        }
      >
        <div className="pb-2">
          <Field label="Sub-heading" hint="For example: Live Stall" value={headingText} onChange={(e) => setHeadingText(e.target.value)} autoFocus />
          {hasNonEnglish(headingText) && <Warning>{NON_ENGLISH_WARNING}</Warning>}
        </div>
      </Sheet>
    </div>
  );
}
