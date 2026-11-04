# Architecture plan

> Produced by the planning agent against the 11-screen flow and the sample PDF.
> **Lead overrides (authoritative where they differ from the plan below):**
> - Types/store are as implemented in `src/types.ts` and `src/store/useAppStore.ts` (snapshot-per-change history,
>   `transact()` primitive, `undo(historyId)` restores the state *before* that change; undoing an older entry also
>   reverts later changes, so the UI must warn first). Session `time` is 24h `"HH:MM" | null`, `people: number | null`
>   (null = Unlimited), dates are `"DD-MM-YYYY"`.
> - Routes are those in `src/App.tsx` (`menu/:sessionId`, `menu/:sessionId/add`, `pdf`, `history`, `details`, `/settings`).
> - Phone tabs are a bottom bar labelled **Chat · Menu · PDF** (UX review). Copy follows `docs/UX_REVIEW.md` ("Meal", "Blank space", …).
> - **Seed rates are NOT invented**: only the rates confirmed by the business are filled (Vilayadal ₹100, Muhurtham Dinner ₹300,
>   Brunch ₹250, Kattu Saatham ₹100). The others are `null` and show "Price missing" until the owner enters them.
> - No "view-only link" feature (no server to host PDFs). Share = system share sheet (WhatsApp) or download.
> - Claude API key lives in the store's `assistant.apiKey` (persisted in localStorage on this device only) and is excluded from backups.

---

# Implementation plan: catering quotation PWA (Dream Light Event Management)

## 0. What I checked, and constraints that change the plan

**Network.** From this sandbox, GitHub raw and the jsDelivr CDN return 403. The npm registry works. All binary assets must come from npm tarballs or from the sample PDF. I confirmed every source below.
- **Poppins TTF:** `npm pack @expo-google-fonts/poppins@0.4.1`, then take `package/700Bold/Poppins_700Bold.ttf` and `package/400Regular/Poppins_400Regular.ttf`. Put them in `public/fonts/Poppins-Bold.ttf` and `public/fonts/Poppins-Regular.ttf`. I parsed the cmap: both fonts contain ₹ (U+20B9), • and —.
- **Twemoji PNGs:** `npm pack emoji-datasource-twitter@16.0.0` (large; do not add it as a dependency). Copy `package/img/twitter/64/<cp>.png` into `public/emoji/<cp-without-fe0f>.png`.
- **Header texture and logo:** extract them from the sample PDF.
  - `pdfimages -j -f 1 -l 1 sample.pdf X` gives the 1400×933 JPEG header texture. Save it as `public/pdf/header-texture.jpg` (resize to 1240 wide, quality 80).
  - `pdfimages -png` gives the logo (538×377) plus its smask. Merge them with PIL into RGBA and save as `public/brand/logo.png`. PIL 12.3 is available.
- **₹ in the body font:** Liberation Sans, the font in the sample, has no ₹ glyph (Chromium fell back to DejaVuSans for it). The built-in Helvetica in react-pdf (WinAnsi encoding) cannot draw ₹ either. Rule: **every ₹ is drawn in a nested `<Text>` with fontFamily Poppins**, through `src/pdf/components/Rupee.tsx`. Body text stays Helvetica.
- **Playwright:** 1.63 is installed globally at `/opt/node22/lib/node_modules/playwright`. Run the e2e script with `NODE_PATH=/opt/node22/lib/node_modules node e2e/scenario.cjs`.
- **Recommended pins:** react 18.3, react-router-dom 6.30.x (HashRouter), zustand 5, immer 11, tailwindcss 3.4.19, @react-pdf/renderer ^4.9, pdfjs-dist (latest, use the `legacy/` build), @anthropic-ai/sdk ^1.4, zod ^4, lz-string 1.5, @fontsource/inter and @fontsource/poppins (UI only), vite-plugin-pwa 2. Vite 7 is the safer choice with vitest; Vite 8 (rolldown) also works.
- **Claude SDK:** use `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true` (this sets `anthropic-dangerous-direct-browser-access`), not raw fetch. Claude Sonnet 5.5 rejects forced `tool_choice` (`any`/`tool`) with a 400, and rejects `thinking:{type:"disabled"}` with a 400. Use `tool_choice:{type:"auto"}`, omit `thinking`, and send `output_config:{effort:"low"}`. Thinking blocks are bound to the conversation, so **the API message history must be append-only**: never trim or edit earlier turns. To shrink context, start a new conversation.

### Seed rates
The designs total ₹6,00,000: Day 1 ₹3,50,000, Day 2 ₹2,15,000, Day 3 ₹35,000, Vilayadal 200×₹100, Muhurtham Dinner 100×₹300, Brunch 100×₹250, Kattu Saatham 100×₹100. These rates reproduce those numbers exactly:

| Session | People | Rate per leaf | Total |
|---|---|---|---|
| Viratha Tiffin | 100 | 150 | 15,000 |
| Viratha Lunch | 100 | 350 | 35,000 |
| Evening Snacks | 500 | 80 | 40,000 |
| Evening Beverages | unlimited | excluded | — |
| Reception Dinner | 800 | 325 | 2,60,000 |
| Muhurtham Morning Tiffin | 300 | 150 | 45,000 |
| Muhurtham Lunch | 300 | 400 | 1,20,000 |
| Vilayadal Evening (Snacks) | 200 | 100 | 20,000 |
| Muhurtham Dinner | 100 | 300 | 30,000 |
| Brunch | 100 | 250 | 25,000 |
| Kattu Saatham | 100 | 100 | 10,000 |

After the acceptance scenario: Brunch 120×260 = **₹31,200**, Day 3 = **₹41,200**, grand total = **₹6,06,200**.

## 1. Folder structure and file ownership

No file is owned by two agents. **A** (the lead) creates a stub default export at every screen path that `App.tsx` imports. After that, ownership of the stub passes to the agent named below, who overwrites it.

