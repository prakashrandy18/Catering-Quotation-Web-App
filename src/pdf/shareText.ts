import type { BrandSettings, CateringEvent, PdfVariant } from '@/types';
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

export type ShareContact = Partial<Pick<BrandSettings, 'contactName' | 'businessName' | 'contactPhone'>>;

function signature(contact: ShareContact | undefined, parts: (keyof ShareContact)[]): string {
  return parts
    .map((k) => (contact?.[k] ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

/** Message sent with the PDF. Names the audience so the right copy goes to the right person. */
export function shareMessage(event: CateringEvent, variant: PdfVariant, contact?: ShareContact): string {
  const name = event.name.trim() || 'Event';
  const dates = compactDateRange(event);
  if (variant === 'chef') {
    const when = dates ? `, ${dates}` : '';
    const sign = signature(contact, ['contactName', 'contactPhone']);
    const body = `Hello Chef, ${name} menu${when}. Please fill your rate per leaf in the price sheet on the last page and send it back.`;
    return sign ? `${body} — ${sign}` : body;
  }
  const who = event.clientName.trim() || 'Sir/Madam';
  const sign = signature(contact, ['contactName', 'businessName', 'contactPhone']);
  const body = `Dear ${who}, please find the quotation for ${name}${dates ? ` (${dates})` : ''}.`;
  return sign ? `${body} — ${sign}` : body;
}
