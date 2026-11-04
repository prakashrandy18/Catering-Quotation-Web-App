import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { EventOutletContext } from '@/components/EventLayout';
import { findSession, useAppStore } from '@/store/useAppStore';
import { DISH_LIBRARY } from '@/data/dishLibrary';
import { searchDishes, suggestSpelling, tidyDishName } from '@/lib/search';
import { Button, ButtonLink } from '@/components/ui/Button';
import { IconCheck, IconClose, IconPlus, IconSearch, IconWarning } from '@/components/ui/icons';
import type { Dish, DishCategory } from '@/types';
import { hasNonEnglish, NON_ENGLISH_WARNING, useScrollTop } from './components/ui';

/** Which dish groups are likely for a meal, judged from its name. */
function likelyCategories(mealName: string): DishCategory[] {
  const n = mealName.toLowerCase();
  if (/beverage|drink|juice/.test(n)) return ['Drinks'];
  if (/snack|evening|vilayadal/.test(n)) return ['Vadai & Snacks', 'Drinks'];
  if (/tiffin|breakfast|morning/.test(n)) return ['Tiffin', 'Pachadi & Pickle'];
  if (/lunch|dinner|brunch|saatham|meal/.test(n)) return ['Sweet', 'Rice', 'Poriyal & Kootu'];
  return ['Sweet', 'Tiffin'];
}

const norm = (s: string) => s.trim().toLowerCase();

