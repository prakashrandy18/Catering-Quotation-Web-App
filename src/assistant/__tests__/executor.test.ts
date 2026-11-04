import { beforeEach, describe, expect, it } from 'vitest';
import { DISH_LIBRARY } from '@/data/dishLibrary';
import { findEntryIndex, ProposalSchema, type Op } from '../ops';
import { simulate } from '../preview';
import { findSuggestion, resolveDishName, type NameContext } from '../spelling';
import { buildEventSnapshot } from '../context';
import { TOOLS } from '../tools';
import { buildRequest } from '../client';
import { meal, resetStore } from './helpers';

const names = (over: Partial<NameContext> = {}): NameContext => ({ library: DISH_LIBRARY, memory: {}, choices: {}, ...over });

describe('executor: resolving and validating operations', () => {
  let event = resetStore();
  beforeEach(() => {
    event = resetStore();
  });

  it('finds "vada curry" in Muhurtham Morning Tiffin (case-insensitive) and close spellings', () => {
    const tiffin = meal(event, 'Muhurtham Morning Tiffin');
    const exact = findEntryIndex(tiffin, 'vada curry');
    expect('index' in exact && tiffin.entries[exact.index].text).toBe('Vada Curry');
    const fuzzy = findEntryIndex(tiffin, 'vadai curry');
    expect('index' in fuzzy && tiffin.entries[fuzzy.index].text).toBe('Vada Curry');
  });

  it('rejects unknown session ids with a helpful error listing the meals', () => {
    const r = simulate(event, [{ op: 'remove_dishes', session_id: 'se_nope', dishes: ['Vada Curry'] }], names());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toContain('Unknown session_id "se_nope"');
    expect(r.errors[0]).toContain(meal(event, 'Viratha Tiffin').id);
    expect(r.errors[0]).toContain('"Viratha Tiffin" (Day 1)');
  });

  it('explains a missing dish by listing what the meal has', () => {
    const vt = meal(event, 'Viratha Tiffin');
    const r = simulate(event, [{ op: 'remove_dishes', session_id: vt.id, dishes: ['Vada Curry'] }], names());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/No dish like "Vada Curry" in "Viratha Tiffin".*Medhu Vadai/);
  });

  it('refuses to add a dish that is already in the meal', () => {
    const vt = meal(event, 'Viratha Tiffin');
    const r = simulate(event, [{ op: 'add_dishes', session_id: vt.id, dishes: [{ name: 'Poori Masala Kilangu' }] }], names());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('already in "Viratha Tiffin"');
  });

  it('simulates [remove Vada Curry, add Poori Masala Kilangu] without touching the event', () => {
    const tiffin = meal(event, 'Muhurtham Morning Tiffin');
    const ops: Op[] = [
      { op: 'remove_dishes', session_id: tiffin.id, dishes: ['vada curry'] },
      { op: 'add_dishes', session_id: tiffin.id, dishes: [{ name: 'Poori Masala Kilangu' }] },
    ];
    const snapshot = JSON.stringify(event);
    const r = simulate(event, ops, names());
    expect(JSON.stringify(event)).toBe(snapshot);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.sections).toHaveLength(1);
    const s = r.preview.sections[0];
    expect(s.title).toBe('Day 2 · Muhurtham Morning Tiffin · 300 people');
    expect(s.removed).toEqual(['Vada Curry']);
    expect(s.added).toEqual(['Poori Masala Kilangu']);
    expect(r.preview.totalLine).toBe('Total unchanged · ₹85,000');
    expect(r.preview.summary).toBe('Muhurtham Morning Tiffin updated');
    expect(r.spelling).toEqual([]);
  });

  it('set_people 120 + set_rate 260 on Brunch: numbers and total before → after', () => {
    const brunch = meal(event, 'Brunch');
    const r = simulate(
      event,
      [
        { op: 'set_people', session_id: brunch.id, people: 120 },
        { op: 'set_rate', session_id: brunch.id, rate: 260 },
      ],
      names(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.totalLine).toBe('Total ₹85,000 → ₹91,200');
    const s = r.preview.sections[0];
    expect(s.title).toBe('Day 3 · Brunch · 120 people');
    expect(s.changes).toContain('People 100 → 120');
    expect(s.changes).toContain('Price ₹250 → ₹260');
    expect(s.changes).toContain('Meal total ₹25,000 → ₹31,200');
  });

  it('add_meal on a day, with position, time and a spelling question', () => {
    const day2 = event.days[1];
    const lunch = meal(event, 'Muhurtham Lunch');
    const r = simulate(
      event,
      [
        {
          op: 'add_meal',
          day_id: day2.id,
          after_session_id: lunch.id,
          name: 'Evening Snacks',
          icon: '☕',
          time: '15:30',
          people: 200,
          rate: 100,
          dishes: [{ name: 'Mini Bahadur Shah' }, { name: 'Mixture' }],
        },
      ],
      names(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.preview.sections[0];
    expect(s.kind).toBe('new-meal');
    expect(s.newMeal?.priceLine).toBe('200 people × ₹100 = ₹20,000');
    expect(s.newMeal?.dateLine).toBe('25-02-2027 · 3:30 PM');
    expect(s.newMeal?.dishes).toEqual(['Mini Badusha', 'Mixture']);
    expect(r.spelling).toEqual([{ key: 'mini bahadur shah', typed: 'Mini Bahadur Shah', suggestion: 'Mini Badusha' }]);
    expect(r.preview.totalLine).toBe('Total ₹85,000 → ₹1,05,000');
    expect(r.preview.isNewMeal).toBe(true);
    const day = r.after.days[1];
    expect(day.sessions.map((x) => x.name).indexOf('Evening Snacks')).toBe(day.sessions.findIndex((x) => x.id === lunch.id) + 1);
  });

  it('validates the tool input shape with zod', () => {
    const bad = ProposalSchema.safeParse({ summary: 'x', operations: [{ op: 'set_people', session_id: 's', people: 'lots' }] });
    expect(bad.success).toBe(false);
  });
});

describe('spelling', () => {
  it('"Mini Bahadur Shah" → "Mini Badusha"', () => {
    expect(findSuggestion('Mini Bahadur Shah', DISH_LIBRARY)).toBe('Mini Badusha');
    const r = resolveDishName('Mini Bahadur Shah', null, names());
    expect(r.final).toBe('Mini Badusha');
    expect(r.question).toEqual({ key: 'mini bahadur shah', typed: 'Mini Bahadur Shah', suggestion: 'Mini Badusha' });
  });

  it('honours "Keep as typed", remembered choices and heard_as', () => {
    expect(resolveDishName('Mini Bahadur Shah', null, names({ choices: { 'mini bahadur shah': 'typed' } })).final).toBe('Mini Bahadur Shah');
    expect(resolveDishName('mini bahadur shah', null, names({ memory: { 'mini bahadur shah': 'Mini Badusha' } }))).toEqual({ final: 'Mini Badusha' });
    const heard = resolveDishName('Mini Badusha', 'Mini Bahadur Shah', names());
    expect(heard.final).toBe('Mini Badusha');
    expect(heard.question?.typed).toBe('Mini Bahadur Shah');
    expect(resolveDishName('Poori Masala Kilangu', null, names())).toEqual({ final: 'Poori Masala Kilangu' });
  });
});

describe('context, prompt and request', () => {
  it('snapshot lists ids, meals and lines in order', () => {
    const event = resetStore();
    const snap = buildEventSnapshot(event);
    const brunch = meal(event, 'Brunch');
    expect(snap).toContain(`MEAL ${brunch.id} 🍲 "Brunch" | 10:00 | 100 people | ₹250 per plate = ₹25,000`);
    expect(snap).toContain('Ice Cream (Kulfi); [blank space]; Omam Water');
    expect(snap).toContain('[heading: Live Stall]');
    expect(snap).toContain(`DAY ${event.days[0].id} 24-02-2027 "Viratham & Reception" (Day 1)`);
  });

  it('builds a cached, tool-using request with low effort and auto tool choice', () => {
    const req = buildRequest('claude-sonnet-5-5', [{ role: 'user', content: 'hi' }]);
    expect(req.model).toBe('claude-sonnet-5-5');
    expect(req.max_tokens).toBe(4096);
    expect(req.tool_choice).toEqual({ type: 'auto' });
    expect(req.output_config).toEqual({ effort: 'low' });
    expect(req.thinking).toBeUndefined();
    expect(Array.isArray(req.system) && req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.tools?.map((t) => ('name' in t ? t.name : ''))).toEqual(['propose_changes', 'ask_choice']);
    expect(JSON.stringify(TOOLS)).not.toContain('$schema');
    expect(buildRequest('claude-haiku-5-5', []).fallbacks).toBeUndefined();
  });
});
