import type { CateringEvent, Day, Session } from '@/types';

/** ₹6,00,000 style (Indian digit grouping). */
export function formatINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

/** "6,00,000" without the symbol. */
export function formatIndianNumber(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

/** "08:00" → { h: 8, m: 0 } or null if malformed. */
export function parseTime(time: string | null | undefined): { h: number; m: number } | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

/** "15:30" → "3:30 PM" */
export function formatClock(time: string | null | undefined): string {
  const t = parseTime(time);
  if (!t) return '';
  const suffix = t.h >= 12 ? 'PM' : 'AM';
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${h12}:${String(t.m).padStart(2, '0')} ${suffix}`;
}

/**
 * Part of day as printed in the sample PDF:
 * < 12:00 Morning · 12:00–14:59 Afternoon · 15:00–18:59 Evening · ≥ 19:00 Night
 */
export function partOfDay(time: string | null | undefined): '' | 'Morning' | 'Afternoon' | 'Evening' | 'Night' {
  const t = parseTime(time);
  if (!t) return '';
  if (t.h < 12) return 'Morning';
  if (t.h < 15) return 'Afternoon';
  if (t.h < 19) return 'Evening';
  return 'Night';
}

/** "Morning 8:00 AM" or "" when no time. */
export function timeLabel(time: string | null | undefined): string {
  const clock = formatClock(time);
  return clock ? `${partOfDay(time)} ${clock}` : '';
}

/** "100 People" or "Unlimited". */
export function peopleLabel(people: number | null): string {
  return people == null ? 'Unlimited' : `${people} People`;
}

/** Session meta exactly like the PDF header: "100 People • Morning 8:00 AM" / "Unlimited". */
export function sessionMetaLabel(s: Pick<Session, 'people' | 'time'>): string {
  const parts: string[] = [];
  parts.push(peopleLabel(s.people));
  const t = timeLabel(s.time);
  if (t) parts.push(t);
  // "Unlimited" alone when there is neither a count nor a time
  return parts.join(' • ');
}

/** "24-02-2027, 25-02-2027 & 26-02-2027" */
export function eventDatesLabel(event: Pick<CateringEvent, 'days'>): string {
  const dates = event.days.map((d) => d.date).filter(Boolean);
  if (dates.length <= 1) return dates[0] ?? '';
  return dates.slice(0, -1).join(', ') + ' & ' + dates[dates.length - 1];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "24-02-2027" → { d: 24, m: 2, y: 2027 } */
export function parseDate(date: string): { d: number; m: number; y: number } | null {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(date.trim());
  if (!m) return null;
  return { d: Number(m[1]), m: Number(m[2]), y: Number(m[3]) };
}

/** "24-02-2027" → "24 Feb" */
export function shortDate(date: string): string {
  const p = parseDate(date);
  if (!p || p.m < 1 || p.m > 12) return date;
  return `${p.d} ${MONTHS[p.m - 1]}`;
}

/** "24 – 26 Feb 2027" for the event card. */
export function dateRangeLabel(days: Day[]): string {
  const ps = days.map((d) => parseDate(d.date)).filter((p): p is NonNullable<typeof p> => !!p);
  if (ps.length === 0) return 'No dates yet';
  const a = ps[0];
  const b = ps[ps.length - 1];
  if (ps.length === 1 || (a.d === b.d && a.m === b.m && a.y === b.y)) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.m === b.m && a.y === b.y) return `${a.d} – ${b.d} ${MONTHS[a.m - 1]} ${a.y}`;
  return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

/** HTML date input value "2027-02-24" ↔ "24-02-2027" */
export function toIsoDate(date: string): string {
  const p = parseDate(date);
  if (!p) return '';
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
export function fromIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "Thara Wedding – Quotation.pdf" (filename-safe). */
export function pdfFileName(eventName: string, variant: 'client' | 'chef'): string {
  const safe = (eventName || 'Event').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${safe} – ${variant === 'client' ? 'Quotation' : 'Chef Price Request'}.pdf`;
}

/** "3 days ago", "today", "yesterday" */
export function relativeDays(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return 'never';
  const days = Math.floor((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
