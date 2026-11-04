# Claude assistant — setup and how it works

The **Chat** tab lets you change a menu by typing or speaking in English, Tamil or Tanglish
("Viratha tiffin la vada curry remove pannu, poori masala kilangu add pannu").

Claude never changes anything by itself. It shows a card first:

- where: "Day 1 · Viratha Tiffin · 100 people"
- **Removed:** / **Added:** dishes, numbers before → after ("People 100 → 120", "Price ₹250 → ₹260")
- the total before → after ("Total ₹85,000 → ₹91,200" or "Total unchanged")

Nothing changes until you tap **Yes, do it** (or **Yes, add it** for a new meal). After that the card
has **Undo** and **Show in menu**. Every change is also in Recent changes (clock icon) and can be undone there.
If Claude is not sure ("lunch" — which day?), it shows buttons to pick from. If a dish name looks
misspelt, it asks "Did you mean **Mini Badusha**?" — tap **Yes, Mini Badusha** or **Keep as typed**;
the app remembers your answer next time.

Without Claude, everything still works by hand on the **Menu** and **PDF** tabs.

---

## Option A — key on this phone (simplest)

1. On a computer, open **console.anthropic.com**, sign in, and add a little credit (Billing).
2. Go to **API keys → Create key**. Copy the key (it starts with `sk-ant-`).
3. In the app: **Settings → Claude assistant → Claude API key**. Paste it, tap **Save**.
4. Tap **Test connection**. A ✓ "Connected" means it works. Status shows **On**.

Good to know:

- The key is saved only in this phone's browser. It is **not** in backups, so on a new phone you paste it again.
- Anyone who can open the app on this phone can use the key. To stop it, tap **Remove key**
  (and you can delete the key at console.anthropic.com any time).
- Set a monthly spend limit at console.anthropic.com → Limits, so costs can never surprise you.

## Option B — key on the server (for a website used by several people)

Use this when the app is hosted on **Vercel**. The key stays on the server; phones need no key.

1. Deploy this repository on Vercel (it reads `vercel.json`: Vite build, `dist/` output, and the
   rewrite that sends `/api/claude/...` to the proxy function `api/claude.ts`).
2. In Vercel → Project → **Settings → Environment Variables** add:
   - `ANTHROPIC_API_KEY` = your `sk-ant-…` key
   - `ALLOWED_ORIGIN` = your site address, e.g. `https://dreamlight-quotes.vercel.app`
     (several separated by commas). If you leave it empty, only the same site can use the proxy.
3. Redeploy. Open the site → **Settings → Claude assistant → Advanced: proxy URL** → type `/api/claude`.
4. Tap **Test connection**.

What the proxy allows: only this app's three models, at most 4,096 output tokens per request, only the
app's own tools (no web search or other paid server tools), and only requests from your site.
GitHub Pages cannot run the proxy — use Option A there.

---

## Choosing a model (Settings → Model)

| Choice | Model id | When |
|---|---|---|
| Sonnet — recommended | `claude-sonnet-5-5` | Default. Good at Tanglish and messy spelling, quick. |
| Haiku — cheaper and faster | `claude-haiku-5-5` | Lowest cost; fine for simple one-dish changes. |
| Opus — most capable | `claude-opus-5-5` | Long or tricky requests (many meals at once). Costs about twice Sonnet. |

## Problems

| You see | Do this |
|---|---|
| "The Claude key was not accepted — check Settings" | Paste the key again, or make a new one. Check there is credit on console.anthropic.com. |
| "Claude is busy, try again in a minute" | Wait a minute and tap **Try again**. |
| "No internet. You can still edit the Menu." | Your message stays in the box; send it when you are online. |
| "Claude took too long" / "Could not reach Claude" | Tap **Try again** — your message is kept. |
| A card says "This suggestion has expired" | The page was reloaded or a newer message was sent. Ask again. |

---

## Technical notes (for developers)

Code: `src/assistant/` — `ChatScreen.tsx` (UI), `cards.tsx` (preview / choice / error / setup cards),
`actions.ts` (send, cancel, Yes/No/Undo/spelling/choice), `conversation.ts` (turn loop),
`ops.ts` (operation schemas + `applyOps`), `preview.ts` (simulation + before/after description),
`spelling.ts` (library match, alias map, remembered choices), `context.ts` (event snapshot),
`prompt.ts` (static system prompt), `tools.ts`, `client.ts` (SDK client, request, error mapping), `speech.ts`.

- **SDK**: `@anthropic-ai/sdk` in the browser (`dangerouslyAllowBrowser: true`), `client.beta.messages.create`
  (non-streaming), `timeout` 30 s per attempt, `maxRetries` 1, Cancel = `AbortController`. With a proxy URL the
  SDK `baseURL` is the proxy and the key is a dummy.
- **Request**: `max_tokens` 4096, `tool_choice: {type: "auto"}` (forced tool choice is rejected by the 5.5 models),
  `output_config.effort: "low"` (chat-style latency; thinking stays at the model default, adaptive — thinking
  cannot be disabled on Opus 5.5 / Sonnet 5.5, so effort is the lever), system prompt + tools cached
  (`cache_control` on the system block, plus top-level automatic caching of the conversation prefix).
  Sonnet 5.5 / Opus 5.5 requests opt into server-side refusal fallback (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`); Haiku 5.5 has no server-side fallback. `stop_reason: "refusal"` and
  `"max_tokens"` are handled before any tool runs.
- **Tools**: `propose_changes` ({summary, operations[]}) and `ask_choice` ({question, options[]}). Neither
  mutates data. Inputs are validated with zod and simulated with immer on a copy; problems go back as
  `is_error` tool_results (up to 4 API calls per user message) before the user sees anything. The decision
  (Yes / No / pick / not answered) is sent as the tool_result at the start of the next user turn.
- **Conversation**: append-only in memory for the page session (thinking blocks passed back unchanged), the
  event snapshot is in every user turn (not in the system prompt), a fresh conversation starts after 8 user
  turns or when the model / key / proxy changes. Visible chat bubbles and cards persist in `chats[eventId]`.
- **Applying**: one `transact(eventId, {by: 'claude', summary, detail}, recipe)` using the same `applyOps`
  as the preview, so one Undo reverts the whole change.
- **Tests**: `npx vitest run src/assistant`; browser check (mocked API):
  `npm run build && node src/assistant/__e2e__/chat.e2e.mjs [screenshotDir]`.