```
(A) FOUNDATION — lead
package.json  vite.config.ts  tsconfig*.json  tailwind.config.ts  postcss.config.js  index.html
.github/workflows/deploy.yml          (build → GitHub Pages)
public/manifest.webmanifest  public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png
public/fonts/Poppins-{Bold,Regular}.ttf   public/emoji/*.png   public/pdf/header-texture.jpg   public/brand/logo.png
src/main.tsx  src/App.tsx (routes, React.lazy)  src/index.css
src/types.ts
src/store/index.ts        (zustand store + actions)
src/store/history.ts      (diffEvents, revertChanges, describe helpers)
src/store/selectors.ts    (pure totals and lookups + hooks)
src/store/migrations.ts   src/store/storage.ts (debounced localStorage)   src/store/backup.ts
src/store/__tests__/*.test.ts
src/data/seed.ts  src/data/dishLibrary.ts  src/data/templates.ts (wedding template)
src/lib/format.ts  src/lib/ids.ts  src/lib/emoji.ts (ICON_SET + emojiFileName)
src/components/ui/*  (Button, IconButton, TextField, TextArea, Stepper, NumberField, Chip,
     SegmentedControl, Tabs, BottomSheet, Dialog/ConfirmDialog, Toast(+useToast), Badge,
     Card, ListRow, Icon (inline SVG set), EmptyState, Spinner)
src/components/layout/EventShell.tsx   (event header + Ask Claude|Menu|PDF tabs + ≥1024 split with right <Outlet name="preview">)
src/components/layout/AppShell.tsx

(B) PDF-BUILDER
src/pdf/index.ts            generatePdf, pdfFileName, (re)exports types
src/pdf/registerAssets.ts   src/pdf/theme.ts   src/pdf/model.ts (buildPdfModel, pure)
src/pdf/layout.ts           (segmentEntries, splitColumns)
src/pdf/QuotationDocument.tsx
src/pdf/components/{Header,Intro,EventInfo,MenuDetails,DayBlock,DayBar,SessionCard,DishColumns,
                    CostBreakdown,PaymentTerms,PriceSheet,SignOff,Rupee,EmojiIcon}.tsx
src/pdf/pdfjs.ts  src/pdf/PdfPages.tsx (canvas renderer)  src/pdf/usePdfBlob.ts
src/pdf/__tests__/*.test.ts(x)   scripts/render-pdf.mts (node: write seed PDFs to a given dir)
test/helpers/pdfText.ts     (pdfjs text extraction used by vitest AND e2e; B owns)

(C) SCREENS-BUILDER
src/screens/EventsScreen.tsx (F01)        src/screens/NewEventScreen.tsx (F02)
src/screens/EventDetailsScreen.tsx        src/screens/MenuScreen.tsx (F07)
src/screens/SessionEditScreen.tsx (F08)   src/screens/AddDishScreen.tsx (F09)
src/screens/PdfPreviewScreen.tsx (F05)    src/screens/ShareSheet.tsx (F06)
src/screens/HistoryScreen.tsx (F10)       src/screens/SharedViewScreen.tsx (#/view)
src/screens/LivePreviewPane.tsx (≥1024 right pane)
src/screens/settings/{SettingsHome,BrandSettingsScreen (F11),TermsScreen,BackupScreen,LibraryScreen}.tsx
src/screens/components/*  (EventCard, DayPills, SessionRow, DishList (drag reorder), StatusPill …)
src/lib/share.ts (download/share/WhatsApp)   src/lib/shareLink.ts (lz-string)   src/lib/fuzzy.ts (dish search)
e2e/scenario.cjs  e2e/claude-mock.cjs  e2e/README.md

(D) ASSISTANT-BUILDER
src/assistant/client.ts  src/assistant/tools.ts  src/assistant/executor.ts  src/assistant/context.ts
src/assistant/systemPrompt.ts  src/assistant/useAssistant.ts  src/assistant/conversation.ts
src/assistant/spelling.ts  src/assistant/speech.ts (useSpeech)  src/assistant/__tests__/*
src/screens/chat/{ChatScreen (F03/F04), MessageBubble, ChangeSummaryCard, ProposalCard, SpellingFixCard,
                  MicButton, QuickChips, SetupCard}.tsx
src/screens/settings/AssistantSettingsScreen.tsx
api/claude.ts  vercel.json
```

`src/lib/fuzzy.ts` (C) exports `searchDishes(library, q)` and `similarity(a, b)`. D imports `similarity` from it. C delivers it first, because it is a small pure file.

## 2. `src/types.ts` (exact)

```ts
export type ID = string;                 // nanoid(10)
export type ISODate = string;            // 'YYYY-MM-DD'
export type Author = 'you' | 'claude';
export type EventStatus = 'draft' | 'sent' | 'confirmed';
export type PdfVersion = 'client' | 'chef';
export type People = number | 'unlimited';

export type Pricing =
  | { mode: 'perLeaf'; rate: number | null }      // rupees per leaf; null = not set yet
  | { mode: 'fixed'; amount: number | null }      // lump sum for the session
  | { mode: 'excluded' };                         // shown, not counted (e.g. Evening Beverages)

export type Entry =
  | { id: ID; kind: 'dish'; name: string }
  | { id: ID; kind: 'gap' }                        // dotted divider
  | { id: ID; kind: 'heading'; text: string };    // sub-group, e.g. "Live Stall"
export type EntryInput =
  | { kind: 'dish'; name: string } | { kind: 'gap' } | { kind: 'heading'; text: string };

export interface Session {
  id: ID; name: string; icon: string;             // emoji char from ICON_SET
  time: string;                                   // '8:00 AM' | '' (free text allowed)
  period: string | null;                          // override; null → auto from time
  people: People; pricing: Pricing; entries: Entry[];
  createdAt: number; createdBy: Author;
}
export interface Day { id: ID; date: ISODate; title: string; sessions: Session[] }
export interface CateringEvent {
  id: ID; name: string; clientName: string; clientPhone: string; location: string;
  status: EventStatus; days: Day[]; notes: string;
  createdAt: number; updatedAt: number; sentToClientAt: number | null; sentToChefAt: number | null;
}
export interface BrandSettings {
  businessName: string; monogram: string;               // 'DL'
  logo: string | null;                                  // data URL or 'brand/logo.png'
  brandColor: string;                                   // '#2D5A12'
  headingFont: 'Poppins' | 'Helvetica-Bold';
  headerStyle: 'texture' | 'tint';
  titles: { client: string; chef: string };             // '\n' = line break; rendered UPPERCASE
  contactName: string; contactPhone: string;
  clientIntro: string; chefNote: string; paymentTerms: string;   // newline-separated lines
}
export interface AssistantSettings {
  model: string;                                        // default 'claude-sonnet-5-5'
  proxy: 'auto' | 'off'; voiceLang: 'en-IN' | 'ta-IN'; enabled: boolean;
}
export type DishCategory = 'Sweet'|'Tiffin'|'Rice'|'Kulambu'|'Rasam'|'Poriyal'|'Kootu'|'Pachadi'|'Vadai'
  |'Snacks'|'Beverage'|'Chutney'|'Pickle'|'Bread'|'Curry'|'Live Stall'|'Accompaniment'|'Misc';
export interface DishLibraryItem { name: string; category: DishCategory; aliases: string[]; custom?: boolean }

export type Change =
  | { t: 'eventField'; field: 'name'|'clientName'|'clientPhone'|'location'|'status'|'notes'; from: unknown; to: unknown }
  | { t: 'dayAdd' | 'dayRemove'; day: Day; index: number }
  | { t: 'dayField'; dayId: ID; field: 'date'|'title'; from: string; to: string }
  | { t: 'dayOrder'; from: ID[]; to: ID[] }
  | { t: 'sessionAdd' | 'sessionRemove'; dayId: ID; session: Session; afterId: ID | null }
  | { t: 'sessionField'; sessionId: ID; field: 'name'|'icon'|'time'|'period'|'people'|'pricing'; from: unknown; to: unknown }
  | { t: 'sessionOrder'; dayId: ID; from: ID[]; to: ID[] }
  | { t: 'sessionDay'; sessionId: ID; fromDayId: ID; toDayId: ID; fromAfterId: ID | null }
  | { t: 'entryAdd' | 'entryRemove'; sessionId: ID; entry: Entry; afterId: ID | null }
  | { t: 'entryField'; sessionId: ID; entryId: ID; field: 'name'|'text'; from: string; to: string }
  | { t: 'entryOrder'; sessionId: ID; from: ID[]; to: ID[] };

export interface HistoryEntry {
  id: ID; eventId: ID; at: number; author: Author;
  title: string;                 // 'Viratha Tiffin updated'
  details: string[];             // ['− Vada Curry', '+ Poori Masala Kilangu', 'People 100 → 120']
  changes: Change[]; batchId: string | null;
  undoneBy: ID | null; undoOf: ID | null;
}
export interface EditOpts { author?: Author; batchId?: string; title?: string; silent?: boolean }
export interface NewEventInput {
  name: string; location: string; fromDate: ISODate; toDate: ISODate; clientName?: string; clientPhone?: string;
  startFrom: { kind: 'blank' } | { kind: 'template'; templateId: 'wedding' } | { kind: 'copy'; eventId: ID };
}
export interface NewSessionInput {
  name: string; icon?: string; time?: string; period?: string | null; people?: People;
  pricing?: Pricing; entries?: EntryInput[];
}
export interface BackupFile { app: 'dl-catering'; schemaVersion: number; exportedAt: string;
  events: CateringEvent[]; brand: BrandSettings; library: DishLibraryItem[]; history: Record<ID, HistoryEntry[]> }
export interface UndoResult { ok: boolean; applied: number; conflicts: number; historyId: ID | null }
```

