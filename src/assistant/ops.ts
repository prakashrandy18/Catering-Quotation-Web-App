/**
 * The typed operations Claude can propose, their validation, and ONE function (`applyOps`)
 * that applies them to an immer draft. The same function is used for the preview
 * (simulation on a copy) and for the real change (inside `transact`), so what he sees
 * is exactly what happens.
 */
import { z } from 'zod';
import type { Draft } from 'immer';
import type { CateringEvent, Day, MenuEntry, Session } from '@/types';
import { newId } from '@/lib/id';
import { parseDate, parseTime } from '@/lib/format';
import { similarity } from '@/lib/search';
import { resolveDishName, type NameContext, type SpellingQuestion } from './spelling';

/* ------------------------------------------------------------------ */
/* Schemas (also turned into the tool's JSON schema)                    */
/* ------------------------------------------------------------------ */

const sessionId = z.string().min(1).describe('Meal id from the latest <event> snapshot, e.g. "se_1a2b3c4d5e6f".');
const dishRef = z.string().min(1).max(120);
const newDish = z.object({
  name: z.string().min(1).max(80).describe('Dish name in English letters, Title Case. Use the exact library spelling when it is a library dish.'),
  heard_as: z
    .string()
    .max(80)
    .nullable()
    .optional()
    .describe('Only when the user said/typed something different that you mapped to `name` (e.g. "Mini Bahadur Shah" for "Mini Badusha").'),
});
const afterDish = z.string().max(120).nullable().optional().describe('Put it right after this dish / heading in the meal. Omit for the end.');
const atTop = z.boolean().nullable().optional().describe('true = put it at the very top of the meal.');
const money = z.number().int().min(0).max(10_000_000);
const people = z.union([z.number().int().min(1).max(100_000), z.literal('unlimited')]);

export const OpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add_dishes'), session_id: sessionId, dishes: z.array(newDish).min(1).max(40), after_dish: afterDish, at_top: atTop }).describe('Add dishes to a meal.'),
  z.object({ op: z.literal('remove_dishes'), session_id: sessionId, dishes: z.array(dishRef).min(1).max(40).describe('Dish names as in the snapshot. Use "[blank space]" or "[heading: X]" for those lines.') }).describe('Remove dishes from a meal.'),
  z.object({ op: z.literal('replace_dish'), session_id: sessionId, old_dish: dishRef, new_dish: z.string().min(1).max(80), heard_as: newDish.shape.heard_as }).describe('Replace one dish with another in the same place ("X ku pathila Y").'),
  z.object({ op: z.literal('rename_dish'), session_id: sessionId, dish: dishRef, new_name: z.string().min(1).max(80), heard_as: newDish.shape.heard_as }).describe('Fix the spelling / wording of a dish, same place.'),
  z.object({ op: z.literal('move_dish'), session_id: sessionId, dish: dishRef, after_dish: afterDish, at_top: atTop }).describe('Move a dish inside its meal.'),
  z.object({ op: z.literal('add_blank_space'), session_id: sessionId, after_dish: afterDish, at_top: atTop }).describe('Add a blank space (divider) line.'),
  z.object({ op: z.literal('add_heading'), session_id: sessionId, text: z.string().min(1).max(60), after_dish: afterDish, at_top: atTop }).describe('Add a small heading inside a meal, e.g. "Live Stall".'),
  z.object({ op: z.literal('set_people'), session_id: sessionId, people }).describe('Number of people (leaves) for a meal, or "unlimited".'),
  z.object({ op: z.literal('set_rate'), session_id: sessionId, rate: money.nullable().describe('Rupees per plate (leaf). null = clear the price.') }).describe('Set the price per plate (leaf).'),
  z
    .object({
      op: z.literal('set_pricing'),
      session_id: sessionId,
      mode: z.enum(['per_plate', 'fixed', 'excluded']).describe('per_plate = people × rate; fixed = one amount for the meal; excluded = not in the total.'),
      amount: money.nullable().optional().describe('Rate per plate (per_plate) or the fixed amount (fixed).'),
    })
    .describe('Change how a meal is priced.'),
  z.object({ op: z.literal('rename_meal'), session_id: sessionId, name: z.string().min(1).max(60) }).describe('Rename a meal.'),
  z.object({ op: z.literal('set_meal_time'), session_id: sessionId, time: z.string().max(5).nullable().describe('24h "HH:MM", or null for no fixed time.') }).describe('Set the meal time.'),
  z.object({ op: z.literal('set_meal_icon'), session_id: sessionId, icon: z.string().min(1).max(8) }).describe('Set the meal emoji.'),
  z
    .object({
      op: z.literal('add_meal'),
      day_id: z.string().min(1).describe('Day id from the snapshot, or the date "DD-MM-YYYY" of a day (also of a day added earlier in this same proposal).'),
      after_session_id: z.string().nullable().optional().describe('Put the new meal after this meal of the same day. Omit for the end of the day.'),
      at_top: atTop,
      name: z.string().min(1).max(60),
      icon: z.string().max(8).nullable().optional(),
      time: z.string().max(5).nullable().optional().describe('24h "HH:MM" or null.'),
      people: people.nullable().optional(),
      rate: money.nullable().optional().describe('Rupees per plate (leaf); null when not given.'),
      dishes: z.array(newDish).max(60),
    })
    .describe('Add a new meal to a day.'),
  z.object({ op: z.literal('remove_meal'), session_id: sessionId }).describe('Remove a whole meal.'),
  z
    .object({
      op: z.literal('move_meal'),
      session_id: sessionId,
      to_day_id: z.string().nullable().optional().describe('Day id (or "DD-MM-YYYY"). Omit to stay on the same day.'),
      after_session_id: z.string().nullable().optional(),
      at_top: atTop,
    })
    .describe('Move a meal to another position or day.'),
  z
    .object({
      op: z.literal('update_event_details'),
      name: z.string().max(80).nullable().optional(),
      client_name: z.string().max(80).nullable().optional(),
      client_phone: z.string().max(30).nullable().optional(),
      location: z.string().max(80).nullable().optional(),
      notes: z.string().max(1000).nullable().optional(),
    })
    .describe('Change event name, client name/phone, location or notes. Only send fields that change.'),
  z.object({ op: z.literal('add_day'), date: z.string().describe('"DD-MM-YYYY"'), title: z.string().max(60) }).describe('Add a day to the event.'),
  z
    .object({ op: z.literal('update_day'), day_id: z.string().min(1), date: z.string().nullable().optional(), title: z.string().max(60).nullable().optional() })
    .describe("Change a day's date or title."),
]);

