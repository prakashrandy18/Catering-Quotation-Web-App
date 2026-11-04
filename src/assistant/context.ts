import type { CateringEvent, Pricing } from '@/types';
import { formatINR } from '@/lib/format';
import { grandTotal, sessionTotal } from '@/lib/calc';
import { entryLabel } from './ops';

function pricingText(p: Pricing, total: number | null): string {
  if (p.mode === 'excluded') return 'not in total';
  if (p.mode === 'fixed') return p.amount == null ? 'fixed price, amount missing' : `fixed ${formatINR(p.amount)}`;
  if (p.rate == null) return 'price per plate missing';
  return `${formatINR(p.rate)} per plate${total != null ? ` = ${formatINR(total)}` : ''}`;
}

const STATUS = { draft: 'Not sent', sent: 'Sent', confirmed: 'Confirmed' } as const;

/**
 * Compact text snapshot of one event, sent with every user turn. Ids are the real
 * store ids that tool operations must reference.
 */
export function buildEventSnapshot(e: CateringEvent): string {
  const lines: string[] = [];
  lines.push(
    `EVENT "${e.name}" | client ${e.clientName || '-'} | phone ${e.clientPhone || '-'} | location ${e.location || '-'} | ${STATUS[e.status]} | total ${formatINR(grandTotal(e))}`,
  );
  if (e.notes.trim()) lines.push(`NOTES ${e.notes.trim().replace(/\s+/g, ' ').slice(0, 300)}`);
  e.days.forEach((d, di) => {
    lines.push(`DAY ${d.id} ${d.date} "${d.title}" (Day ${di + 1})`);
    if (d.sessions.length === 0) lines.push('  (no meals yet)');
    d.sessions.forEach((s) => {
      const people = s.people == null ? 'unlimited people' : `${s.people} people`;
      lines.push(`  MEAL ${s.id} ${s.icon} "${s.name}" | ${s.time ?? 'no time'} | ${people} | ${pricingText(s.pricing, sessionTotal(s))}`);
      lines.push(`    dishes: ${s.entries.map(entryLabel).join('; ') || '(none)'}`);
    });
  });
  return lines.join('\n');
}
