# Brief for implementation agents (read fully before coding)

Repo: `/home/user/catering-quotation-web-app` (Vite 6 + React 18 + TypeScript 5.8 + Tailwind 3 + zustand 5).
Product: a mobile-first web app for a **non-technical** catering manager (Dream Light Event Management, Tamil Nadu)
to edit wedding menus and send quotation PDFs (client copy with prices, chef copy without prices). Hosted as a static
site (GitHub Pages, HashRouter, `base: './'`). No login; data lives in this browser (localStorage).

## Read first
- `docs/UX_REVIEW.md` — binding UX decisions + acceptance criteria (copy, sizes, contrast, safety).
- `docs/ARCHITECTURE_PLAN.md` — detailed plan. The **lead overrides at the top win** where they differ.
- `docs/reference/designs/F01…F11*.dc.html` — screen mockups (read markup/inline styles for intent; ignore `<x-dc>`, `{{…}}`, `sc-for` syntax).
- `docs/reference/sample-pdf/` — the PDF to reproduce (page-1..4.png, sample.txt, the PDF itself).
- Foundation code (do not modify, import it): `src/types.ts`, `src/store/useAppStore.ts`, `src/store/toast.ts`,
  `src/lib/{format,calc,search,theme,fileShare,backup,id}.ts`, `src/data/{seed,dishLibrary}.ts`,
  `src/components/ui/*`, `src/components/EventLayout.tsx`, `src/App.tsx`, `src/index.css`, `tailwind.config.js`.

## Hard rules
1. **Only create/edit files you own** (listed in your task). Never edit foundation files, `package.json`,
   `package-lock.json`, configs, or another agent's files. Other agents are working in the same tree right now.
   If you truly need a foundation change, do NOT make it — describe it precisely in your final report; work around it locally.
2. Do not run `npm install` (all deps are installed: react-router-dom 6, zustand 5, immer 10, @react-pdf/renderer 4,
   pdfjs-dist 4.10, @anthropic-ai/sdk 1.4, zod 4, clsx, @fontsource/*). `npm pack <pkg>` into the scratch dir to extract
   binary assets is fine. The npm registry works; GitHub raw / jsDelivr are blocked.
3. Use the store only through its actions (`useAppStore`), so every change is undoable and recorded in history.
   Use `transact(eventId, {by, summary, detail}, recipe)` to group several edits into one undoable change.
4. All copy follows `docs/UX_REVIEW.md` → "Words". Say **Meal** (not session) in the UI, **Blank space** (not gap),
   **Price per plate (leaf)**, **Quote for client**, **Copy for chef (no prices)**, **Not sent / Sent / Confirmed**.
5. Accessibility/readability: body text ≥16px, secondary ≥14px, nothing below 13px; text colours `text-ink`,
   `text-ink-muted` (#4d5348) or `text-ink-faint` (#6b7166) only; every tap target ≥44×44px; visible labels;
   `aria-label` on icon-only buttons; use `<button>`/`<a>` (never clickable divs). Brand colour via Tailwind `brand`
   classes (`bg-brand`, `text-brand`, `bg-brand-soft`, `bg-brand-tint`) — it is user-configurable.
6. Mobile first (390×844), then tablet (≥768: EventLayout already shows the live PDF pane on the right) and laptop.
   No horizontal scrolling at 390px. Bottom content must clear the fixed bottom tab bar (EventLayout adds padding).
7. Indian number format via `formatINR` (₹6,00,000). Dates `DD-MM-YYYY` in data/PDF, "24 Feb" in compact UI.
8. Before finishing: `npx tsc -b --noEmit` must pass for the whole repo (if it fails only because of another agent's
   in-progress file, say so), your vitest tests must pass (`npx vitest run <your paths>`), and `npm run build` must succeed.
   Do not commit — the lead commits.
9. Never put secrets in code. Never log the API key.

## Selector contract (QA automation depends on these exact accessible names / test ids)
- Header (foundation): `data-testid="event-title"`, `data-testid="header-total"`. Tabs: links **Chat**, **Menu**, **PDF**.
  History icon link aria-label "Recent changes and undo".
- Events home: each event card is a link whose accessible name contains the event name; **New event** link;
  **Save backup** / **Restore backup** buttons; settings link aria-label **Settings**.
- New event: labels **Event name**, **From**, **To**, **Location**; start-from radios **Copy an old event** /
  **Wedding template** / **Blank**; submit **Create event**.
- Menu: day buttons whose name starts with the short date (**24 Feb**, **25 Feb**, **26 Feb**); meal rows are links whose
  name contains the meal name; a **Price missing** marker on unpriced meals; `data-testid="grand-total"`; **Add a meal**.
- Meal editor: label **Meal name**; `NumberStepper` labels **People** and **Price per plate (leaf)** (so ± buttons are
  "Less People", "More People", "Less Price per plate (leaf)", "More Price per plate (leaf)");
  `data-testid="session-total"`; **Add dish** link; **Add blank space**; per dish: "Remove <dish>", "Move <dish> up",
  "Move <dish> down"; **Done**; **Remove this meal** (with confirm).
- Add dish: input label **Search dishes**; result buttons named by the dish name; a button whose text starts with **Done**.
- PDF: toggle buttons **Quote for client** / **Copy for chef (no prices)** (`aria-pressed`); **Save PDF**; **Send**
  (opens share sheet with **Send on WhatsApp**, **Save PDF on phone**); missing-price warning buttons **Add price** /
  **Send anyway**; each rendered page canvas has `data-testid="pdf-page"`; banner text "CLIENT COPY — WITH PRICES" /
  "CHEF COPY — NO PRICES".
- History: **Undo this change** buttons; toast action **Redo**.
- Chat: textarea label **Message Claude**; **Send** button; **Speak** mic button; edit preview card buttons
  **Yes, do it** / **No, change it**; new-meal card **Yes, add it** / **No, change it**; spelling card
  **Yes, <suggestion>** / **Keep as typed**; applied result card **Undo** / **Show in menu**.
  Chat route accepts `?draft=<text>` to pre-fill the message box (used by "Change by talking" links on Menu).

## Module boundaries (public APIs)
- PDF module `src/pdf/index.ts`: `generatePdfBlob(event, brand, variant): Promise<Blob>`,
  `downloadPdf(event, brand, variant): Promise<void>`, `sharePdf(event, brand, variant, text?): Promise<ShareResult>`.
  Default exports `src/pdf/PreviewScreen.tsx` (route `pdf`) and `src/pdf/PreviewPanel.tsx` (`{event}` prop, live pane).
- Assistant: default exports `src/assistant/ChatScreen.tsx` (route `chat`) and `src/assistant/AssistantSettingsCard.tsx`
  (embedded by Settings).
- Screens: default exports in `src/screens/*.tsx` as imported by `src/App.tsx`.
