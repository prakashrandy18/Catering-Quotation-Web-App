# Catering Quote — Dream Light Event Management

A mobile-first web app to edit catering menus and send quotation PDFs:

- **Quote for client** — menu with prices, day subtotals, grand total and payment terms.
- **Copy for chef (no prices)** — same menu with a blank price sheet, to ask chefs for their rates.

It works on phones, tablets and laptops. There is no login. Events are saved **on the device's browser**, so use
**Save backup** now and then (Events home → Save backup).

## For the owner — everyday use

1. Open the app link on your phone in Chrome. After a couple of uses it offers **Add to home screen**. Do it, so the app
   opens like a normal app and the browser keeps its data.
2. Tap your event → **Menu** to change dishes, people or prices, or **Chat** to tell Claude what to change in
   Tamil/English ("Viratha tiffin la vada curry remove pannu, poori masala kilangu add pannu").
   Claude always shows what it will change and waits for **Yes, do it**.
3. Tap **PDF** → choose **Quote for client** or **Copy for chef** → **Send** → **Send on WhatsApp**.
4. Made a mistake? Every change can be undone from the **Undo** button or the clock icon (Recent changes).
5. **Settings** (gear on the Events home): logo, colours, PDF titles, contact number, payment terms, note to chef,
   Claude key, backup / restore.

### Turning on the Claude assistant
Get an API key at <https://console.anthropic.com> → API keys, then open **Settings → Claude assistant**, paste it and
tap **Test connection**. The key stays on that phone only (it is never put in backups). See
[`docs/CLAUDE_ASSISTANT.md`](docs/CLAUDE_ASSISTANT.md) for the optional server proxy.

## For developers

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # production build in dist/
npm run e2e        # end-to-end scenario (needs `npm run build` and Playwright's Chromium)
```

Stack: Vite 6, React 18, TypeScript, Tailwind CSS 3, zustand (persisted to localStorage with undo history),
@react-pdf/renderer (PDF generated in the browser), pdf.js (preview), @anthropic-ai/sdk (assistant), HashRouter.

Deployment: every push to `main` runs `.github/workflows/deploy.yml` (typecheck → tests → build → GitHub Pages).
In the repository settings, set **Pages → Source: GitHub Actions** once.

Docs: [`docs/UX_REVIEW.md`](docs/UX_REVIEW.md) (usability decisions), [`docs/ARCHITECTURE_PLAN.md`](docs/ARCHITECTURE_PLAN.md),
[`docs/AGENTS_BRIEF.md`](docs/AGENTS_BRIEF.md), reference designs and the sample PDF in [`docs/reference/`](docs/reference/).

Emoji graphics in PDFs: Twemoji by Twitter, CC-BY 4.0.