export type Op = z.infer<typeof OpSchema>;

export const ProposalSchema = z.object({
  summary: z.string().max(200).describe('One short plain-English line saying what changes, e.g. "Swap Vada Curry for Poori Masala Kilangu".'),
  operations: z.array(OpSchema).min(1).max(30),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const ChoiceSchema = z.object({
  question: z.string().min(1).max(200).describe('Short question, e.g. "Which lunch?"'),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(80).describe('Button text, e.g. "Day 1 · Viratha Lunch"'),
        value: z.string().min(1).max(200).describe('What this choice means, e.g. the meal id'),
      }),
    )
    .min(2)
    .max(6),
});
export type Choice = z.infer<typeof ChoiceSchema>;

/** Readable zod issues for an is_error tool_result. */
export function formatZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 8)
    .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
    .join('; ');
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

type D = Draft<CateringEvent>;
type S = Draft<Session>;

const lc = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function entryLabel(e: Pick<MenuEntry, 'kind' | 'text'>): string {
  return e.kind === 'dish' ? e.text : e.kind === 'gap' ? '[blank space]' : `[heading: ${e.text}]`;
}

function dishList(s: S | Session): string {
  return s.entries.map(entryLabel).join('; ') || '(no dishes)';
}

function findMeal(d: D, id: string): { day: Draft<Day>; dayIndex: number; session: S; index: number } | null {
  for (let di = 0; di < d.days.length; di++) {
    const i = d.days[di].sessions.findIndex((s) => s.id === id);
    if (i >= 0) return { day: d.days[di], dayIndex: di, session: d.days[di].sessions[i], index: i };
  }
  return null;
}

function mealList(d: D): string {
  return d.days
    .flatMap((day, di) => day.sessions.map((s) => `${s.id} "${s.name}" (Day ${di + 1})`))
    .join(', ');
}

