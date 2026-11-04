/**
 * Simulates a proposal on a copy of the event (immer `produce`) and describes the
 * difference in plain words for the preview card: where, Removed / Added, numbers
 * before → after, total before → after.
 */
import { produce } from 'immer';
import type { CateringEvent, MenuEntry, Pricing, Session } from '@/types';
import { formatClock, formatINR } from '@/lib/format';
import { grandTotal, sessionTotal } from '@/lib/calc';
import { findSession } from '@/store/useAppStore';
import { applyOps, type Op } from './ops';
import type { NameContext, SpellingQuestion } from './spelling';

export interface PreviewSection {
  kind: 'meal' | 'new-meal' | 'removed-meal' | 'day' | 'event';
  /** "Day 1 · Viratha Tiffin · 100 people" */
  title: string;
  dayId: string | null;
  sessionId: string | null;
  removed: string[];
  added: string[];
  /** "People 100 → 120", "Price ₹250 → ₹260", "Moved: Coffee" */
  changes: string[];
  /** New meal (F04): details shown on the card */
  newMeal?: { name: string; icon: string; dateLine: string; priceLine: string; dishes: string[] };
}

export interface PreviewData {
  sections: PreviewSection[];
  totalBefore: number;
  totalAfter: number;
  /** "Total unchanged · ₹85,000" or "Total ₹85,000 → ₹91,200" */
  totalLine: string;
  /** Day to open with "Show in menu" */
  dayId: string | null;
  /** History entry summary + detail */
  summary: string;
  detail: string;
  isNewMeal: boolean;
}

export type SimulateResult =
  | { ok: true; after: CateringEvent; preview: PreviewData; spelling: SpellingQuestion[]; newNames: string[] }
  | { ok: false; errors: string[]; spelling: SpellingQuestion[] };

export function simulate(event: CateringEvent, ops: Op[], names: NameContext): SimulateResult {
  let result: ReturnType<typeof applyOps> = { errors: [], spelling: [], newNames: [] };
  const after = produce(event, (d) => {
    result = applyOps(d, ops, names);
  });
  if (result.errors.length) return { ok: false, errors: result.errors, spelling: result.spelling };
  if (after === event) return { ok: false, errors: ['These operations change nothing. Check the snapshot and try again.'], spelling: result.spelling };
  return { ok: true, after, preview: describeChange(event, after), spelling: result.spelling, newNames: result.newNames };
}

/* ------------------------------------------------------------------ */

const peopleShort = (n: number | null) => (n == null ? 'Unlimited' : `${n} people`);

function priceText(p: Pricing): string {
  if (p.mode === 'perLeaf') return p.rate == null ? 'no price' : `${formatINR(p.rate)}`;
  if (p.mode === 'fixed') return p.amount == null ? 'fixed, no amount' : `${formatINR(p.amount)} fixed`;
  return 'not in total';
}

function label(e: Pick<MenuEntry, 'kind' | 'text'>): string {
  return e.kind === 'dish' ? e.text : e.kind === 'gap' ? 'Blank space' : `Heading “${e.text}”`;
}

/** Ids of `a` (in order) that are not part of the longest common subsequence with `b` = moved. */
function movedIds(a: string[], b: string[]): Set<string> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keep = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keep.add(a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return new Set(a.filter((id) => !keep.has(id)));
}

function sessionPriceLine(s: Session): string {
  const total = sessionTotal(s);
  if (s.pricing.mode === 'excluded') return 'Not in total';
  if (s.pricing.mode === 'fixed') return s.pricing.amount == null ? 'Price missing' : `Fixed ${formatINR(s.pricing.amount)}`;
  if (s.pricing.rate == null) return `${peopleShort(s.people)} · Price missing`;
  if (total == null) return `${peopleShort(s.people)} × ${formatINR(s.pricing.rate)}`;
  return `${s.people} people × ${formatINR(s.pricing.rate)} = ${formatINR(total)}`;
}

