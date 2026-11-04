/**
 * Pure view model for the PDF (no React, no react-pdf).
 *
 * The chef model's types have NO price fields at all, so a chef PDF cannot leak a rate or total.
 * `model.test.ts` checks this at runtime as well.
 */
import type { BrandSettings, CateringEvent, Day, PdfVariant, Session } from '@/types';
import { dayTotal, entryBlocks, excludedSessions, grandTotal, isPriceMissing, sessionTotal, toColumns } from '@/lib/calc';
import { eventDatesLabel, peopleLabel, sessionMetaLabel, timeLabel } from '@/lib/format';
import { brandPalette } from '@/lib/theme';

export const DEFAULT_BRAND_COLOR = '#2D5A12';

/** Twemoji files shipped in public/emoji (code points without fe0f). */
export const EMOJI_FILES = ['1f37d', '1f35b', '2615', '1f964', '1f319', '1f305', '1f372', '1f6cd'] as const;
export const FALLBACK_EMOJI = '1f37d';

/** "🍽️" → "1f37d" (falls back to the plate icon for emoji we do not ship). */
export function emojiFile(icon: string): string {
  const cps = Array.from(icon ?? '')
    .map((ch) => ch.codePointAt(0) ?? 0)
    .filter((cp) => cp !== 0xfe0f && cp !== 0x200d)
    .map((cp) => cp.toString(16));
  const key = cps.join('-');
  return (EMOJI_FILES as readonly string[]).includes(key) ? key : FALLBACK_EMOJI;
}

/**
 * Helvetica (WinAnsi) cannot draw emoji / pictographs; strip them from free text so the PDF never shows
 * garbage boxes. Session icons are drawn as images instead.
 */
export function cleanText(s: string): string {
  return (s ?? '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Splits a title into at most 2 balanced lines at a word boundary ("CATERING MENU" / "PRICE REQUEST"). */
export function splitTitle(title: string): string[] {
  const raw = cleanText(title).toUpperCase();
  if (raw.includes('\n')) return raw.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 2);
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length === 1 || raw.length <= 16) return [words.join(' ')];
  let best = 1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    const score = Math.max(a, b);
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/** "Evening Beverages" / "A & B" / "A, B & C" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type LogoModel = { kind: 'bundled' } | { kind: 'none' } | { kind: 'image'; src: string };

export interface HeaderModel {
  titleLines: string[];
  businessName: string;
  logo: LogoModel;
  /** true → texture image (default green brand); false → tint of the brand colour */
  texture: boolean;
}

export interface Palette {
  brand: string;
  /** light tint used for the header band when the brand colour is not the default */
  headerTop: string;
  headerBottom: string;
  /** white text readable on brand? (else dark text on brand bars) */
  onBrand: string;
}

export interface Fonts {
  /** font family for titles: 'Poppins' or 'Helvetica-Bold' */
  heading: string;
}

export interface ColumnBlock {
  heading: string | null;
  gapBefore: boolean;
  /** 3 columns, column-major */
  columns: string[][];
}

/** Session card shared by both variants (no prices). */
export interface MenuCard {
  id: string;
  name: string;
  icon: string; // emoji file name without extension
  meta: string;
  entryCount: number;
  blocks: ColumnBlock[];
}

export interface ChefDay {
  index: number; // 1-based
  date: string;
  title: string;
  sessions: MenuCard[];
}

export interface ChefSheetRow {
  name: string;
  icon: string;
  time: string;
  people: string;
}

export interface ChefSheetDay {
  label: string; // "Day 1 — 24-02-2027 (Viratham & Reception)"
  rows: ChefSheetRow[];
}

interface CommonModel {
  header: HeaderModel;
  palette: Palette;
  fonts: Fonts;
  greeting: string;
  paragraphs: string[];
  info: { label: string; value: string }[];
  signOff: { thanks: string; contact: string; phone: string };
  docTitle: string;
  author: string;
}

export interface ChefModel extends CommonModel {
  variant: 'chef';
  days: ChefDay[];
  priceSheet: { title: string; days: ChefSheetDay[] };
}

export type ClientPrice =
  | { kind: 'perLeaf'; rate: number; total: number }
  | { kind: 'fixed'; total: number }
  | { kind: 'missing'; rate: number | null; label: string }
  | { kind: 'excluded'; label: string };

export interface ClientCard extends MenuCard {
  price: ClientPrice;
}