export default function AddDishScreen() {
  useScrollTop();
  const { event } = useOutletContext<EventOutletContext>();
  const { sessionId = '' } = useParams();
  const customDishes = useAppStore((s) => s.customDishes);
  const addEntry = useAppStore((s) => s.addEntry);
  const removeEntry = useAppStore((s) => s.removeEntry);
  const addCustomDish = useAppStore((s) => s.addCustomDish);
  const rememberSpelling = useAppStore((s) => s.rememberSpelling);

  const [q, setQ] = useState('');
  const [added, setAdded] = useState<string[]>([]); // entry ids added during this visit
  const [asking, setAsking] = useState<Dish | null>(null); // spelling suggestion being asked
  const inputRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => [...DISH_LIBRARY, ...customDishes], [customDishes]);
  const found = findSession(event, sessionId);
  const base = `/event/${event.id}`;
  const editorUrl = `${base}/menu/${sessionId}`;

  if (!found) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Meal not found</h1>
        <ButtonLink to={`${base}/menu`}>Back to the menu</ButtonLink>
      </div>
    );
  }
  const session = found.session;
  const dishEntries = session.entries.filter((e) => e.kind === 'dish');
  const entryFor = (name: string) => dishEntries.find((e) => norm(e.text) === norm(name));
  const addedHere = added.filter((id) => session.entries.some((e) => e.id === id));

  const add = (name: string) => {
    const id = addEntry(event.id, session.id, { kind: 'dish', text: name });
    setAdded((a) => [...a, id]);
  };
  const remove = (entryId: string) => {
    removeEntry(event.id, session.id, entryId);
    setAdded((a) => a.filter((x) => x !== entryId));
  };
  const toggle = (name: string) => {
    const existing = entryFor(name);
    if (!existing) add(name);
    else if (added.includes(existing.id)) remove(existing.id);
  };

  const finishNew = () => {
    setQ('');
    setAsking(null);
    inputRef.current?.focus();
  };
  const keepAsTyped = () => {
    const name = tidyDishName(q);
    if (!name) return;
    if (!entryFor(name)) add(name);
    addCustomDish({ name, category: 'Others' });
    finishNew();
  };
  const acceptSuggestion = (d: Dish) => {
    rememberSpelling(q, d.name);
    if (!entryFor(d.name)) add(d.name);
    finishNew();
  };

  const trimmed = q.trim();
  const results = trimmed ? searchDishes(trimmed, all, 8) : [];
  const exact = trimmed ? all.some((d) => norm(d.name) === norm(trimmed)) || !!entryFor(trimmed) : false;
  const suggestion = trimmed && !exact ? suggestSpelling(trimmed, all) : null;

  const groups = likelyCategories(session.name).map((c) => ({
    category: c,
    dishes: DISH_LIBRARY.filter((d) => d.category === c && !entryFor(d.name)).slice(0, 12),
  }));
  const saved = customDishes.filter((d) => !entryFor(d.name));

  const chipClass = 'min-h-[44px] rounded-full border border-paper-strong bg-white px-4 text-[15px] font-medium text-ink hover:bg-brand-tint';

  return (
    <div className="flex min-h-[calc(100dvh-var(--event-header-h,61px)-80px-env(safe-area-inset-bottom))] flex-col md:min-h-[calc(100dvh-var(--event-header-h,61px)-24px)]">
      <div className="sticky top-[var(--event-header-h,61px)] z-20 border-b border-paper-line bg-white">
        <div className="flex items-center gap-1 px-2 py-2">
          <div className="min-w-0 flex-1 pl-2">
            <h1 className="font-display text-lg font-semibold leading-tight">Add dish</h1>
            <p className="truncate text-sm text-ink-muted">to {session.name}</p>
          </div>
          <Link to={editorUrl} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink hover:bg-paper-sunk">
            <IconClose />
          </Link>
        </div>
        <div className="px-4 pb-3">
          <label htmlFor="dish-search" className="sr-only-text">
            Search dishes
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              id="dish-search"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setAsking(null);
              }}
              placeholder="Search dishes, for example: sambar"
              className="block min-h-[52px] w-full rounded-2xl border border-paper-strong bg-white pl-11 pr-4 text-base placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <IconSearch size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4 pt-4">
        {trimmed ? (
          <>
            {results.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {results.map((d) => {
                  const existing = entryFor(d.name);
                  const addedNow = !!existing && added.includes(existing.id);
                  const already = !!existing && !addedNow;
                  return (
                    <li key={d.name}>
                      <button
                        type="button"
                        aria-label={d.name}
                        aria-pressed={addedNow}
                        aria-disabled={already || undefined}
                        onClick={() => !already && toggle(d.name)}
                        className={clsx(
                          'flex min-h-[56px] w-full items-center gap-3 rounded-2xl border px-4 py-2 text-left',
                          addedNow ? 'border-brand bg-brand-tint' : 'border-paper-line bg-white hover:bg-paper-sunk',
                          already && 'cursor-default opacity-80',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold">{d.name}</span>
                          <span className="block text-sm text-ink-muted">{already ? 'Already added' : d.category}</span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={clsx(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                            addedNow || already ? 'bg-brand text-white' : 'border-2 border-brand text-brand',
                          )}
                        >
                          {addedNow || already ? <IconCheck size={18} /> : <IconPlus size={18} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {!exact && (
              <div className="rounded-2xl border border-dashed border-paper-strong bg-white p-4">
                {asking ? (
                  <div role="group" aria-label="Spelling check" className="flex flex-col gap-3">
                    <p className="text-base font-semibold">Did you mean {asking.name}?</p>
                    <Button block onClick={() => acceptSuggestion(asking)}>
                      Yes, {asking.name}
                    </Button>
                    <Button variant="secondary" block onClick={keepAsTyped}>
                      Keep as typed
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    block
                    icon={<IconPlus size={18} />}
                    className="h-auto py-3"
                    onClick={() => (suggestion ? setAsking(suggestion) : keepAsTyped())}
                  >
                    Save “{trimmed}” as a new dish
                  </Button>
                )}
                {hasNonEnglish(trimmed) && (
                  <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm font-medium text-warn">
                    <IconWarning size={16} className="mt-0.5 shrink-0" />
                    {NON_ENGLISH_WARNING}
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {addedHere.length > 0 && (
              <section aria-labelledby="added-h">
                <h2 id="added-h" className="mb-2 font-display text-base font-semibold">
                  Added now
                </h2>
                <div className="flex flex-wrap gap-2">
                  {addedHere.map((id) => {
                    const en = session.entries.find((e) => e.id === id)!;
                    return (
                      <button key={id} type="button" aria-label={`Remove ${en.text}`} onClick={() => remove(id)} className={clsx(chipClass, 'border-brand bg-brand-tint')}>
                        ✓ {en.text}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {saved.length > 0 && (
              <section aria-labelledby="saved-h">
                <h2 id="saved-h" className="mb-2 font-display text-base font-semibold">
                  Your saved dishes
                </h2>
                <div className="flex flex-wrap gap-2">
                  {saved.map((d) => (
                    <button key={d.name} type="button" onClick={() => add(d.name)} className={chipClass}>
                      {d.name}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {groups.map((g) =>
              g.dishes.length === 0 ? null : (
                <section key={g.category} aria-label={`Common in ${g.category}`}>
                  <h2 className="mb-2 font-display text-base font-semibold">Common: {g.category}</h2>
                  <div className="flex flex-wrap gap-2">
                    {g.dishes.map((d) => (
                      <button key={d.name} type="button" onClick={() => add(d.name)} className={chipClass}>
                        {d.name}
                      </button>
                    ))}
                  </div>
                </section>
              ),
            )}
            <p className="text-[15px] text-ink-muted">Type a dish name above. If it is not in the list, you can save it as a new dish.</p>
          </>
        )}
      </div>

      <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 mt-auto border-t border-paper-line bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] md:bottom-0">
        <ButtonLink to={editorUrl} size="lg" block>
          {addedHere.length > 0 ? `Done · ${addedHere.length} added` : 'Done'}
        </ButtonLink>
      </div>
    </div>
  );
}
