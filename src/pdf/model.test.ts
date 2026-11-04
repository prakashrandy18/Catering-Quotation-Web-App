import { buildSampleEvent, DEFAULT_BRAND } from '@/data/seed';
import { buildChefModel, buildClientModel, emojiFile, joinNames, splitTitle } from './model';
import { compactDateRange, shareMessage } from './shareText';

describe('chef view model', () => {
  it('has no price data at all', () => {
    const e = buildSampleEvent(0);
    e.days[0].sessions[0].pricing = { mode: 'perLeaf', rate: 987 };
    e.days[0].sessions[1].pricing = { mode: 'fixed', amount: 55555 };
    e.clientName = 'Secret Client';
    e.clientPhone = '9999911111';
    const json = JSON.stringify(buildChefModel(e, DEFAULT_BRAND));
    expect(json).not.toMatch(/"(rate|amount|total|subtotal|grandTotal|price|breakdown)"/);
    expect(json).not.toContain('987');
    expect(json).not.toContain('55555');
    expect(json).not.toContain('55,555');
    expect(json).not.toContain('₹');
    expect(json).not.toContain('Secret Client');
    expect(json).not.toContain('9999911111');
  });

  it('lays dishes out column-major in 3 columns', () => {
    const m = buildChefModel(buildSampleEvent(0), DEFAULT_BRAND);
    const tiffin = m.days[0].sessions[0];
    expect(tiffin.blocks[0].columns).toEqual([
      ['Ashoka Halwa', 'Thattu Idly', 'Milagu Pongal', 'Poori'],
      ['Medhu Vadai', 'Coconut Chutney', 'Poori Masala Kilangu', 'Sambar'],
      ['Idly Podi', 'Coffee'],
    ]);
    const dinner = m.days[0].sessions[4];
    expect(dinner.blocks.map((b) => b.heading)).toEqual([null, 'Live Stall']);
    const brunch = m.days[2].sessions[0];
    expect(brunch.blocks[1]).toMatchObject({ gapBefore: true, columns: [['Omam Water'], ['Vethalai Rasikala Paakku'], []] });
    expect(m.priceSheet.days[0].rows[3]).toEqual({ name: 'Evening Beverages', icon: '1f964', time: 'Unlimited', people: 'Unlimited' });
  });
});

describe('client view model', () => {
  it('prices sessions and never prints ₹0', () => {
    const m = buildClientModel(buildSampleEvent(0), DEFAULT_BRAND);
    expect(m.days[0].sessions[0].price).toEqual({ kind: 'missing', rate: null, label: 'Rate to be confirmed' });
    expect(m.days[0].sessions[3].price.kind).toBe('excluded');
    expect(m.days[2].sessions[0].price).toEqual({ kind: 'perLeaf', rate: 250, total: 25000 });
    expect(m.days[0].subtotal).toBeNull();
    expect(m.days[2].subtotal).toBe(35000);
    expect(m.breakdown.grandTotal).toBe(85000);
    expect(m.breakdown.notes[0]).toBe('Excluding Evening Beverages');
    expect(m.greeting).toBe('Dear Thara,');
  });
  it('greets Sir/Madam without a client name', () => {
    const e = buildSampleEvent(0);
    e.clientName = '';
    expect(buildClientModel(e, DEFAULT_BRAND).greeting).toBe('Dear Sir/Madam,');
  });
});

describe('helpers', () => {
  it('splits titles into two balanced lines', () => {
    expect(splitTitle('Catering Menu Price Request')).toEqual(['CATERING MENU', 'PRICE REQUEST']);
    expect(splitTitle('Marriage Proposal Quotation')).toEqual(['MARRIAGE PROPOSAL', 'QUOTATION']);
    expect(splitTitle('Quotation')).toEqual(['QUOTATION']);
  });
  it('maps session emoji to shipped twemoji files', () => {
    expect(emojiFile('🍽️')).toBe('1f37d');
    expect(emojiFile('🛍️')).toBe('1f6cd');
    expect(emojiFile('☕')).toBe('2615');
    expect(emojiFile('🦄')).toBe('1f37d');
  });
  it('joins names', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B & C');
  });
  it('writes share messages that name the audience', () => {
    const e = buildSampleEvent(0);
    expect(compactDateRange(e)).toBe('24–26 Feb');
    const contact = { contactName: 'Akash R', businessName: 'Dream Light Event Management', contactPhone: '8122831347' };
    const client = { ...e, clientName: 'Mrs Thara' };
    expect(shareMessage(client, 'client', contact)).toBe(
      'Dear Mrs Thara, please find the quotation for Thara Wedding (24–26 Feb). — Akash R, Dream Light Event Management, 8122831347',
    );
    expect(shareMessage({ ...e, clientName: '  ' }, 'client', contact)).toMatch(/^Dear Sir\/Madam, please find/);
    expect(shareMessage(client, 'client')).toBe('Dear Mrs Thara, please find the quotation for Thara Wedding (24–26 Feb).');
    expect(shareMessage(e, 'chef', contact)).toMatch(/^Hello Chef, Thara Wedding menu, 24–26 Feb\..*— Akash R, 8122831347$/);
    expect(shareMessage(e, 'chef', contact)).not.toMatch(/Dream Light/);
  });
});