## 3. Store API (`src/store/index.ts`, zustand + persist + immer)

**State:** `{ events: Record<ID, CateringEvent>; eventOrder: ID[]; brand; assistant; library: DishLibraryItem[]; history: Record<ID, HistoryEntry[]> /* newest first, cap 200 per event */; meta: { changesSinceBackup: number; lastBackupAt: number | null; persistGranted: boolean | null } }`

**Actions.** Every event mutation takes `opts?: EditOpts`, where `author` defaults to `'you'`.
```ts
createEvent(input: NewEventInput): ID                       // one Day per date from..to, title ''
duplicateEvent(eventId, newName?: string): ID               // new ids, status draft, no history
deleteEvent(eventId): void                                  // UI confirm; not undoable
renameEvent(eventId, name, opts?)
updateEventDetails(eventId, patch: Partial<Pick<CateringEvent,'name'|'clientName'|'clientPhone'|'location'|'notes'>>, opts?)
setEventStatus(eventId, status, opts?)                      // also stamps sentToClientAt/sentToChefAt via markSent
markSent(eventId, version: PdfVersion): void
addDay(eventId, input: { date: ISODate; title?: string }, opts?): ID          // inserted in date order
updateDay(eventId, dayId, patch: { date?: ISODate; title?: string }, opts?)
removeDay(eventId, dayId, opts?)
addSession(eventId, dayId, input: NewSessionInput, after?: { afterSessionId: ID | null }, opts?): ID   // default: append
updateSession(eventId, sessionId, patch: Partial<Pick<Session,'name'|'icon'|'time'|'period'|'people'|'pricing'>>, opts?)
removeSession(eventId, sessionId, opts?)
moveSession(eventId, sessionId, to: { dayId: ID; index: number }, opts?)
setPeople(eventId, sessionId, people: People, opts?)
setRate(eventId, sessionId, rate: number | null, opts?)    // forces mode perLeaf
setPricing(eventId, sessionId, pricing: Pricing, opts?)
addEntry(eventId, sessionId, entry: EntryInput, index?: number, opts?): ID
addDishes(eventId, sessionId, names: string[], index?: number, opts?): ID[]  // dedupes exact duplicates within session
removeEntry(eventId, sessionId, entryId, opts?)
renameEntry(eventId, sessionId, entryId, nameOrText: string, opts?)
moveEntry(eventId, sessionId, entryId, toIndex: number, opts?)
transaction<T>(eventId, opts: EditOpts & { title: string }, fn: () => T): T  // all inner calls → ONE history entry
undo(historyId): UndoResult                                // creates an 'Undid: …' entry; sets undoneBy
redo(historyId): UndoResult                                // = undo of the undo entry
updateBrand(patch: Partial<BrandSettings>): void
updateAssistant(patch: Partial<AssistantSettings>): void
addLibraryDish(item: Omit<DishLibraryItem,'custom'>): void; removeLibraryDish(name: string): void
exportBackup(): BackupFile; importBackup(data: unknown, mode: 'replace' | 'merge'): { ok: boolean; error?: string }
markBackedUp(): void; resetToDemo(): void
```
The API key is **not** in the store. It lives in `localStorage['dl-catering:claude-key']`, read and written by D's `client.ts`, and is never exported.

**How history is recorded.** Use diff-per-change, not stored snapshots. `mutateEvent(eventId, opts, describe, recipe)` does this:
1. Take `before = current event`.
2. Run the immer `produce` recipe.
3. Run `changes = diffEvents(before, after)`. Diff by entity id: adds and removes carry the full entity plus `afterId`; changed fields carry `from`/`to`; order changes carry the before and after id lists.
4. Push a `HistoryEntry` with a generated title and details. Example: title "Brunch updated", details "People 100 → 120", "Rate ₹250 → ₹260", "+ Samosa", "− Vada Curry", "Vada Curry → Poori Masala Kilangu".

**Batching.** If `opts.batchId` equals the newest entry's `batchId`, merge into that entry. Keep the batch's first `before` in a non-persisted `Map<batchId, CateringEvent>`, recompute the diff against the newest state, and concatenate details. `transaction()` sets a fresh batchId. Claude uses one batchId per user turn, and the confirm card uses one per proposal.

**`revertChanges(current, changes)`** (in `history.ts`, pure). It walks changes in reverse:
- added → remove, if still present
- removed → re-insert after `afterId`, or at the start if `afterId` is gone; skip if the parent is gone (conflict)
- field → set `from` only if the current value deep-equals `to`; otherwise count a conflict
- order → if the current surviving-id order equals `to` filtered to existing ids, apply `from` filtered; otherwise conflict

`undo()` applies this to the current event, records it as a new entry (`undoOf` set) and returns counts. The UI toast reads: "Undone: X" with a Redo button, plus "(N parts were changed later and kept)" when there were conflicts. This supports F10's per-entry undo of older entries without wiping later edits. An undo storage entry stays around 1 KB, versus about 10 KB for a full snapshot.

**Selectors** (`selectors.ts`, pure):
```ts
sessionTotal(s: Session): number | null     // perLeaf: rate==null||people==='unlimited' → null; fixed: amount; excluded → 0
sessionPriceState(s): 'priced' | 'missing' | 'excluded'
dayTotal(d: Day): number                    // sum of non-null totals
grandTotal(e: CateringEvent): number
missingRates(e): { dayId: ID; sessionId: ID; name: string }[]
excludedSessions(e): Session[]
dishCount(s): number                        // kind==='dish' only (F07: "25 dishes")
eventDateRange(e): { from: ISODate; to: ISODate } | null
findSession(e, sessionId): { day: Day; dayIndex: number; session: Session; index: number } | null
// hooks: useEvent(id), useHistory(eventId), useBrand()
```

**Persistence.**
- `persist(..., { name: 'dl-catering', version: 1, storage: createJSONStorage(() => debouncedLocalStorage), partialize, migrate })`.
- `storage.ts` debounces `setItem` by 400 ms and flushes on `pagehide` and `visibilitychange`.
- `migrations.ts` is `migrate(state: any, from: number)`: a switch with a fall-through chain, plus `mergeSeedLibrary()`, which adds new built-in dishes on upgrade.
- On an empty store, call `seedState()` (Thara Wedding, brand defaults, library).
- On the first edit, call `navigator.storage?.persist()` and save the result in `meta.persistGranted`.
- Every mutation increments `meta.changesSinceBackup`. After 25 changes, F01 shows a "Back up your data" banner.

### Seed (`src/data/seed.ts`)
Order dishes **column-major**, exactly as the PDF reads down each column. The event is "Thara Wedding", location Avadi, no client name or phone, status draft.