function findDay(d: D, idOrDate: string): Draft<Day> | null {
  const v = idOrDate.trim();
  return d.days.find((x) => x.id === v) ?? d.days.find((x) => x.date === v) ?? null;
}

function dayList(d: D): string {
  return d.days.map((x, i) => `${x.id} ${x.date} "${x.title}" (Day ${i + 1})`).join(', ');
}

/** Find a line in a meal by name: exact (case-insensitive) first, then a close spelling. */
export function findEntryIndex(s: S | Session, ref: string): { index: number } | { error: string } {
  const raw = ref.trim();
  const k = lc(raw);
  const gap = /^\[?\s*blank\s*space\s*\]?$/i.test(raw) || /^\[?\s*gap\s*\]?$/i.test(raw);
  if (gap) {
    const i = s.entries.findIndex((e) => e.kind === 'gap');
    return i >= 0 ? { index: i } : { error: `There is no blank space in "${s.name}".` };
  }
  const headingMatch = /^\[\s*heading:\s*(.+?)\s*\]$/i.exec(raw);
  if (headingMatch) {
    const hk = lc(headingMatch[1]);
    const i = s.entries.findIndex((e) => e.kind === 'heading' && lc(e.text) === hk);
    if (i >= 0) return { index: i };
  }
  const exact = s.entries.findIndex((e) => e.kind !== 'gap' && lc(e.text) === k);
  if (exact >= 0) return { index: exact };

  const scored = s.entries
    .map((e, index) => ({ index, e, score: e.kind === 'dish' ? similarity(raw, e.text) : 0 }))
    .filter((x) => x.score >= 0.75)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { error: `No dish like "${raw}" in "${s.name}" (${s.id}). Its dishes are: ${dishList(s)}.` };
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.05 && lc(scored[0].e.text) !== lc(scored[1].e.text)) {
    return {
      error: `"${raw}" could mean "${scored[0].e.text}" or "${scored[1].e.text}" in "${s.name}". Use the exact name, or ask the user with ask_choice.`,
    };
  }
  return { index: scored[0].index };
}

function insertAt(s: S, afterRef: string | null | undefined, top: boolean | null | undefined): { index: number } | { error: string } {
  if (top) return { index: 0 };
  if (afterRef && afterRef.trim()) {
    const f = findEntryIndex(s, afterRef);
    return 'error' in f ? f : { index: f.index + 1 };
  }
  return { index: s.entries.length };
}

function hasDish(s: S, name: string): boolean {
  const k = lc(name);
  return s.entries.some((e) => e.kind === 'dish' && lc(e.text) === k);
}

function normTime(t: string | null | undefined): { ok: true; value: string | null } | { ok: false } {
  if (t == null || t.trim() === '') return { ok: true, value: null };
  const p = parseTime(t);
  if (!p) return { ok: false };
  return { ok: true, value: `${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}` };
}

function validDate(s: string): boolean {
  const p = parseDate(s);
  return !!p && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= 31 && /^\d{2}-\d{2}-\d{4}$/.test(s.trim());
}

function dateKey(s: string): number {
  const p = parseDate(s);
  return p ? p.y * 10000 + p.m * 100 + p.d : 0;
}

/* ------------------------------------------------------------------ */
/* Apply                                                                */
/* ------------------------------------------------------------------ */

export interface ApplyResult {
  errors: string[];
  /** "Did you mean …?" questions for dishes being added */
  spelling: SpellingQuestion[];
  /** names of dishes added that are not in the library (after spelling choices) */
  newNames: string[];
}

/**
 * Applies the operations to an immer draft, in order. Never throws for bad input:
 * every problem is returned as a precise message (for an is_error tool_result).
 * When `errors` is non-empty the draft must be discarded.
 */
