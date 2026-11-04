/**
 * Playwright check of the chat preview → apply → undo flow at 390×844, against the
 * production build. The Anthropic API is mocked with page.route (no network, no key).
 *
 *   npm run build && node src/assistant/__e2e__/chat.e2e.mjs [screenshotDir]
 *
 * Uses the globally installed playwright (PLAYWRIGHT_PATH or /opt/node-tools/node_modules/playwright).
 * Not picked up by vitest (only *.test.ts(x) are).
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = 4176;
const BASE = `http://localhost:${PORT}/`;
const shotDir = process.argv[2] ?? null;
const SENTENCE = 'Viratha tiffin la vada curry remove pannu, poori masala kilangu add pannu';

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
  console.log('  ✓ ' + msg);
}

async function waitForServer(url, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start');
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
let browser;
let failed = false;
const apiCalls = [];

try {
  await waitForServer(BASE);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await context.addInitScript(() => {
    const KEY = 'catering-quote-app';
    if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, JSON.stringify({ state: { assistant: { apiKey: 'sk-ant-e2e-test', model: 'claude-sonnet-5-5', proxyUrl: '', voiceLang: 'en-IN' } }, version: 1 }));
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
    const body = JSON.parse(req.postData() ?? '{}');
    apiCalls.push(body);
    const last = body.messages[body.messages.length - 1];
    const blocks = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
    const hasToolResult = blocks.some((b) => b.type === 'tool_result');
    const snapshot = blocks.map((b) => b.text ?? '').join('\n');
    let content;
    if (hasToolResult) {
      content = [{ type: 'text', text: 'Okay.' }];
    } else {
      const m = /MEAL (\S+) \S+ "Viratha Tiffin"/.exec(snapshot);
      if (!m) throw new Error('snapshot without Viratha Tiffin');
      // Canned answer. (The seed's Viratha Tiffin has Medhu Vadai and already has Poori Masala Kilangu,
      // so the canned proposal swaps Medhu Vadai for Vada Curry to stay valid against the seed.)
      content = [
        { type: 'text', text: 'Here is the change for Viratha Tiffin:' },
        {
          type: 'tool_use',
          id: 'toolu_e2e_1',
          name: 'propose_changes',
          input: {
            summary: 'Swap Medhu Vadai for Vada Curry in Viratha Tiffin',
            operations: [
              { op: 'remove_dishes', session_id: m[1], dishes: ['Medhu Vadai'] },
              { op: 'add_dishes', session_id: m[1], dishes: [{ name: 'Vada Curry' }], after_dish: 'Poori Masala Kilangu' },
            ],
          },
        },
      ];
    }
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', ...corsHeaders },
      body: JSON.stringify({
        id: 'msg_e2e_' + apiCalls.length,
        type: 'message',
        role: 'assistant',
        model: body.model,
        content,
        stop_reason: hasToolResult ? 'end_turn' : 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 50 },
      }),
    });
  });

  await page.goto(BASE);
  // The seed event is only written to storage after the first change, so read its id from the events list.
  const href = await page.locator('a[href*="/event/"]').first().getAttribute('href');
  const eventId = /\/event\/([^/]+)/.exec(href ?? '')?.[1];
  if (!eventId) throw new Error('no event link on the home screen');
  await page.goto(`${BASE}#/event/${eventId}/chat`);

  const input = page.getByLabel('Message Claude');
  await input.waitFor();
  const totalBefore = (await page.getByTestId('header-total').textContent())?.trim();
  console.log('  header total before:', totalBefore);

  await input.fill(SENTENCE);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const yes = page.getByRole('button', { name: 'Yes, do it' });
  await yes.waitFor({ timeout: 15000 });

  assert(apiCalls.length === 1, 'one API request for the message');
  assert(apiCalls[0].model === 'claude-sonnet-5-5' && apiCalls[0].tool_choice?.type === 'auto', 'request uses the configured model and tool_choice auto');
  assert(await page.getByText('Day 1 · Viratha Tiffin · 100 people').isVisible(), 'preview names "Day 1 · Viratha Tiffin · 100 people"');
  assert(await page.getByText('Removed:', { exact: true }).isVisible(), 'preview shows Removed:');
  assert(await page.getByText('Added:', { exact: true }).isVisible(), 'preview shows Added:');
  assert((await page.getByTestId('proposal-total').textContent()).includes('Total unchanged'), 'preview says Total unchanged');

  const dishes = async () =>
    page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('catering-quote-app')).state;
      if (!s.events) return null;
      return s.events[0].days[0].sessions.find((x) => x.name === 'Viratha Tiffin').entries.map((e) => e.text);
    });
  const beforeDishes = await dishes();
  assert(beforeDishes === null || (beforeDishes.includes('Medhu Vadai') && !beforeDishes.includes('Vada Curry')), 'menu unchanged before tapping Yes');

  const scrollW = await page.evaluate(() => document.scrollingElement.scrollWidth);
  assert(scrollW <= 390, `no horizontal scroll at 390px (scrollWidth ${scrollW})`);
  const box = await input.boundingBox();
  assert(box && box.y + box.height <= 844 - 64, 'message box is visible above the bottom tab bar');
  if (shotDir) await page.screenshot({ path: path.join(shotDir, 'chat-preview.png') });

  await yes.click();
  await page.getByRole('button', { name: 'Undo' }).waitFor();
  assert(await page.getByRole('link', { name: 'Show in menu' }).isVisible(), 'applied card has Show in menu');
  const afterDishes = await dishes();
  assert(afterDishes.includes('Vada Curry') && !afterDishes.includes('Medhu Vadai'), 'Yes, do it applied the change');
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('catering-quote-app')).state.history);
  assert(history.filter((h) => h.by === 'claude').length === 1, 'exactly one history entry by claude');
  assert((await page.getByTestId('header-total').textContent())?.trim() === totalBefore, `header total unchanged (${totalBefore})`);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, 'chat-applied.png') });

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByText('Undone. The menu is back as it was.').waitFor();
  const SEED_VT = ['Ashoka Halwa', 'Thattu Idly', 'Milagu Pongal', 'Poori', 'Medhu Vadai', 'Coconut Chutney', 'Poori Masala Kilangu', 'Sambar', 'Idly Podi', 'Coffee'];
  assert(JSON.stringify(await dishes()) === JSON.stringify(beforeDishes ?? SEED_VT), 'Undo restored the dishes exactly');
  assert((await page.getByTestId('header-total').textContent())?.trim() === totalBefore, 'header total still the same after Undo');
  if (shotDir) await page.screenshot({ path: path.join(shotDir, 'chat-undone.png'), fullPage: true });
  console.log('E2E chat: PASS');
} catch (e) {
  failed = true;
  console.error('E2E chat: FAIL', e);
} finally {
  await browser?.close();
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
}
process.exit(failed ? 1 : 0);