**Day 1 — 2027-02-24, "Viratham & Reception"**
- 🍽️ Viratha Tiffin, 8:00 AM, 100 people: Ashoka Halwa, Thattu Idly, Milagu Pongal, Poori, Medhu Vadai, Coconut Chutney, Poori Masala Kilangu, Sambar, Idly Podi, Coffee
- 🍛 Viratha Lunch, 12:30 PM, 100 people: Gulab Jamun, Vazhaipoo Vadai, Avarai Curry, Carrot Curd Pachadi, Aviyal, Poosani Kootu, Semiya Payasam, White Rice, Dal, Ghee, Kalyana Sambar, Mysore Rasam, Butter Milk, Appalam, Vethalai Paakku, Banana
- ☕ Evening Snacks, 6:00 PM, 500 people: Pani Poori, Cutlet, Samosa, Bonda Bajji, Cheese Balls
- 🥤 Evening Beverages, time '', people unlimited, excluded: Watermelon Juice, Milk Sarbath, Tea, Coffee, Boost, Rounding Badam Milk
- 🌙 Reception Dinner, 8:00 PM, 800 people: Rasamalai, Sandwich Sweet, Elaneer Payasam, Gobi 65, Mini Sambar Idly, Veg Uthappam, Rumali Roti, Kadai Mushroom, Idiyappam, Veg Paya, Palak Biryani, Onion Raita, Potato Chips, Sambar, Kara Chutney, National Poriyal, Fresh Mango Oorugai, Bisibelabath with Kaara Boondi, White Rice, Rasam, Vatha Kulambu, Appalam, then a heading "Live Stall", then Fruit Salad, Ice Cream, Beeda

**Day 2 — 2027-02-25, "Muhurtham"**
- 🌅 Muhurtham Morning Tiffin, 7:30 AM, 300 people: Badam Halwa, Ghee Podi Idly, Masala Dosai, Poori, Aappam, Coconut Milk, Pongal, Vada Curry, Medhu Vadai, Sambar, Thakkali Chutney, Groundnut Chutney
- 🍛 Muhurtham Lunch, 12:30 PM, 300 people: Kaju Katli, Mini Jangiri, Kalyana Payasam, Veg Biryani, Curd Pachadi, Beetroot Sweet Pachadi, Beans Usili, Malabar Aviyal, Puli Inji, Veppilai Katti, White Rice, Ghee, Dal, Mixed Sambar, Vendakkai Moru Kulambu, Tomato Rasam, Cup Curd, Puliyodharai, Nendhiram Chips, Aamai Vadai, Mango Pickle, Vethalai Paakku, Banana
- ☕ Vilayadal Evening (Snacks), 3:30 PM, 200 people: Mini Badusha, Mixture, Onion Pakoda, Tea, Coffee, Juice
- 🌙 Muhurtham Dinner, 7:00 PM, 100 people: Jilebi, Paal Payasam, Curd Pachadi, Fruit Pachadi, Kose Poriyal, Kathirikai Karamani Podi Curry, Chow Chow Kootu, Andhra Special Thakkali Oorugai, Veg Vadai, Papadam, White Rice, Sambar, Rasam, Coconut Rice

**Day 3 — 2027-02-26, "Brunch & Kattu Saatham"**
- 🍲 Brunch, 10:00 AM, 100 people: Makkan Peda, Ada Pradhaman Payasam, Curd Vadai, Curd Pachadi, Arisi Appalam, Seppankizhangu Roast, Poricha Kootu, Potato Podimas, Saatham (White Rice), Milagu Kulambu, Seeraga Rasam, Moru, Oorugai, Ice Cream (Kulfi), then a **gap**, then Omam Water, Vethalai Rasikala Paakku
- 🛍️ Kattu Saatham, 12:00 PM, 100 people: Puli Saatham, Curd Saatham, Podi Idly, Water Bottle, Spoon, Carry Bag

Dish counts per session, which must match F07: 10, 16, 5, 6, 25, 12, 23, 6, 14, 16, 6. Rates are as in section 0.

**Brand defaults:**
- Dream Light Event Management, monogram DL, logo `'brand/logo.png'`, colour #2D5A12, headerStyle 'texture'
- Titles: client "Marriage Proposal\nQuotation", chef "Catering Menu\nPrice Request"
- Contact: Akash R, 8122831347
- chefNote: "Please review the menu below for an upcoming wedding. Kindly share your best rate per leaf for each session. Write your rates in the price sheet on the last page and send it back to us."
- clientIntro: "Thank you for considering Dream Light Event Management. Please find our proposed menu and quotation below."
- paymentTerms: 3 lines (50% advance to confirm; balance one day before the event; rates per leaf, GST extra if applicable)

**`dishLibrary.ts`:** every seeded dish plus about 60 common Tamil Nadu wedding dishes, with categories. Include aliases, for example:
- Mini Badusha: ['badusha', 'bahadur shah', 'balushahi']
- Jilebi: ['jalebi']
- Medhu Vadai: ['medu vada']
- Poori: ['puri']
- Idiyappam: ['idiappam']
- Sambar: ['sambhar']

### `src/lib/format.ts`
- `formatINR(n)` is hand-written, not Intl, so it is deterministic: 600000 → `₹6,00,000`, 31200 → `₹31,200`. `formatNumberIN(n)` is the same without the ₹.
- `periodFor('3:30 PM')`: before 12:00 Morning; 12:00–14:59 Afternoon; 15:00–18:59 Evening; 19:00 and later Night. This reproduces every label in the sample.
- `timeLabel(s) = (s.period ?? periodFor(s.time)) + ' ' + s.time`
- `peopleLabel`: 'Unlimited' or '100 People'
- `ddmmyyyy(iso)`: '24-02-2027'
- `eventDatesText`: '24-02-2027, 25-02-2027 & 26-02-2027'
- `shortRange`: '24 – 26 Feb 2027'
- `dayPill`: '24 Feb'
- `sanitizeFileName`

## 4. Routes (HashRouter, `base: './'`)

| Path | Screen | Owner |
|---|---|---|
| `/` | F01 Events (search, status filter chips, cards with Days / Sessions / Total) | C |
| `/new` | F02 New event (name, From, To, location, client phone, start from copy / template / blank) | C |
| `/event/:eventId` | redirect → `chat` if a key or proxy is available, else `menu` | A |
| `/event/:eventId/chat` | F03 chat; F04 = the same screen with a pending ProposalCard (bottom bar becomes "Change something" / "Add to menu") | D |
| `/event/:eventId/menu?day=<dayId>` | F07 | C |
| `/event/:eventId/details` | edit details (F02 form in edit mode, "Edit details" link) | C |
| `/event/:eventId/session/:sessionId` | F08 | C |
| `/event/:eventId/session/:sessionId/add-dish` | F09 | C |
| `/event/:eventId/pdf?v=client\|chef` | F05 | C |
| `/event/:eventId/pdf/share?v=` | F06 bottom sheet over F05 (nested route) | C |
| `/event/:eventId/history` | F10 | C |
| `/settings` (+ `/brand`, `/terms`, `/backup`, `/library`) | F11 and sub-pages | C |
| `/settings/assistant` | API key, model, proxy status, "Test connection", voice language | D |
| `/view?d=<lz>` | read-only shared quote ("Copy view-only link") | C |

"+ Add session" calls `addSession(… {name:'New session', icon:'🍽️', people:100, pricing:{mode:'perLeaf',rate:null}})` and then navigates to its F08 route.

**Responsive behaviour.** Use Tailwind breakpoints `md` (768) and `lg` (1024).
- **Below 768:** match the designs exactly. Single column, bottom action bars, 44 px minimum touch targets.
- **768–1023 (820 tablet):** content `max-w-2xl mx-auto`. F07 sessions become a 2-column grid. BottomSheet becomes a centred dialog. Bottom bars stay sticky.
- **1024 and above:** `EventShell` becomes a 2-pane grid `[minmax(420px,1fr)_minmax(480px,1.1fr)]`.
  - Left pane: tabs (Ask Claude | Menu) plus nested routes (session edit and add dish render in the left pane).
  - Right pane: `LivePreviewPane`, a sticky Client/Chef switch plus `PdfPages`, regenerated 800 ms after the last change.
  - The PDF tab is hidden; the `/pdf` route stays reachable for Download/Share.
  - Events list becomes a 3-column grid. Settings shows the F11 preview card beside the form.