export function applyOps(d: D, ops: Op[], names: NameContext): ApplyResult {
  const errors: string[] = [];
  const spelling: SpellingQuestion[] = [];
  const newNames: string[] = [];

  const nameFor = (name: string, heardAs?: string | null) => {
    const r = resolveDishName(name, heardAs, names);
    if (r.question && !spelling.some((q) => q.key === r.question!.key)) spelling.push(r.question);
    if (!names.library.some((x) => x.name.toLowerCase() === r.final.toLowerCase())) newNames.push(r.final);
    return r.final;
  };

  ops.forEach((op, i) => {
    const fail = (msg: string) => errors.push(`operations[${i}] ${op.op}: ${msg}`);
    const meal = (id: string) => {
      const f = findMeal(d, id);
      if (!f) fail(`Unknown session_id "${id}". Use a meal id from the latest <event> snapshot. Meals: ${mealList(d)}.`);
      return f;
    };

    switch (op.op) {
      case 'add_dishes': {
        const f = meal(op.session_id);
        if (!f) return;
        const at = insertAt(f.session, op.after_dish, op.at_top);
        if ('error' in at) return fail(at.error);
        let idx = at.index;
        for (const item of op.dishes) {
          const name = nameFor(item.name, item.heard_as);
          if (hasDish(f.session, name)) {
            fail(`"${name}" is already in "${f.session.name}".`);
            continue;
          }
          f.session.entries.splice(idx++, 0, { id: newId('en'), kind: 'dish', text: name });
        }
        return;
      }
      case 'remove_dishes': {
        const f = meal(op.session_id);
        if (!f) return;
        for (const ref of op.dishes) {
          const found = findEntryIndex(f.session, ref);
          if ('error' in found) fail(found.error);
          else f.session.entries.splice(found.index, 1);
        }
        return;
      }
      case 'replace_dish':
      case 'rename_dish': {
        const f = meal(op.session_id);
        if (!f) return;
        const ref = op.op === 'replace_dish' ? op.old_dish : op.dish;
        const found = findEntryIndex(f.session, ref);
        if ('error' in found) return fail(found.error);
        const entry = f.session.entries[found.index];
        if (entry.kind !== 'dish') {
          if (op.op === 'rename_dish' && entry.kind === 'heading') {
            entry.text = op.new_name.trim();
            return;
          }
          return fail(`"${ref}" is not a dish.`);
        }
        const name = nameFor(op.op === 'replace_dish' ? op.new_dish : op.new_name, op.heard_as);
        if (lc(name) !== lc(entry.text) && hasDish(f.session, name)) return fail(`"${name}" is already in "${f.session.name}".`);
        if (lc(name) === lc(entry.text) && name === entry.text) return fail(`"${entry.text}" already has that name.`);
        entry.text = name;
        return;
      }
      case 'move_dish': {
        const f = meal(op.session_id);
        if (!f) return;
        const found = findEntryIndex(f.session, op.dish);
        if ('error' in found) return fail(found.error);
        const [item] = f.session.entries.splice(found.index, 1);
        const at = insertAt(f.session, op.after_dish, op.at_top);
        if ('error' in at) {
          f.session.entries.splice(found.index, 0, item);
          return fail(at.error);
        }
        f.session.entries.splice(at.index, 0, item);
        return;
      }
      case 'add_blank_space':
      case 'add_heading': {
        const f = meal(op.session_id);
        if (!f) return;
        const at = insertAt(f.session, op.after_dish, op.at_top);
        if ('error' in at) return fail(at.error);
        const item: MenuEntry =
          op.op === 'add_heading' ? { id: newId('en'), kind: 'heading', text: op.text.trim() } : { id: newId('en'), kind: 'gap', text: '' };
        f.session.entries.splice(at.index, 0, item);
        return;
      }
      case 'set_people': {
        const f = meal(op.session_id);
        if (!f) return;
        f.session.people = op.people === 'unlimited' ? null : op.people;
        return;
      }
      case 'set_rate': {
        const f = meal(op.session_id);
        if (!f) return;
        f.session.pricing = { mode: 'perLeaf', rate: op.rate };
        return;
      }
      case 'set_pricing': {
        const f = meal(op.session_id);
        if (!f) return;
        const amount = op.amount ?? null;
        f.session.pricing =
          op.mode === 'per_plate' ? { mode: 'perLeaf', rate: amount } : op.mode === 'fixed' ? { mode: 'fixed', amount } : { mode: 'excluded' };
        return;
      }
      case 'rename_meal': {
        const f = meal(op.session_id);
        if (!f) return;
        f.session.name = op.name.trim();
        return;
      }
      case 'set_meal_time': {
        const f = meal(op.session_id);
        if (!f) return;
        const t = normTime(op.time);
        if (!t.ok) return fail(`Time "${op.time}" is not 24h "HH:MM" (e.g. "15:30").`);
        f.session.time = t.value;
        return;
      }
      case 'set_meal_icon': {
        const f = meal(op.session_id);
        if (!f) return;
        f.session.icon = op.icon.trim();
        return;
      }
      case 'add_meal': {
        const day = findDay(d, op.day_id);
        if (!day) return fail(`Unknown day_id "${op.day_id}". Days: ${dayList(d)}. To add to a new day, put an add_day operation first and use its date.`);
        const t = normTime(op.time);
        if (!t.ok) return fail(`Time "${op.time}" is not 24h "HH:MM" (e.g. "15:30").`);
        let index = day.sessions.length;
        if (op.at_top) index = 0;
        else if (op.after_session_id) {
          const j = day.sessions.findIndex((s) => s.id === op.after_session_id);
          if (j < 0) return fail(`after_session_id "${op.after_session_id}" is not a meal of day ${day.id}. Its meals: ${day.sessions.map((s) => `${s.id} "${s.name}"`).join(', ') || 'none'}.`);
          index = j + 1;
        }
        const entries: MenuEntry[] = [];
        for (const item of op.dishes) {
          const name = nameFor(item.name, item.heard_as);
          if (entries.some((e) => lc(e.text) === lc(name))) continue;
          entries.push({ id: newId('en'), kind: 'dish', text: name });
        }
        const session: Session = {
          id: newId('se'),
          name: op.name.trim(),
          icon: op.icon?.trim() || '🍽️',
          time: t.value,
          people: op.people === 'unlimited' ? null : (op.people ?? 100),
          pricing: { mode: 'perLeaf', rate: op.rate ?? null },
          entries,
        };
        day.sessions.splice(index, 0, session);
        return;
      }
      case 'remove_meal': {
        const f = meal(op.session_id);
        if (!f) return;
        f.day.sessions.splice(f.index, 1);
        return;
      }
      case 'move_meal': {
        const f = meal(op.session_id);
        if (!f) return;
        const target = op.to_day_id ? findDay(d, op.to_day_id) : f.day;
        if (!target) return fail(`Unknown to_day_id "${op.to_day_id}". Days: ${dayList(d)}.`);
        const [item] = f.day.sessions.splice(f.index, 1);
        let index = target.sessions.length;
        if (op.at_top) index = 0;
        else if (op.after_session_id) {
          const j = target.sessions.findIndex((s) => s.id === op.after_session_id);
          if (j < 0) {
            f.day.sessions.splice(f.index, 0, item);
            return fail(`after_session_id "${op.after_session_id}" is not a meal of day ${target.id}.`);
          }
          index = j + 1;
        }
        target.sessions.splice(index, 0, item);
        return;
      }
      case 'update_event_details': {
        if (op.name != null && op.name.trim()) d.name = op.name.trim();
        if (op.client_name != null) d.clientName = op.client_name.trim();
        if (op.client_phone != null) d.clientPhone = op.client_phone.trim();
        if (op.location != null) d.location = op.location.trim();
        if (op.notes != null) d.notes = op.notes.trim();
        return;
      }
      case 'add_day': {
        const date = op.date.trim();
        if (!validDate(date)) return fail(`Date "${op.date}" must be "DD-MM-YYYY".`);
        const existing = d.days.find((x) => x.date === date);
        if (existing) return fail(`Day ${date} already exists (${existing.id}).`);
        const day: Day = { id: newId('dy'), date, title: op.title.trim() || `Day ${d.days.length + 1}`, sessions: [] };
        const later = d.days.findIndex((x) => dateKey(x.date) > dateKey(date));
        if (later < 0) d.days.push(day);
        else d.days.splice(later, 0, day);
        return;
      }
      case 'update_day': {
        const day = findDay(d, op.day_id);
        if (!day) return fail(`Unknown day_id "${op.day_id}". Days: ${dayList(d)}.`);
        if (op.date != null) {
          if (!validDate(op.date)) return fail(`Date "${op.date}" must be "DD-MM-YYYY".`);
          day.date = op.date.trim();
        }
        if (op.title != null) day.title = op.title.trim();
        return;
      }
    }
  });

  return { errors, spelling, newNames };
}

/** True when the proposal creates a new meal (F04 buttons "Yes, add it"). */
export function addsMeal(ops: Op[]): boolean {
  return ops.some((o) => o.op === 'add_meal');
}
