/**
 * Shared domain types. This file is the contract between the store, the screens,
 * the PDF generator and the Claude assistant. Change with care.
 */

export type ID = string;

/** One line inside a session's menu. */
export type EntryKind =
  | 'dish' // a bulleted dish, e.g. "Medhu Vadai"
  | 'gap' // a dotted divider + space (e.g. Brunch before "Omam Water"); text is ''
  | 'heading'; // a small sub-heading inside a session (e.g. "Live Stall")

export interface MenuEntry {
  id: ID;
  kind: EntryKind;
  text: string;
}

/**
 * How a session is priced.
 * - perLeaf: people × rate. rate === null means "rate not set yet" (shown as a warning).
 * - fixed: one amount for the whole session. amount === null means not set yet.
 * - excluded: not part of the total (e.g. "Evening Beverages – Unlimited").
 */
export type Pricing =
  | { mode: 'perLeaf'; rate: number | null }
  | { mode: 'fixed'; amount: number | null }
  | { mode: 'excluded' };

export interface Session {
  id: ID;
  name: string; // "Viratha Tiffin"
  icon: string; // an emoji, e.g. "🍽️" (rendered in UI and PDF)
  /** 24h "HH:MM" or null when there is no fixed time (e.g. beverages through the evening). */
  time: string | null;
  /** Number of people (leaves). null = "Unlimited". */
  people: number | null;
  pricing: Pricing;
  entries: MenuEntry[];
}

export interface Day {
  id: ID;
  /** "DD-MM-YYYY", exactly as printed in the PDF. */
  date: string;
  /** "Viratham & Reception" */
  title: string;
  sessions: Session[];
}

export type EventStatus = 'draft' | 'sent' | 'confirmed';

export interface CateringEvent {
  id: ID;
  name: string; // "Thara Wedding"
  clientName: string; // shown only on the client quote
  clientPhone: string; // shown only on the client quote
  location: string; // "Avadi"
  status: EventStatus;
  days: Day[];
  /** Free text printed under the cost breakdown of the client quote (optional). */
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type Actor = 'you' | 'claude';

export interface HistoryEntry {
  id: ID;
  eventId: ID;
  at: number;
  by: Actor;
  /** Short human summary, e.g. "Viratha Tiffin updated" */
  summary: string;
  /** Optional detail, e.g. "− Vada Curry, + Poori Masala Kilangu" */
  detail?: string;
  /** Full snapshot of the event BEFORE this change (null if the change created the event). */
  before: CateringEvent | null;
  /** Used to merge rapid keystroke edits of the same field into one history entry. */
  coalesceKey?: string;
}

export type PdfVariant = 'client' | 'chef';

export interface BrandSettings {
  businessName: string; // "Dream Light Event Management"
  /** PNG/JPEG data URL or null (then initials are shown). */
  logoDataUrl: string | null;
  /** Hex, e.g. "#2D5A12" */
  brandColor: string;
  headingFont: 'Poppins' | 'Helvetica';
  clientPdfTitle: string; // "Marriage Proposal Quotation"
  chefPdfTitle: string; // "Catering Menu Price Request"
  contactName: string; // "Akash R"
  contactPhone: string; // "8122831347"
  /** Printed on the client quote. Empty = section hidden. */
  paymentTerms: string;
  /** Intro paragraph of the chef version (after "Dear Chef,"). */
  chefNote: string;
}

export interface AssistantSettings {
  /** Anthropic API key, stored only in this browser. Empty = assistant disabled. */
  apiKey: string;
  /** Model id, default "claude-sonnet-5-5". */
  model: string;
  /** Optional proxy endpoint (e.g. "/api/claude") used instead of calling Anthropic directly. */
  proxyUrl: string;
  /** Speech recognition language for the mic button. */
  voiceLang: 'en-IN' | 'ta-IN';
}

export interface Dish {
  name: string;
  category: DishCategory;
}

export type DishCategory =
  | 'Sweet'
  | 'Tiffin'
  | 'Rice'
  | 'Kulambu & Rasam'
  | 'Poriyal & Kootu'
  | 'Vadai & Snacks'
  | 'Pachadi & Pickle'
  | 'Drinks'
  | 'North Indian'
  | 'Others';

/** Chat message persisted per event so the conversation survives reloads. */
export interface ChatMessage {
  id: ID;
  role: 'user' | 'assistant';
  text: string;
  at: number;
  /** For assistant messages that changed data: the history entry created. */
  historyId?: ID;
  /** Rendered change list, e.g. [{sign:'-', text:'Vada Curry'}] */
  changes?: { sign: '+' | '-' | '~'; text: string; where?: string }[];
}