## 5. PDF spec (B)

### API
```ts
generatePdf(event: CateringEvent, brand: BrandSettings, version: PdfVersion, opts?: { assetBase?: string }): Promise<Blob>
pdfFileName(event, version) // `${sanitize(event.name)} – Quotation.pdf` | ` – Chef Price Request.pdf` (U+2013 with spaces)
renderPdfBuffer(...)        // node/tests: uses renderToBuffer
registerPdfAssets({ fontsBase, emojiBase, imagesBase })   // idempotent
```

**Lazy loading.** `src/pdf/index.ts` is only reached through `import('../pdf')`. Neither react-pdf nor pdfjs goes in the main chunk.

**`registerPdfAssets`** does three things:
- `Font.register({ family:'Poppins', fonts:[{src: fontsBase+'Poppins-Regular.ttf', fontWeight:400},{src: …'Poppins-Bold.ttf', fontWeight:700}] })`
- `Font.registerHyphenationCallback(w => [w])`. **Required**: without it react-pdf hyphenates dish names.
- `Font.registerEmojiSource({ format:'png', url: emojiBase })`. Files are named without fe0f, which matches react-pdf's default codepoint stripping.

In the browser, the base is `new URL('fonts/', document.baseURI).href`. In node, it is the absolute path `path.resolve('public/fonts') + '/'`.

**`buildPdfModel(event, brand, version)`** produces a view model. The chef model **type has no price fields at all**, so prices cannot leak into the chef PDF; a test checks this.

### Emoji files (twemoji, `public/emoji/`)
- **Sample icons:** 1f37d (🍽️), 1f35b (🍛), 2615 (☕), 1f964 (🥤), 1f319 (🌙), 1f305 (🌅), 1f372 (🍲), 1f6cd (🛍️)
- **Icon picker extras:** 1f963, 1f957, 1f958, 1f371, 1f35a, 1f368, 1f370, 1f36e, 1f375, 1f9c3, 1f95b, 1f389, 1f31e, 1f307, 1f34c, 1f965, 1f36a, 1fad3, 1f382, 2600 (☀️)

All of these are present in emoji-datasource-twitter 16; 1f37d, 1f6cd and 2600 carry a `-fe0f` suffix in the source and are renamed. `src/lib/emoji.ts` (A) exports `ICON_SET` with labels and `emojiFileName(char)`. `EmojiIcon` renders `<Image src={emojiBase+file}>`, sized to the font size, for session icons. This is more reliable than inline emoji replacement. Emoji typed inside dish text are covered by the emoji source.

### Measurements from the sample PNGs
1 px = 0.899 pt. Sizes are from width-fitting against the real fonts.

**Page**
- A4, padding: top 22, sides 30, bottom 30.
- Page 1 header band is full-bleed, 128 pt tall (negative margin, or render it outside the padded View).

**Header**
- Background: `headerStyle` 'texture' uses header-texture.jpg with objectFit cover. 'tint' uses an Svg LinearGradient from mix(brand, white, 0.80) to mix(brand, white, 0.92).
- Logo at left 49, top 28, width 26.
- Title: Poppins Bold 25 pt, lineHeight 1.1, brand colour, centred, uppercase, split on '\n'. Cap top at about 33 pt.
- Business name: Helvetica 8 pt, brand colour, about 6 pt below the title.

**Intro**
- Starts 18 pt below the band. Helvetica 9 pt, lineHeight 1.85, colour #222.
- Chef version: "Dear Chef," + chefNote.
- Client version: "Dear {clientName || 'Sir/Madam'}," + clientIntro.
- About 14 pt gap between the two paragraphs.

**Event Information box**
- marginTop 16, height 43, bg #EBEBE9, radius 6, paddingLeft 15.
- "Event Information": Poppins Bold 14, brand colour, vertically centred.
- Below it, a 2-column grid (50/50), marginTop 10. Labels Helvetica-Bold 9 ("Event Dates:", "Event Location:"), values Helvetica 9.
- The client version adds a second row, "Client Name:" / "Client Phone:", only when filled. **The chef version never shows client fields.**

**Menu Details**
- marginTop 18, marginBottom 8. 🍽️ icon at 15 pt, then "Menu Details" in Helvetica-Bold 15 pt, #111.

**Day bar**
- Height 21, bg brand, radius 2, paddingLeft 9, marginTop 12 (except the first), marginBottom 7.
- White pill: "Day 1" in Helvetica-Bold 10 pt, brand colour, padding 1×6, radius 2.
- Then 8 pt space, the date (ddmmyyyy) in Helvetica-Bold 10 pt white, then " — {title}" in Helvetica 10 pt white.

**Session card**
- bg #F5F5F3, left border 2 pt in brand colour, radius 3, padding: top 8, right 8, bottom 8, left 14. marginBottom 9.
- Title row: EmojiIcon 10 pt, then name in Helvetica-Bold 11 pt #111, then 6 pt gap, then meta in Helvetica-Bold 7 pt brand colour.
- Meta text: `"100 People  •  Morning 8:00 AM"`. If people is unlimited and time is empty, it reads just "Unlimited".
- Client version: meta appends `•  ₹260/leaf` (Rupee component). A right-aligned Helvetica-Bold 10 pt brand-colour session total (`₹31,200`) sits on the title row. Excluded sessions show "Not included" and missing rates show "Rate to be confirmed" in #A1281A.
- Title baseline to first dish row: 19 pt.

**Dish columns** (`DishColumns` + `layout.ts`)
- `segmentEntries(entries)` splits entries into segments at each gap or heading.
- For each segment of n dishes: `perCol = ceil(n/3)`; column c gets `items.slice(c*perCol, (c+1)*perCol)`. This is column-major, and I verified it against all 13 groups in the sample.
- 3 columns, each one third of the content width (about 170 pt). Each dish row is 15.5 pt high: a bullet (a 2.6 pt black circle View, or "•" in 7 pt) at x 0, text in Helvetica 9 pt #222 at x 10.5.
- Heading (e.g. "Live Stall"): Helvetica-Bold 8.5 pt, underlined, #111, marginTop 6, marginBottom 3, starting at the card's left content edge.
- Gap: marginTop 6, marginBottom 6, a 0.75 pt dashed line in #D6D6D1 across the full card content width.

**Page-break rules**
- Session card: `wrap={false}` when it has 45 entries or fewer; otherwise allow it to wrap.
- **The day bar and its first session card go together inside one `View wrap={false}`.** The same applies to "Menu Details", the Day 1 bar and the first card. A day header is never orphaned. This reproduces the sample, where Day 3 starts page 3.
- Client version: after each day's last card, a subtotal row ("Day 2 subtotal" / ₹2,15,000, Helvetica-Bold 9, top border 0.75 #E3E3DF) shares a `wrap={false}` group with that card.
- With the seed, the chef PDF must come out at **4 pages**, like the sample. The menu takes 3 pages and the price sheet 1.

