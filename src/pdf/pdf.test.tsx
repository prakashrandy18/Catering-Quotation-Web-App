// @vitest-environment node
import { resolve } from 'node:path';
import { buildSampleEvent, DEFAULT_BRAND } from '@/data/seed';
import { pdfFileName } from '@/lib/format';
import type { BrandSettings, CateringEvent } from '@/types';
import { setPdfAssetBase } from './assets';
import { renderPdfBuffer } from './render';
import { pdfText, type PdfText } from './testing/pdfText';

setPdfAssetBase(resolve(process.cwd(), 'public') + '/');

async function render(event: CateringEvent, variant: 'client' | 'chef', brand: BrandSettings = DEFAULT_BRAND): Promise<PdfText> {
  const buf = await renderPdfBuffer(event, brand, variant);
  expect(Buffer.from(buf.subarray(0, 5)).toString()).toBe('%PDF-');
  return pdfText(buf);
}

function scenario(): CateringEvent {
  const e = buildSampleEvent(0);
  const brunch = e.days[2].sessions.find((s) => s.name === 'Brunch')!;
  brunch.people = 120;
  brunch.pricing = { mode: 'perLeaf', rate: 260 };
  e.days[1].sessions.find((s) => s.name.startsWith('Vilayadal'))!.entries.push({ id: 'x', kind: 'dish', text: 'Samosa' });
  return e;
}

describe('chef PDF (seed)', () => {
  let chef: PdfText;
  const seed = buildSampleEvent(0);
  beforeAll(async () => {
    chef = await render(seed, 'chef');
  }, 60_000);

  it('has 4 pages like the sample, Day 3 starting page 3', () => {
    expect(chef.pages).toHaveLength(4);
    expect(chef.pages[2].startsWith('Day 3')).toBe(true);
  });

  it('has the title, greeting, price sheet and sign-off', () => {
    expect(chef.all).toContain('CATERING MENU');
    expect(chef.all).toContain('PRICE REQUEST');
    expect(chef.all).toContain('Dear Chef');
    expect(chef.pages[3]).toContain('Price Sheet (To be filled by Chef)');
    expect(chef.pages[3]).toContain('Rate per Leaf (₹)');
    expect(chef.all).toContain('Thank you. We look forward to your quote.');
    expect(chef.all).toContain('Akash R (Dream Light Event Management)');
    expect(chef.all).toContain('8122831347');
  });

  it('contains every seed dish', () => {
    const dishes = seed.days.flatMap((d) => d.sessions.flatMap((s) => s.entries.filter((x) => x.kind !== 'gap').map((x) => x.text)));
    expect(dishes.length).toBeGreaterThan(100);
    for (const d of dishes) expect(chef.all).toContain(d);
  });

  it('never shows an amount', () => {
    expect(chef.all).not.toMatch(/₹\s*\d/);
    expect(chef.all).not.toContain('/leaf');
    expect(chef.all).not.toContain('Cost Breakdown');
  });

  it('never shows client details', async () => {
    const e = buildSampleEvent(0);
    e.clientName = 'Thara Ramesh';
    e.clientPhone = '9876543210';
    const t = await render(e, 'chef');
    expect(t.all).not.toContain('Thara Ramesh');
    expect(t.all).not.toContain('9876543210');
    expect(t.all).not.toContain('Client Name');
  }, 60_000);
});

describe('client PDF', () => {
  let client: PdfText;
  beforeAll(async () => {
    client = await render(buildSampleEvent(0), 'client');
  }, 60_000);

  it('shows the quotation with prices and the cost breakdown', () => {
    expect(client.all).toContain('MARRIAGE PROPOSAL');
    expect(client.all).toContain('QUOTATION');
    expect(client.all).toContain('Dear Thara,');
    expect(client.all).toContain('Thank you for considering Dream Light Event Management.');
    expect(client.all).toContain('Cost Breakdown');
    expect(client.all).toContain('₹25,000'); // Brunch 100 × 250
    expect(client.all).toContain('₹35,000'); // Day 3
    expect(client.all).toContain('₹250/leaf');
    expect(client.all).toContain('Excluding Evening Beverages');
    expect(client.all).toContain('Rate to be confirmed');
    expect(client.all).toContain('Rates to be confirmed for: Viratha Tiffin');
    expect(client.all).toContain('Not included in total');
    expect(client.all).toContain('Thank you. We look forward to serving you.');
    expect(client.all).not.toMatch(/₹0(?![\d,])/);
  });

  it('hides payment terms when empty and prints them when set', async () => {
    expect(client.all).not.toContain('Payment Terms');
    const e = buildSampleEvent(0);
    e.clientPhone = '9876543210';
    e.notes = 'Includes service staff.';
    const t = await render(e, 'client', { ...DEFAULT_BRAND, paymentTerms: '50% advance (₹3,00,000)\nBalance on the event day' });
    expect(t.all).toContain('Payment Terms');
    expect(t.all).toContain('50% advance (₹3,00,000)');
    expect(t.all).toContain('Balance on the event day');
    expect(t.all).toContain('Client Phone: 9876543210');
    expect(t.all).toContain('Includes service staff.');
  }, 60_000);

  it('reflects the acceptance scenario edits', async () => {
    const t = await render(scenario(), 'client');
    expect(t.all).toContain('₹31,200');
    expect(t.all).toContain('₹41,200');
    expect(t.all).toContain('₹260/leaf');
    expect(t.all).toContain('Samosa');
  }, 60_000);

  it('works with a custom brand colour, Helvetica titles and no logo', async () => {
    const t = await render(buildSampleEvent(0), 'client', {
      ...DEFAULT_BRAND,
      brandColor: '#7A1F2B',
      headingFont: 'Helvetica',
      logoDataUrl: '',
      clientPdfTitle: 'Wedding Quotation',
    });
    expect(t.all).toContain('WEDDING QUOTATION');
    expect(t.all).toContain('Cost Breakdown');
  }, 60_000);
});

describe('file names', () => {
  it('names the audience', () => {
    expect(pdfFileName('Thara Wedding', 'client')).toBe('Thara Wedding – Quotation.pdf');
    expect(pdfFileName('Thara Wedding', 'chef')).toBe('Thara Wedding – Chef Price Request.pdf');
  });
});
