# End-to-end QA suite

Real-life scenarios for the owner's phone (390×844, touch), a tablet (820×1180) and a laptop (1366×768),
run with Playwright + Chromium against the **production build** (`vite preview`).

## Run

```bash
npm run build
LANG=C.UTF-8 LC_ALL=C.UTF-8 npm run e2e
```

`LANG=C.UTF-8` matters: without it, download names containing "–" ("Thara Wedding – Quotation.pdf") come out as "download".

Options (environment variables):

| Variable | Meaning |
|---|---|
| `E2E_URL` | Use an already running server (e.g. `http://localhost:4177/`) instead of starting `vite preview` |
| `E2E_PORT` | Port for the preview server the suite starts (default `4177`) |
| `E2E_ONLY` | Comma-separated scenario ids, e.g. `E2E_ONLY=s2,s3` (s3–s6 build on s2's edits, so include `s2`) |
| `PLAYWRIGHT_PATH` | Where to load Playwright from (default `playwright`, then `/opt/node-tools/node_modules/playwright`) |

Needs `pdftotext`, `pdfinfo`, `pdftoppm` (poppler-utils) to read the downloaded PDFs.

## Scenarios

| id | what |
|---|---|
| s1-phone / s1-tablet / s1-laptop | First open: sample event, New event above the fold, backup card, no console errors, no horizontal scroll |
| s2 | Client phone call: Viratha Tiffin dishes, prices, add Samosa via search, Brunch 120 × ₹260, remove Moru + toast Undo, reorder, blank space, totals |
| s3 | Quote for client → missing-price warning → Send anyway → Send on WhatsApp without Web Share (download + toast); chef copy; PDF text checks |
| s3-share | `navigator.share` mocked: called once with one PDF + message, status becomes Sent |
| s4 | Recent changes: undo newest, Redo, older entry asks for confirmation |
| s5 | Reload persistence; Save backup (no API key inside) → clear storage → Restore; stale backup reminder |
| s6 | New event "Priya Engagement" copied from Thara, re-dated, meal + event renamed, PDF file name follows |
| s7 | Settings: Maroon colour (UI + rasterised PDF), contact phone (chef PDF), payment terms (client PDF only) |
| s8 | Claude chat with the Messages API mocked: preview → Yes → Undo, ask_choice, spelling, totals, 401, 529 + Try again, offline |
| s9 | Offline after one visit (service worker): app loads, Menu edits, PDF generates, chat says "No internet" |
| s10 | Accessibility sweep on 11 screens at 390 (targets ≥44, text ≥13px, contrast ≥4.5:1, no h-scroll) + 200 % text and 320 px reflow |
| s10-keyboard | Laptop: Tab through Chat, visible focus rings, Enter sends |
| s11-tablet / s11-laptop | Main flow at 820 and 1366, live PDF pane next to Menu/Chat updates after an edit, centred share dialog |
| s12 | Reduced motion, focus stays in the share sheet, focus trap, "Add price", install banner after the 2nd share |

## Output (`e2e/output/`, gitignored)

- `summary.md` / `summary.json` — every check with PASS/FAIL, notes and evidence paths
- `*.png` — screenshots per scenario
- `pdf/<tag>/` — each downloaded PDF, its `text.txt` (pdftotext -layout) and `page-N.png` (60 dpi)
- `backup/` — the downloaded backup JSON

Not covered (cannot be verified here): real WhatsApp / Android share sheet, the real Anthropic API, iOS Safari,
voice input (Web Speech API), real "Add to home screen" install.