**Chef: last page, "Price Sheet (To be filled by Chef)"** (`break`)
- Title box as in Event Info (42 pt tall, Poppins Bold 14). Table marginTop 10.
- Columns as percentages of the 535 pt content width: Session 34%, Time 23%, People 11% (centred), Rate per Leaf (₹) 16%, Total (₹) 16%.
- Header row: 21 pt, bg #EBEBE9, Helvetica-Bold 8.
- Day row: 18 pt, bg #F0F0EC, Helvetica-Bold 8 in brand colour, text "Day 1 — 24-02-2027 (Viratham & Reception)".
- Session rows: 23.5 pt, Helvetica 8. Session cell is EmojiIcon 8 pt + name; Time cell is timeLabel (or 'Unlimited'); People cell is the number or 'Unlimited'. Rate and Total cells are **empty**, each with a 0.75 #E3E3E0 left border. Bottom border 0.75 #D8D8D4. Rows `wrap={false}`.
- Below the table (marginTop 22, rows about 24 pt apart), Helvetica-Bold 9 labels each followed by a 0.75 #333 underline about 195 pt long: "Grand Total (₹):", then "Notes / Extra Charges:" (line about 350 pt). Then a full-width 0.75 #555 rule. Then "Chef / Caterer Name:", "Contact Number:", "Signature & Date:".
- **SignOff:** marginTop 28. "Thank you. We look forward to your quote." (Helvetica 9). Then `${contactName} (${businessName})` and the phone, both Helvetica-Bold 9, 4 pt apart.