export function describeChange(before: CateringEvent, after: CateringEvent): PreviewData {
  const sections: PreviewSection[] = [];

  // Event details
  const ev: string[] = [];
  const field = (name: string, a: string, b: string) => {
    if (a !== b) ev.push(`${name}: ${a || '—'} → ${b || '—'}`);
  };
  field('Event name', before.name, after.name);
  field('Client', before.clientName, after.clientName);
  field('Client phone', before.clientPhone, after.clientPhone);
  field('Location', before.location, after.location);
  if (before.notes !== after.notes) ev.push('Notes changed');
  if (ev.length) sections.push({ kind: 'event', title: 'Event details', dayId: null, sessionId: null, removed: [], added: [], changes: ev });

  // Days
  after.days.forEach((day, di) => {
    const prev = before.days.find((x) => x.id === day.id);
    if (!prev) {
      sections.push({ kind: 'day', title: `New day: Day ${di + 1} · ${day.date}`, dayId: day.id, sessionId: null, removed: [], added: [], changes: day.title ? [day.title] : [] });
    } else if (prev.date !== day.date || prev.title !== day.title) {
      const ch: string[] = [];
      if (prev.date !== day.date) ch.push(`Date ${prev.date} → ${day.date}`);
      if (prev.title !== day.title) ch.push(`Title: ${prev.title || '—'} → ${day.title || '—'}`);
      sections.push({ kind: 'day', title: `Day ${di + 1}`, dayId: day.id, sessionId: null, removed: [], added: [], changes: ch });
    }
  });

  // Meals
  after.days.forEach((day, di) => {
    day.sessions.forEach((s, si) => {
      const prev = findSession(before, s.id);
      if (!prev) {
        const dishes = s.entries.filter((e) => e.kind === 'dish').map((e) => e.text);
        sections.push({
          kind: 'new-meal',
          title: `Day ${di + 1} · ${s.name} · ${peopleShort(s.people)}`,
          dayId: day.id,
          sessionId: s.id,
          removed: [],
          added: dishes,
          changes: [],
          newMeal: {
            name: s.name,
            icon: s.icon,
            dateLine: [day.date, formatClock(s.time)].filter(Boolean).join(' · '),
            priceLine: sessionPriceLine(s),
            dishes,
          },
        });
        return;
      }
      const p = prev.session;
      const removed: string[] = [];
      const added: string[] = [];
      const changes: string[] = [];
      const afterIds = new Set(s.entries.map((e) => e.id));
      const beforeById = new Map(p.entries.map((e) => [e.id, e]));
      for (const e of p.entries) if (!afterIds.has(e.id)) removed.push(label(e));
      for (const e of s.entries) {
        const old = beforeById.get(e.id);
        if (!old) added.push(label(e));
        else if (old.text !== e.text) {
          removed.push(label(old));
          added.push(label(e));
        }
      }
      const commonBefore = p.entries.filter((e) => afterIds.has(e.id)).map((e) => e.id);
      const commonAfter = s.entries.filter((e) => beforeById.has(e.id)).map((e) => e.id);
      const moved = movedIds(commonAfter, commonBefore);
      s.entries.filter((e) => moved.has(e.id)).forEach((e) => changes.push(`Moved: ${label(e)}`));

      if (p.name !== s.name) changes.push(`Name: ${p.name} → ${s.name}`);
      if (p.icon !== s.icon) changes.push(`Icon: ${p.icon} → ${s.icon}`);
      if (p.time !== s.time) changes.push(`Time ${formatClock(p.time) || 'none'} → ${formatClock(s.time) || 'none'}`);
      if (p.people !== s.people) changes.push(`People ${p.people ?? 'Unlimited'} → ${s.people ?? 'Unlimited'}`);
      if (JSON.stringify(p.pricing) !== JSON.stringify(s.pricing)) {
        if (p.pricing.mode === 'perLeaf' && s.pricing.mode === 'perLeaf') changes.push(`Price ${p.pricing.rate == null ? 'missing' : formatINR(p.pricing.rate)} → ${s.pricing.rate == null ? 'missing' : formatINR(s.pricing.rate)}`);
        else changes.push(`Price: ${priceText(p.pricing)} → ${priceText(s.pricing)}`);
      }
      const tb = sessionTotal(p);
      const ta = sessionTotal(s);
      if (tb !== ta) changes.push(`Meal total ${tb == null ? '—' : formatINR(tb)} → ${ta == null ? '—' : formatINR(ta)}`);
      if (prev.day.id !== day.id) changes.push(`Moved to Day ${di + 1}`);
      else if (prev.sessionIndex !== si) {
        const order = (ss: Session[]) => ss.map((x) => x.id).filter((id) => before.days[prev.dayIndex].sessions.some((y) => y.id === id) && day.sessions.some((y) => y.id === id));
        if (movedIds(order(day.sessions), order(before.days[prev.dayIndex].sessions)).has(s.id)) changes.push('Moved to a new place in the day');
      }

      if (removed.length || added.length || changes.length) {
        sections.push({ kind: 'meal', title: `Day ${di + 1} · ${s.name} · ${peopleShort(s.people)}`, dayId: day.id, sessionId: s.id, removed, added, changes });
      }
    });
  });

  // Removed meals
  before.days.forEach((day, di) => {
    day.sessions.forEach((s) => {
      if (findSession(after, s.id)) return;
      const n = s.entries.filter((e) => e.kind === 'dish').length;
      sections.push({
        kind: 'removed-meal',
        title: `Day ${di + 1} · ${s.name}`,
        dayId: after.days.some((x) => x.id === day.id) ? day.id : null,
        sessionId: null,
        removed: [`Whole meal “${s.name}” (${n} dish${n === 1 ? '' : 'es'})`],
        added: [],
        changes: [],
      });
    });
  });

  const totalBefore = grandTotal(before);
  const totalAfter = grandTotal(after);
  const totalLine = totalBefore === totalAfter ? `Total unchanged · ${formatINR(totalAfter)}` : `Total ${formatINR(totalBefore)} → ${formatINR(totalAfter)}`;

  const mealSections = sections.filter((x) => x.kind === 'meal' || x.kind === 'new-meal' || x.kind === 'removed-meal');
  let summary: string;
  if (sections.length === 1 && sections[0].kind === 'new-meal') summary = `Added meal ${sections[0].newMeal!.name}`;
  else if (sections.length === 1 && sections[0].kind === 'removed-meal') summary = `Removed meal ${sections[0].title.split(' · ')[1]}`;
  else if (mealSections.length === 1 && sections.length === 1) summary = `${sections[0].title.split(' · ')[1]} updated`;
  else if (sections.length === 1 && sections[0].kind === 'event') summary = 'Event details changed';
  else summary = `Menu updated (${sections.length} parts)`;

  const detailParts: string[] = [];
  for (const sec of sections) {
    const bits: string[] = [];
    if (sec.removed.length) bits.push(`Removed: ${sec.removed.join(', ')}`);
    if (sec.added.length) bits.push(`Added: ${sec.added.join(', ')}`);
    bits.push(...sec.changes);
    if (bits.length) detailParts.push(sections.length > 1 ? `${sec.title.split(' · ').slice(0, 2).join(' · ')}: ${bits.join('; ')}` : bits.join('; '));
  }

  return {
    sections,
    totalBefore,
    totalAfter,
    totalLine,
    dayId: sections.find((x) => x.dayId)?.dayId ?? null,
    summary,
    detail: detailParts.join(' | '),
    isNewMeal: sections.some((x) => x.kind === 'new-meal'),
  };
}
