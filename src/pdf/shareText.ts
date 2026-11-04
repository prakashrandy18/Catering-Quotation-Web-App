import type { CateringEvent, PdfVariant } from '@/types';
import { parseDate } from '@/lib/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "24–26 Feb", "30 Jan–1 Feb", "24 Feb" or "" */
export function compactDateRange(event: Pick<CateringEvent, 'days'>): string {
  const ps = event.days.map((d) => parseDate(d.date)).filter((p): p is NonNullable<typeof p> => !!p && p.m >= 1 && p.m <= 12);
  if (!ps.length) return '';
  const a = ps[0];
  const b = ps[ps.length - 1];
  if (ps.length === 1 || (a.d === b.d && a.m === b.m && a.y === b.y)) return `${a.d} ${MONTHS[a.m - 1]}`;
  if (a.m === b.m && a.y === b.y) return `${a.d}–${b.d} ${MONTHS[a.m - 1]}`;
  return `${a.d} ${MONTHS[a.m - 1]}–${b.d} ${MONTHS[b.m - 1]}`;
}

/** Message sent with the PDF. Names the audience so the right copy goes to the right person. */
export function shareMessage(event: CateringEvent, variant: PdfVariant): string {
  const name = event.name.trim() || 'Event';
  const dates = compactDateRange(event);
  const when = dates ? `, ${dates}` : '';
  if (variant === 'chef') {
    return `Hello Chef, ${name} menu${when}. Please fill your rate per leaf in the price sheet on the last page and send it back.`;
  }
  return `${name} quotation${when}. Please check.`;
}