**Client: last page, "Cost Breakdown"** (`break`)
- Same title box and table styling.
- Columns: Session 40%, People 14% (centred), Rate per Leaf (₹) 18% (right-aligned), Total (₹) 18% (right-aligned), plus 10% padding.
- Day rows as in the chef sheet. Session rows show `₹260`, `₹31,200`. Excluded rows show "—" and "Excluded"; missing rates show "TBC".
- A day subtotal row after each day (bold, bg #F7F7F5).
- Grand Total row: bg brand, white Helvetica-Bold 10, e.g. `₹6,06,200`.
- Note line (Helvetica 8, #555): "Excluding Evening Beverages". This lists excluded session names joined with ", " and " & ". If rates are missing, add "Rates to be confirmed for: …".
- Then "Payment Terms" (Poppins Bold 12, brand colour) with each line as a bullet (Helvetica 9).
- Then SignOff with the text "Thank you. We look forward to serving you."

**Rupee.** `<Money value>` renders `<Text><Text style={{fontFamily:'Poppins'}}>₹</Text>{formatNumberIN(v)}</Text>`. The headers "(₹)" use the same component.

### Preview
- `pdfjs.ts` imports `pdfjs-dist/legacy/build/pdf.mjs` and sets `GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href` (or `?url`).
- `PdfPages({ blob, mode: 'single' | 'scroll', page, onNumPages })` renders each page to a canvas at width × devicePixelRatio (capped at 2). It keeps the previous canvas until the new render is ready, so there is no flicker.
- `usePdfBlob(eventId, version, debounceMs)` returns `{ blob, url, loading, error, numPages }`. The same Blob is used for preview and download.

## 6. Claude assistant spec (D)

### Client (`client.ts`)
- `getClient()`:
  - If `assistant.proxy !== 'off'` and `GET ./api/claude` returns `{ok:true}` (checked once per session): `new Anthropic({ apiKey: 'proxy', baseURL: new URL('./api/claude', location.href).href.replace(/\/$/,''), dangerouslyAllowBrowser: true })`.
  - Otherwise use the saved key with `dangerouslyAllowBrowser: true`.
  - With neither, show the `SetupCard`.
- Request: `client.messages.create({ model: settings.model ('claude-sonnet-5-5'), max_tokens: 2048, system, tools, tool_choice: {type:'auto'}, output_config: {effort:'low'}, cache_control: {type:'ephemeral'}, messages })`.
- Send `output_config.effort` only when the model id matches `/(opus|sonnet|haiku)-5|fable/`. Use SDK `maxRetries: 2` and `timeout: 60_000`.

### Proxy (`api/claude.ts`, Vercel)
- `GET` returns `{ok:true}`. `POST` forwards the body to `https://api.anthropic.com/v1/messages` with `x-api-key: process.env.ANTHROPIC_API_KEY` and `anthropic-version`.
- Hardening: checks `Origin` against `ALLOWED_ORIGIN`, clamps `max_tokens` to 4096, allowlists models.
- `vercel.json` rewrites `/api/claude/(.*)` → `/api/claude`, because the SDK posts to `{baseURL}/v1/messages`.

### Context (`context.ts`)
Compact text, about 2.5 K tokens for the seed, at most 12 KB. Ids are real store ids.
```
EVENT "Thara Wedding" | location Avadi | client - | status draft | total ₹6,00,000
DAY d_abc 2027-02-24 "Viratham & Reception" (Day 1)
 SESSION s_123 🍽️ "Viratha Tiffin" | 8:00 AM | 100 people | ₹150/leaf = ₹15,000
  dishes: Ashoka Halwa; Thattu Idly; …; [gap]; [heading: Live Stall]; Fruit Salad
```

### System prompt (`systemPrompt.ts`, static, so it caches)
1. **Role:** assistant to a catering manager in Tamil Nadu who edits wedding menus. Users write or speak English, Tamil or Tanglish. Include a glossary: pannu = do, remove pannu, add pannu, X ku pathila Y = replace X with Y, aprom = after, per = people, ilaiku / leaf rate = per-leaf rate, naal = day, kaalai / madhiyam / maalai / iravu = morning / afternoon / evening / night, aakku = make it.
2. **Edits only through tools.** Never claim a change without a tool call. Use only ids from the latest `<event>` block. Refer to dishes by their exact name in the session.
3. **Dish names:** English transliteration in Title Case. Prefer the exact library spelling. When the user's wording differs and you map it to a library dish, set `heard_as` to the user's wording (e.g. "Mini Bahadur Shah" → "Mini Badusha"). Never output Tamil script.
4. **New session:** always `propose_new_session`; it is never applied directly. Removing a session or day: `propose_removal`.
5. **Numbers:** "₹100" is the rate per leaf. "200 per" / "200 people" is people. Rates are integers in rupees.
6. **Ambiguity** (e.g. "lunch" exists on two days): ask one short question and make no tool call.
7. **Replies:** 1–2 short plain sentences, no markdown or tables. The app shows the change list itself.
8. Then: `<dish_library>` with names and aliases, one per line (about 1.5 K tokens; the cache breaks only when the library changes).

### Tools
All tools use `strict: true` and `additionalProperties: false`. Optional parameters are expressed as `["type","null"]` and listed in `required`. If the API rejects a schema, drop `strict` and rely on zod. Every input is re-validated with zod in the executor.

| tool | input | maps to |
|---|---|---|
| add_dishes | session_id, dishes:[{name, heard_as\|null}], after_dish:string\|null | addDishes |
| remove_dishes | session_id, dishes:string[] | removeEntry × n |
| replace_dish | session_id, old_dish, new_dish, heard_as\|null | renameEntry |
| move_dish | session_id, dish, after_dish\|null | moveEntry |
| add_gap_line | session_id, after_dish | addEntry {gap} |
| add_heading | session_id, text, after_dish\|null | addEntry {heading} |
| set_people | session_id, people: integer\|"unlimited" | setPeople |
| set_rate | session_id, rate_per_leaf: integer\|null | setRate |
| set_pricing | session_id, mode: perLeaf\|fixed\|excluded, amount:integer\|null | setPricing |
| update_session | session_id, name\|null, icon\|null, time\|null | updateSession |
| move_session | session_id, day_id, after_session_id\|null | moveSession |
| update_event_details | name, client_name, client_phone, location (all nullable) | updateEventDetails |
| add_day / update_day | date, title / day_id, date\|null, title\|null | addDay / updateDay |
| set_event_status | status | setEventStatus |
| update_brand | brand_color, business_name, contact_name, contact_phone (nullable) | updateBrand (in-chat undo keeps the previous value) |
| propose_new_session | day_id\|null, new_day:{date,title}\|null, after_session_id\|null, name, icon, time, people, rate_per_leaf\|null, dishes:[{name, heard_as\|null}] | **no mutation**; ProposalCard |
| propose_removal | target:"session"\|"day", id, reason | **no mutation**; confirm card |

### Turn loop (`useAssistant.ts` / `conversation.ts`)
1. A user turn gets `batchId = 'claude-'+turnId`. On the first turn, or when the event version changed outside chat, the user content starts with `<event>…</event>`. Content is append-only.
2. Call the API. If `stop_reason === 'tool_use'`, execute **all** tool_use blocks in order against the store with `{author:'claude', batchId}`. Send back **one** user message containing all tool_results:
   - success: `ok` plus the session's new dish list
   - error: `is_error:true` with a message (e.g. "No dish 'Vada Curry' in s_123; dishes are …")
   Loop at most 5 times.
3. When a propose_* tool appears: execute the other calls, render the card, and **do not call the API again**. Store the pending `tool_result`s (text: "Shown to user, awaiting decision").
   - On "Add to menu": `transaction(addSession/addDay … {author:'claude', title:'Added Vilayadal Evening (Snacks)'})`, using the spelling choices the user picked. Set the pending result to "User confirmed; added as s_xyz".
   - On "Change something": set it to "User wants changes; nothing added" and focus the input.
   - The pending tool_results are prepended to the next user message's content.
4. After the loop, show `ChangeSummaryCard` from the batch's HistoryEntry:
   - "Day 1 · Viratha Tiffin · 100 people" header
   - −/+ rows
   - Undo (`store.undo(historyId)`) and "See in menu" (`/menu?day=`)
   - footer "Total unchanged · ₹6,00,000" or "Total ₹5,80,000 → ₹6,00,000"
5. **Spelling** (`spelling.ts`): for each new dish without `heard_as` that is not in the library (case- and alias-insensitive), look for a local `similarity()` match of 0.8 or higher and show a suggestion. Both kinds of suggestion render F04's amber card ("You said …. Did you mean …?" with "Yes, X" / "Keep as typed"). After "Keep as typed" on Add, call `addLibraryDish` with category 'Misc'.

### Cost control
- effort low, max_tokens 2048, cached system and tools, compact context.
- Start a **fresh conversation** (new messages array, new snapshot) after 8 user turns, or when the estimated input exceeds 25 K characters × 0.3 tokens. The UI shows a subtle "Started a fresh thread". History is never trimmed in place.
- Show token usage per turn in a debug line on Settings → Assistant.

### Errors (typed, most specific first)
- `!navigator.onLine` → "You're offline — use Menu to edit."
- `Anthropic.AuthenticationError` (401) → "Key not accepted" plus a link to Settings
- `PermissionDeniedError` (403) → same
- `RateLimitError` (429) → "Claude is busy, try again in a minute" (after the SDK retries)
- `InternalServerError` / status 529 → same
- `APIConnectionError` → Retry button that resends the same pending request
- `BadRequestError` → generic message and `console.warn` with the request id
- `stop_reason 'refusal'` → "I can't help with that one."
- `stop_reason 'max_tokens'` → do not run truncated tool calls; ask the user to split the request

### Voice (`speech.ts`)
`useSpeech(lang)` uses `window.SpeechRecognition || webkitSpeechRecognition` with `interimResults` and `continuous: false`; the transcript fills the input and the user taps send. If it is unsupported, the mic button opens a tip: "Use your keyboard's mic key". It also handles `not-allowed` and `no-speech` errors. Settings has an English/Tamil toggle (en-IN / ta-IN).

**Quick chips (F03):** "+ New section" pre-fills a prompt; "Client PDF" and "Chef PDF" navigate to `/pdf?v=`.

## 7. Testing plan

### Vitest
Default environment jsdom. PDF tests use `// @vitest-environment node`.

**A: `store/__tests__`**
- **format:** ₹6,00,000; ₹31,200; ₹12,34,567; 0; `periodFor` for all 11 seed times.
- **seed fidelity:** a fixture of rows built from sample.txt equals `splitColumns` output rendered row-major, for every session. Dish counts match F07.
- **math:** grand total 600000; day totals [350000, 215000, 35000]; beverages excluded. After `setPeople(brunch,120)` and `setRate(260)`: 31200, 41200, 606200. Null rate shows up in `missingRates`; unlimited with perLeaf → null.
- **history:**
  - each action adds 1 entry with the expected details
  - `transaction` and batchId merges produce 1 entry
  - undo of the latest entry deep-equals the before state
  - undo of an older entry keeps later unrelated edits
  - a conflict is counted
  - redo works
  - cap of 200
- **migrations:** v0 fixture → v1; library merge.
- **backup:** `importBackup` rejects garbage; the export round-trips; the API key is never present.

**B: `pdf/__tests__`**
- **model:** the chef model JSON has no `rate`, `amount` or `total` keys; columns are column-major.
- **render:** `registerPdfAssets` with file paths, then `renderToBuffer`, then `test/helpers/pdfText.ts`. That helper uses the pdfjs legacy build in node and returns `{pages: string[]; all: string}`, with whitespace normalised and `₹\s+` collapsed to `₹`.
  - **Chef:** 4 pages. Contains "CATERING MENU", "PRICE REQUEST", "Dear Chef", "Price Sheet (To be filled by Chef)", "Rate per Leaf (₹)", every seed dish, "Akash R (Dream Light Event Management)", "8122831347". `!/₹\d/.test(all)`. Page 3 starts with Day 3. A client name set in the event does not appear.
  - **Client:** "MARRIAGE PROPOSAL", "QUOTATION", "Cost Breakdown", "₹6,00,000", "Excluding Evening Beverages", the payment terms, and client name/phone when set.
  - **Scenario state:** "₹31,200", "₹41,200", "₹6,06,200", "Samosa".
- **fonts:** fontkit opens Poppins-Bold and asserts `hasGlyphForCodePoint(0x20B9)`.
- **filename:** "Thara Wedding – Quotation.pdf".
- `scripts/render-pdf.mts <outDir>` writes both PDFs so they can be compared by eye with the sample PNGs, e.g. `pdftoppm -r 80`.

**D: `assistant/__tests__`**
- Executor: each tool changes the store as expected. Name resolution is case-insensitive. An unknown dish returns `is_error`. propose_* does not mutate. Confirm applies one history entry with author claude.
- Context: snapshot of the seed context, size under 12 KB.
- Loop: inject a mock `fetch` into the SDK client. A tool_use response is followed by a single tool_result message, then end_turn. A propose call pauses the loop, and the pending results are prepended to the next turn.
- Errors: mock 401 and 429 responses map to the right UI messages.
- Spelling: "Mini Bahadur Shah" → "Mini Badusha" through aliases.

### E2E (C): `e2e/scenario.cjs`
Setup: `npm run build && npx vite preview --port 4173 --strictPort` (in the background), then `NODE_PATH=/opt/node22/lib/node_modules node e2e/scenario.cjs`. The script uses `require('playwright')` and Chromium.

For each viewport in [390×844 (isMobile, hasTouch, DPR 3), 820×1180, 1366×768], open a fresh context with `acceptDownloads`. Fail on any `console.error` or `pageerror`.
1. `goto http://localhost:4173/#/`. Click the card "Thara Wedding". Open the tab "Menu" (at 1366 it is the left pane).
2. Click the "24 Feb" pill. Open "Viratha Tiffin". The dish list contains Poori Masala Kilangu and Ashoka Halwa and **not** Vada Curry or Carrot Halwa. Go back.
3. Click "25 Feb", open "Vilayadal Evening", tap "+ Add dish", type "sam", tap "Samosa", tap "Done · 1 added". Assert "Dishes (7)" and "Samosa". Tap "Done".
4. Click "26 Feb", open "Brunch".
   - At 390: tap "More people" twice and "Higher price" once.
   - At other sizes: fill the `People` input with 120 and the `Price per leaf` input with 260.
   - Assert "Session total" shows ₹31,200. Tap Done. Grand total shows ₹6,06,200; the day pill shows ₹41,200.
5. Open PDF (at 1366, use the live pane and the `/pdf` route). Tap "Client quote" and wait for the `canvas` element. Tap "Download" and capture the download.
   - `suggestedFilename() === 'Thara Wedding – Quotation.pdf'`
   - Save it to `e2e/out/<vp>/` and run `pdfText`: contains Samosa, ₹31,200, ₹41,200, ₹6,06,200.
6. Tap "Chef version", then Download. Filename "Thara Wedding – Chef Price Request.pdf". Contains Samosa and "Rate per Leaf (₹)"; no `/₹\d/`.
7. Open History. Entries appear: "Brunch updated" (People 100 → 120, Rate ₹250 → ₹260) and "Vilayadal Evening (Snacks) updated" (+ Samosa). Tap "Undo this change" on the Brunch entry: the total returns to ₹6,00,000, and the toast offers Redo; tap Redo.
8. Check `scrollWidth <= innerWidth` on every screen. Take full-page screenshots to `e2e/out/<vp>/*.png`. At 1366, assert the preview pane is visible next to the menu.

`e2e/claude-mock.cjs` uses `page.route('**/v1/messages', …)` with canned responses:
- replace_dish × 2 → F03 card with 4 rows, then Undo
- propose_new_session containing "Mini Bahadur Shah" → F04 amber card, then "Yes, Badusha", then "Add to menu" → Day 2 shows the NEW badge

It sets the key with `localStorage.setItem('dl-catering:claude-key','test')`.

### Selector contract (C and D must use exactly these accessible names)
- Tabs: "Ask Claude", "Menu", "PDF"
- Day pills: "24 Feb" etc.
- Session rows: links whose accessible name includes the session name
- Steppers: "Fewer people", "More people", "Lower price", "Higher price"
- Inputs: labels "People" and "Price per leaf" (the value becomes an inputmode=numeric field on tap)
- Buttons: "+ Add dish", "+ Gap line", "Done", "Client quote", "Chef version", "Download", "Share", "Undo this change", "Redo", "Add to menu", "Change something"
- Search input label: "Search dishes"
- Grand total: `data-testid="grand-total"`

## 8. Risks and mitigations

1. **react-pdf with Vite:** large bundle, ESM quirks, and worker-less layout on the main thread.
   - Load lazily with `import()`. Set `optimizeDeps.include: ['@react-pdf/renderer']` and `build.target: 'es2022'`.
   - Debounce generation to 800 ms and show a spinner. If generation exceeds 1.5 s on low-end Android, generate only when the user is on the PDF tab or live pane.
   - Register the hyphenation callback (otherwise dish names get split).
   - Never pass a CSS gradient (unsupported); use Svg.
   - ₹ must use Poppins through `Rupee`.
   - If `fontWeight` lookup fails, register Poppins-Bold as a separate family 'PoppinsBold'.
2. **pdfjs worker under `base: './'`:** use `new URL(..., import.meta.url)` or `?url` so Vite emits a hashed asset with a relative path. Use the **legacy** build for older iOS Safari. Pin pdfjs-dist and verify that the worker version matches the API version at runtime.
3. **Emoji:** react-pdf strips fe0f by default, so files are stored without it. Session icons are explicit `<Image>`s, so they do not depend on emoji regex detection. Unknown emoji typed by the user fall back to the 🍽️ icon in the PDF (`emojiFileName` returns null → default). The PWA service worker precaches the emoji folder.
4. **Non-Latin text:** Helvetica has no Tamil glyphs. Detect `/[^\x00-ɏ–-…₹]/` in dish names and show a warning on F08/F09 ("PDF supports English letters only"). Claude is told to transliterate.
5. **localStorage loss** (Safari ITP 7-day eviction, cleared browser data, about 5 MB quota):
   - Call `navigator.storage.persist()`. Encourage Add to Home Screen; installed PWAs are exempt from ITP.
   - Backup reminder banner after 25 changes. Export downloads `dl-catering-backup-YYYY-MM-DD.json`; Import supports merge or replace.
   - The diff-based history keeps size small. Catch `QuotaExceededError`, trim history to 50 per event, and show a toast.
   - Keep the logo data URL at 200 KB or less (resize in the browser with a canvas on upload).
6. **iOS download:** in a Safari tab, `<a download>` with a blob URL works on iOS 13+, but inside the installed PWA it opens a viewer with no way back.
   - When `navigator.standalone` or `matchMedia('(display-mode: standalone)')` is true and `navigator.canShare({files})` is supported, "Save to phone" uses `navigator.share({files:[new File([blob], name, {type:'application/pdf'})]})`.
   - Revoke blob URLs after 60 s.
   - WhatsApp: use `share({files, text})` when available; otherwise download, then open `https://wa.me/91{clientPhone}?text=…` (no number for the chef version).
7. **Web Speech:** missing in Firefox and in some iOS standalone contexts, and it needs HTTPS (GitHub Pages provides it). Feature-detect, hide the mic or show the keyboard-dictation tip, and handle permission denial. Tamil (ta-IN) returns Tamil script, which Claude transliterates.
8. **Browser API key exposure:** the key stays on the device, is excluded from backups and share links, and is masked in Settings with a "Remove key" option. The optional proxy is preferred.
9. **Sonnet 5.5 API constraints:** no forced tool choice, no disabled thinking, and append-only history. These are already designed in. Keep `model` configurable and send `effort` only to models that support it.
10. **View-only link size:** lz-string of the event is about 3 KB, which is fine for WhatsApp. Strip history and brand logo, and include brand colour and titles only.
11. **Service worker staleness** (vite-plugin-pwa): use `registerType: 'prompt'` with an "Update available — Reload" toast. Hash routing means no 404 fallback is needed on GitHub Pages.
12. **Parallel-agent integration:**
    - A must land `types.ts`, the store, selectors, format, the UI primitives, EventShell and the stubs **before** B, C and D start.
    - B exposes only `src/pdf/index.ts`, `PdfPages` and `usePdfBlob`.
    - D exposes only the `ChatScreen` and `AssistantSettingsScreen` default exports.
    - C owns `fuzzy.ts`, which D consumes.

### Critical Files for Implementation
- /home/user/catering-quotation-web-app/src/types.ts
- /home/user/catering-quotation-web-app/src/store/index.ts (with /home/user/catering-quotation-web-app/src/store/history.ts)
- /home/user/catering-quotation-web-app/src/data/seed.ts
- /home/user/catering-quotation-web-app/src/pdf/QuotationDocument.tsx (with /home/user/catering-quotation-web-app/src/pdf/model.ts)
- /home/user/catering-quotation-web-app/src/assistant/executor.ts (with /home/user/catering-quotation-web-app/src/assistant/tools.ts)

Reference inputs: /home/user/catering-quotation-web-app/docs/reference/sample-pdf/{sample.txt,page-1..4.png,Catering_Menu_Chef_Price_Request.pdf} and /home/user/catering-quotation-web-app/docs/reference/designs/F01–F11.
