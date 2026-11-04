import type { CateringEvent, Day, Session } from '@/types';

/** Session amount in rupees, or null when it cannot be computed / is excluded. */
export function sessionTotal(s: Session): number | null {
  switch (s.pricing.mode) {
    case 'perLeaf':
      if (s.pricing.rate == null || s.people == null) return null;
      return s.people * s.pricing.rate;
    case 'fixed':
      return s.pricing.amount;
    case 'excluded':
      return null;
  }
}

/** True when the session should have a price but does not. */
export function isPriceMissing(s: Session): boolean {
  if (s.pricing.mode === 'excluded') return false;
  if (s.pricing.mode === 'fixed') return s.pricing.amount == null;
  return s.pricing.rate == null || s.people == null;
}

export function dayTotal(d: Day): number {
  return d.sessions.reduce((sum, s) => sum + (sessionTotal(s) ?? 0), 0);
}

export function grandTotal(e: CateringEvent): number {
  return e.days.reduce((sum, d) => sum + dayTotal(d), 0);
}

export interface MissingPrice {
  dayId: string;
  sessionId: string;
  dayIndex: number;
  sessionName: string;
}

export function missingPrices(e: CateringEvent): MissingPrice[] {
  const out: MissingPrice[] = [];
  e.days.forEach((d, dayIndex) =>
    d.sessions.forEach((s) => {
      if (isPriceMissing(s)) out.push({ dayId: d.id, sessionId: s.id, dayIndex, sessionName: s.name });
    }),
  );
  return out;
}

/** Sessions excluded from the total, e.g. "Evening Beverages". */
export function excludedSessions(e: CateringEvent): Session[] {
  return e.days.flatMap((d) => d.sessions.filter((s) => s.pricing.mode === 'excluded'));
}

export function sessionCount(e: CateringEvent): number {
  return e.days.reduce((n, d) => n + d.sessions.length, 0);
}

export function dishCount(s: Session): number {
  return s.entries.filter((x) => x.kind === 'dish').length;
}

/**
 * Splits a session's entries into blocks separated by gap/heading entries.
 * Each block is rendered as its own 3-column list (PDF and UI).
 */
export interface EntryBlock {
  heading: string | null; // heading text if the block starts with a heading entry
  gapBefore: boolean; // true if a gap entry precedes this block
  dishes: string[];
}
export function entryBlocks(s: Session): EntryBlock[] {
  const blocks: EntryBlock[] = [];
  let cur: EntryBlock = { heading: null, gapBefore: false, dishes: [] };
  const flush = () => {
    if (cur.dishes.length || cur.heading) blocks.push(cur);
  };
  for (const e of s.entries) {
    if (e.kind === 'dish') cur.dishes.push(e.text);
    else if (e.kind === 'gap') {
      flush();
      cur = { heading: null, gapBefore: true, dishes: [] };
    } else {
      flush();
      cur = { heading: e.text, gapBefore: cur.gapBefore && cur.dishes.length === 0, dishes: [] };
    }
  }
  flush();
  return blocks;
}

/**
 * Column-major split used by the sample PDF (CSS column-count: 3):
 * 10 items → columns of 4, 4, 2.
 */
export function toColumns<T>(items: T[], columns = 3): T[][] {
  const perCol = Math.ceil(items.length / columns) || 0;
  const cols: T[][] = [];
  for (let c = 0; c < columns; c++) cols.push(items.slice(c * perCol, (c + 1) * perCol));
  return cols;
}
