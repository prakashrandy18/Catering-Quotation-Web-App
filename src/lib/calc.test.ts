import { buildSampleEvent } from '@/data/seed';
import { dayTotal, entryBlocks, grandTotal, missingPrices, sessionTotal, toColumns } from '@/lib/calc';
import { eventDatesLabel, formatINR, sessionMetaLabel, timeLabel } from '@/lib/format';
import { suggestSpelling, searchDishes } from '@/lib/search';
import { DISH_LIBRARY } from '@/data/dishLibrary';

describe('seed matches the sample PDF', () => {
  const e = buildSampleEvent();
  it('has 3 days and 11 meals', () => {
    expect(e.days.map((d) => d.date)).toEqual(['24-02-2027', '25-02-2027', '26-02-2027']);
    expect(e.days.flatMap((d) => d.sessions).length).toBe(11);
  });
  it('prints session meta like the PDF', () => {
    const tiffin = e.days[0].sessions[0];
    expect(sessionMetaLabel(tiffin)).toBe('100 People • Morning 8:00 AM');
    expect(sessionMetaLabel(e.days[0].sessions[3])).toBe('Unlimited');
    expect(timeLabel('15:30')).toBe('Evening 3:30 PM');
    expect(timeLabel('19:00')).toBe('Night 7:00 PM');
    expect(timeLabel('12:00')).toBe('Afternoon 12:00 PM');
  });
  it('event dates label', () => {
    expect(eventDatesLabel(e)).toBe('24-02-2027, 25-02-2027 & 26-02-2027');
  });
  it('known totals', () => {
    expect(sessionTotal(e.days[2].sessions[0])).toBe(25000);
    expect(dayTotal(e.days[2])).toBe(35000);
    expect(formatINR(600000)).toBe('₹6,00,000');
    expect(grandTotal(e)).toBe(20000 + 30000 + 25000 + 10000);
    expect(missingPrices(e).map((m) => m.sessionName)).toEqual([
      'Viratha Tiffin', 'Viratha Lunch', 'Evening Snacks', 'Reception Dinner', 'Muhurtham Morning Tiffin', 'Muhurtham Lunch',
    ]);
  });
  it('splits brunch into blocks at the blank space and dinner at Live Stall', () => {
    const brunch = entryBlocks(e.days[2].sessions[0]);
    expect(brunch).toHaveLength(2);
    expect(brunch[1]).toMatchObject({ gapBefore: true, dishes: ['Omam Water', 'Vethalai Rasikala Paakku'] });
    const dinner = entryBlocks(e.days[0].sessions[4]);
    expect(dinner[1]).toMatchObject({ heading: 'Live Stall', dishes: ['Fruit Salad', 'Ice Cream', 'Beeda'] });
  });
  it('column-major split like the sample (10 → 4,4,2)', () => {
    const cols = toColumns(e.days[0].sessions[0].entries.map((x) => x.text));
    expect(cols.map((c) => c.length)).toEqual([4, 4, 2]);
    expect(cols[2]).toEqual(['Idly Podi', 'Coffee']);
  });
});

describe('dish search', () => {
  it('suggests library spellings for Tanglish typos', () => {
    expect(suggestSpelling('Vadacurry', DISH_LIBRARY)?.name).toBe('Vada Curry');
    expect(suggestSpelling('valaipoo vadai', DISH_LIBRARY)?.name).toBe('Vazhaipoo Vadai');
    expect(suggestSpelling('Medhu Vadai', DISH_LIBRARY)).toBeNull();
  });
  it('autocompletes', () => {
    expect(searchDishes('vaz', DISH_LIBRARY)[0].name).toBe('Vazhaipoo Vadai');
    expect(searchDishes('sam', DISH_LIBRARY).map((d) => d.name)).toContain('Samosa');
  });
});
