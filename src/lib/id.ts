/** Short random id. Uses crypto when available. */
export function newId(prefix = ''): string {
  let raw: string;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) raw = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  else raw = Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${raw}` : raw;
}