export interface ClientDay {
  index: number;
  date: string;
  title: string;
  sessions: ClientCard[];
  /** null = nothing priced yet (never print ₹0) */
  subtotal: number | null;
}

export interface BreakdownRow {
  name: string;
  icon: string;
  people: string;
  price: ClientPrice;
}

export interface BreakdownDay {
  label: string;
  rows: BreakdownRow[];
  subtotalLabel: string;
  subtotal: number | null;
}

export interface ClientModel extends CommonModel {
  variant: 'client';
  days: ClientDay[];
  breakdown: {
    title: string;
    days: BreakdownDay[];
    grandTotal: number | null;
    notes: string[];
  };
  paymentTerms: string[];
  eventNotes: string[];
}

export type PdfModel = ChefModel | ClientModel;

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function isDefaultBrand(color: string): boolean {
  return (color ?? '').trim().toLowerCase() === DEFAULT_BRAND_COLOR.toLowerCase();
}

function buildPalette(brand: BrandSettings): Palette {
  const p = brandPalette(brand.brandColor || DEFAULT_BRAND_COLOR);
  return {
    brand: p.base,
    headerTop: p.soft,
    headerBottom: p.tint,
    onBrand: p.whiteTextOk ? '#FFFFFF' : '#1a1a1a',
  };
}

function buildLogo(brand: BrandSettings): LogoModel {
  if (brand.logoDataUrl === null || brand.logoDataUrl === undefined) return { kind: 'bundled' };
  if (brand.logoDataUrl === '') return { kind: 'none' };
  return { kind: 'image', src: brand.logoDataUrl };
}

function metaFor(s: Session): string {
  return sessionMetaLabel(s).split(' • ').join('  •  ');
}

function blocksFor(s: Session): ColumnBlock[] {
  return entryBlocks(s).map((b) => ({
    heading: b.heading ? cleanText(b.heading) : null,
    gapBefore: b.gapBefore,
    columns: toColumns(b.dishes.map(cleanText).filter(Boolean), 3),
  }));
}

function menuCard(s: Session): MenuCard {
  return {
    id: s.id,
    name: cleanText(s.name) || 'Meal',
    icon: emojiFile(s.icon),
    meta: metaFor(s),
    entryCount: s.entries.length,
    blocks: blocksFor(s),
  };
}

function dayLabel(d: Day, i: number): string {
  const title = cleanText(d.title);
  return `Day ${i + 1} — ${d.date}${title ? ` (${title})` : ''}`;
}

function signOff(brand: BrandSettings, thanks: string) {
  const name = cleanText(brand.contactName);
  const biz = cleanText(brand.businessName);
  return {
    thanks,
    contact: name && biz ? `${name} (${biz})` : name || biz,
    phone: cleanText(brand.contactPhone),
  };
}

function common(event: CateringEvent, brand: BrandSettings, variant: PdfVariant) {
  const title = variant === 'client' ? brand.clientPdfTitle : brand.chefPdfTitle;
  return {
    header: {
      titleLines: splitTitle(title || (variant === 'client' ? 'Quotation' : 'Price Request')),
      businessName: cleanText(brand.businessName),
      logo: buildLogo(brand),
      texture: isDefaultBrand(brand.brandColor),
    },
    palette: buildPalette(brand),
    fonts: { heading: brand.headingFont === 'Helvetica' ? 'Helvetica-Bold' : 'Poppins' },
    docTitle: `${cleanText(event.name) || 'Event'} – ${variant === 'client' ? 'Quotation' : 'Chef Price Request'}`,
    author: cleanText(brand.businessName),
  };
}

export function buildChefModel(event: CateringEvent, brand: BrandSettings): ChefModel {
  const info = [
    { label: 'Event Dates:', value: eventDatesLabel(event) || '—' },
    { label: 'Event Location:', value: cleanText(event.location) || '—' },
  ];
  return {
    variant: 'chef',
    ...common(event, brand, 'chef'),
    greeting: 'Dear Chef,',
    paragraphs: (brand.chefNote ?? '')
      .split(/\n\s*\n/)
      .map((p) => p.split(/\r?\n/).map(cleanText).filter(Boolean).join('\n'))
      .filter(Boolean),
    info,
    days: event.days.map((d, i) => ({
      index: i + 1,
      date: d.date,
      title: cleanText(d.title),
      sessions: d.sessions.map(menuCard),
    })),
    priceSheet: {
      title: 'Price Sheet (To be filled by Chef)',
      days: event.days.map((d, i) => ({
        label: dayLabel(d, i),
        rows: d.sessions.map((s) => ({
          name: cleanText(s.name) || 'Meal',
          icon: emojiFile(s.icon),
          time: timeLabel(s.time) || (s.people == null ? 'Unlimited' : '—'),
          people: s.people == null ? 'Unlimited' : String(s.people),
        })),
      })),
    },
    signOff: signOff(brand, 'Thank you. We look forward to your quote.'),
  };
}

