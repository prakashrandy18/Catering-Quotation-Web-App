# UX review — decisions adopted

Source: usability review of the 11-screen flow (docs/reference/designs) for a non-technical
event manager in Tamil Nadu on an Android phone. The decisions below are binding for implementation.

## P0 (must ship)
1. **Data safety** — data lives in this browser only. Events home shows a Backup card:
   "Your events are saved on this phone only." → **Save backup** (JSON file via share sheet / download)
   and **Restore backup**. Show "Last backup: N days ago" (amber after 7 days). Call
   `navigator.storage.persist()`. History subtitle says "Saved on this phone".
2. **One safety model for chat** — Claude never changes the menu silently. Every Claude edit is
   shown as a preview card (where: Day + meal; Removed / Added lists; numbers before → after;
   total before → after) with **Yes, do it** / **No, change it**. After applying, an outlined
   **Undo** stays on the card.
3. **Ambiguity** — if a request matches more than one meal or dish, Claude asks with tappable
   choices and changes nothing until one is picked.
4. **Missing prices are visible** — "Price missing" chip on meals without a price (tap → editor).
   Before sharing the *client* quote with missing prices: warning with **Add price** / **Send anyway**.
   Never print ₹0.
5. **Readability** — body text ≥16px, secondary ≥14px, badges ≥13px. No #8a8f85 text. Input /
   radio borders ≥3:1 contrast (#8c9186). WhatsApp button #177A42 with white text.
6. **Which PDF is which** — preview shows a banner: green "CLIENT COPY — WITH PRICES" or amber
   "CHEF COPY — NO PRICES"; file names include the audience; share text names the audience.

## P1
- Voice: mic fills the text box; never auto-send. Example chips: Remove a dish, Add a dish,
  Change people, Change price.
- Phone navigation: bottom tab bar **Chat · Menu · PDF** (icons + labels), back to events at top.
- Numbers (people, price) are typeable with numeric keypad; ± steppers stay as convenience.
- Reorder dishes with up/down arrow buttons (44px).
- Removing a dish shows an Undo toast (role=status, ≥6s).
- Chat result lists say "Removed: …" / "Added: …" in words, not only signs.
- New event "Copy from" lets him pick which old event.
- Events: Duplicate / Delete (with confirm) from a ⋯ menu.

## P2
- "Save 'sam' as a new dish" first suggests close library matches.
- Colour swatches have name labels; Settings has "Preview PDF".
- After a WhatsApp share, mark status Sent automatically (checkbox default on).

## Ease of access
- First open: seeded sample event, no permissions asked. Mic permission only on first mic tap.
- PWA manifest (standalone, 192/512 icons); install banner after 2nd successful share, not on first
  visit; iOS: short "Share → Add to Home Screen" hint.
- Offline: service worker caches app shell + self-hosted fonts + PDF generator. Menu and PDF work
  offline; chat shows "No internet. You can still edit the Menu." and keeps the draft.
- Chat request: "Thinking…" with Cancel, 30s timeout, Try again; never lose the message.
- Share: `navigator.share({files:[pdf], text})` when `canShare({files})`; else download + clear
  next-step message (laptop: "Downloaded. Attach it in WhatsApp Web").

## Words (UI copy)
Session → **Meal**; Add session → **Add a meal**; Gap line → **Blank space**; Price per leaf →
**Price per plate (leaf)**; Session total → **Total for this meal**; Library → **Your saved dishes**;
Client quote → **Quote for client**; Chef version → **Copy for chef (no prices)**;
Draft / Sent / Confirmed → **Not sent / Sent / Confirmed**; Brand & PDF → **Logo & colours**.
Keep dish names exactly as typed/selected (Tanglish). Indian number format ₹6,00,000. Dates DD-MM-YYYY.

## Responsive
- Tablet (≥768px): two panes — Menu (left) + Chat/PDF preview (right). Share sheet = centred modal.
- Laptop (≥1200px): events list · editor · live PDF preview. Enter sends chat, visible focus rings,
  "Save PDF" first and "Open WhatsApp Web" second.

## Accessibility
Targets ≥44×44 with ≥8px spacing; visible labels; aria-label on icon buttons; tablist semantics for
tabs; Client/Chef switch uses radio/aria-pressed; focus ring 2px brand + offset; share sheet traps
focus and Esc closes; respect prefers-reduced-motion (≤200ms transitions otherwise).

## Acceptance criteria (QA, Playwright 390×844 unless stated)
1. Empty storage → Events home with "New event" visible without scrolling; no login prompt.
2. All buttons/links/chips on Events home ≥44×44.
3. At 200% text zoom no horizontal scroll, nothing clipped, primary action reachable.
4. Text contrast ≥4.5:1; body ≥16px; secondary ≥14px.
5. New event → "Copy an old event" → created event has the copied days and meals.
6. Chat "Viratha tiffin la … remove pannu, … add pannu" → preview card names "Day 1 · Viratha Tiffin" with Removed/Added before apply.
7. Ambiguous "lunch" → choices shown, nothing changed until picked.
8. "Mini Bahadur Shah" → "Did you mean Mini Badusha?" → final menu uses the tapped choice.
9. Chat change of count/price → total before and after in ₹ with Indian grouping.
10. Undo on a chat result → dishes and header total return exactly.
11. History "Undo this change" on an entry → toast "Undone: …" with Redo; Redo restores.
12. Meal editor ± on people and price → "Total for this meal" = people × price instantly.
13. Typing 237 in People uses numeric keypad and updates total.
14. Meal with no price → "Price missing" on Menu; client share warns with Add price / Send anyway.
15. Chef preview: no ₹ amounts, price sheet page present. Client preview: prices, day subtotals, grand total.
16. Save PDF downloads "Thara Wedding – Quotation.pdf" / "Thara Wedding – Chef Price Request.pdf"; valid PDF; title matches.
17. With `navigator.share`+`canShare` mocked, Send on WhatsApp calls share once with a PDF file + message, ≤3 taps from Menu.
18. Without file sharing: PDF downloads and a next-step message shows.
19. Reload keeps events, edits and history.
20. Cleared storage + backup file → Restore brings everything back.
21. Last backup >7 days → reminder; after saving shows "Last backup: today".
22. Offline after one visit: Menu and PDF work; chat shows "No internet" and keeps draft.
23. Chat failure/timeout → error + Try again; menu unchanged; message kept.
24. Laptop keyboard: Tab order follows visual order, visible focus ring, Enter sends.
25. prefers-reduced-motion → share sheet has no animation >50ms.
26. Install banner appears only after 2nd share when `beforeinstallprompt` fired; dismissible.