export function clientPrice(s: Session): ClientPrice {
  const p = s.pricing;
  if (p.mode === 'excluded') return { kind: 'excluded', label: 'Not included in total' };
  if (isPriceMissing(s)) {
    const rate = p.mode === 'perLeaf' ? p.rate : null;
    return { kind: 'missing', rate, label: rate == null ? 'Rate to be confirmed' : 'Total to be confirmed' };
  }
  const total = sessionTotal(s) ?? 0;
  if (p.mode === 'perLeaf') return { kind: 'perLeaf', rate: p.rate ?? 0, total };
  return { kind: 'fixed', total };
}

/** ₹0 is never printed when prices are still missing. */
function safeTotal(total: number, anyMissing: boolean): number | null {
  return total === 0 && anyMissing ? null : total;
}

export function buildClientModel(event: CateringEvent, brand: BrandSettings): ClientModel {
  const clientName = cleanText(event.clientName);
  const clientPhone = cleanText(event.clientPhone);
  const biz = cleanText(brand.businessName) || 'us';
  const info = [
    { label: 'Event Dates:', value: eventDatesLabel(event) || '—' },
    { label: 'Event Location:', value: cleanText(event.location) || '—' },
  ];
  if (clientName) info.push({ label: 'Client Name:', value: clientName });
  if (clientPhone) info.push({ label: 'Client Phone:', value: clientPhone });

  const days: ClientDay[] = event.days.map((d, i) => ({
    index: i + 1,
    date: d.date,
    title: cleanText(d.title),
    sessions: d.sessions.map((s) => ({ ...menuCard(s), price: clientPrice(s) })),
    subtotal: safeTotal(dayTotal(d), d.sessions.some(isPriceMissing)),
  }));

  const notes: string[] = [];
  const excluded = excludedSessions(event).map((s) => cleanText(s.name));
  if (excluded.length) notes.push(`Excluding ${joinNames(excluded)}`);
  const missing = event.days.flatMap((d) => d.sessions.filter(isPriceMissing).map((s) => cleanText(s.name)));
  if (missing.length) notes.push(`Rates to be confirmed for: ${joinNames(missing)}`);

  const lines = (s: string) =>
    (s ?? '')
      .split(/\r?\n/)
      .map((l) => cleanText(l.replace(/^\s*[-•*]\s*/, '')))
      .filter(Boolean);

  return {
    variant: 'client',
    ...common(event, brand, 'client'),
    greeting: `Dear ${clientName || 'Sir/Madam'},`,
    paragraphs: [`Thank you for considering ${biz}. Please find our proposed menu and quotation below.`],
    info,
    days,
    breakdown: {
      title: 'Cost Breakdown',
      days: event.days.map((d, i) => ({
        label: dayLabel(d, i),
        rows: d.sessions.map((s) => ({
          name: cleanText(s.name) || 'Meal',
          icon: emojiFile(s.icon),
          people: peopleLabel(s.people).replace(' People', ''),
          price: clientPrice(s),
        })),
        subtotalLabel: `Day ${i + 1} subtotal`,
        subtotal: safeTotal(dayTotal(d), d.sessions.some(isPriceMissing)),
      })),
      grandTotal: safeTotal(grandTotal(event), missing.length > 0),
      notes,
    },
    paymentTerms: lines(brand.paymentTerms),
    eventNotes: (event.notes ?? '')
      .split(/\r?\n/)
      .map((l) => cleanText(l))
      .filter(Boolean),
    signOff: signOff(brand, 'Thank you. We look forward to serving you.'),
  };
}

export function buildPdfModel(event: CateringEvent, brand: BrandSettings, variant: PdfVariant): PdfModel {
  return variant === 'chef' ? buildChefModel(event, brand) : buildClientModel(event, brand);
}
