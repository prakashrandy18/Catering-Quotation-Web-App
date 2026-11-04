/**
 * Scenarios 8–11: Claude chat (mocked API), offline app, accessibility sweep, tablet/laptop panes.
 */

import { execFileSync } from 'node:child_process';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

/** Context-level mock of the Anthropic Messages API. `mock.mode`: 'normal' | '401' | '529'. */
async function mockClaude(ctx) {
  const mock = { mode: 'normal', calls: [] };
  await ctx.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(req.postData() ?? '{}');
    mock.calls.push(body);
    if (mock.mode === '401') {
      return route.fulfill({
        status: 401,
        headers: { 'content-type': 'application/json', ...CORS },
        body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
      });
    }
    if (mock.mode === '529') {
      return route.fulfill({
        status: 529,
        headers: { 'content-type': 'application/json', ...CORS },
        body: JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }),
      });
    }
    const last = body.messages[body.messages.length - 1];
    const blocks = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
    const texts = blocks.filter((b) => b.type === 'text').map((b) => b.text);
    const snapshot = texts.find((t) => t.startsWith('<event>')) ?? '';
    const said = (texts.filter((t) => !t.startsWith('<event>')).at(-1) ?? '').toLowerCase();
    const meal = (name) => new RegExp(`MEAL (\\S+) \\S+ "${name.replace(/[()]/g, '\\$&')}"`).exec(snapshot)?.[1];
    let content;
    let stop = 'end_turn';
    const tool = (name, input) => {
      stop = 'tool_use';
      return { type: 'tool_use', id: `toolu_e2e_${mock.calls.length}`, name, input };
    };
    if (/vada curry remove/.test(said)) {
      content = [
        { type: 'text', text: 'Muhurtham Morning Tiffin: Vada Curry out, Poori Masala Kilangu in.' },
        tool('propose_changes', {
          summary: 'Swap Vada Curry for Poori Masala Kilangu',
          operations: [
            { op: 'remove_dishes', session_id: meal('Muhurtham Morning Tiffin'), dishes: ['Vada Curry'] },
            { op: 'add_dishes', session_id: meal('Muhurtham Morning Tiffin'), dishes: [{ name: 'Poori Masala Kilangu' }], after_dish: 'Pongal' },
          ],
        }),
      ];
    } else if (said.trim() === 'lunch') {
      content = [
        tool('ask_choice', {
          question: 'Which lunch?',
          options: [
            { label: 'Day 1 · Viratha Lunch', value: meal('Viratha Lunch') },
            { label: 'Day 2 · Muhurtham Lunch', value: meal('Muhurtham Lunch') },
          ],
        }),
      ];
    } else if (/bahadur/.test(said)) {
      content = [
        tool('propose_changes', {
          summary: 'Add Mini Badusha to Evening Snacks',
          operations: [{ op: 'add_dishes', session_id: meal('Evening Snacks'), dishes: [{ name: 'Mini Bahadur Shah' }] }],
        }),
      ];
    } else if (/brunch 120/.test(said)) {
      content = [
        tool('propose_changes', {
          summary: 'Brunch: 120 people at ₹260',
          operations: [
            { op: 'set_people', session_id: meal('Brunch'), people: 120 },
            { op: 'set_rate', session_id: meal('Brunch'), rate: 260 },
          ],
        }),
      ];
    } else {
      content = [{ type: 'text', text: `Okay (${said.slice(0, 40)}).` }];
    }
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', ...CORS },
      body: JSON.stringify({
        id: `msg_e2e_${mock.calls.length}`,
        type: 'message',
        role: 'assistant',
        model: body.model,
        content,
        stop_reason: stop,
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 50 },
      }),
    });
  });
  return mock;
}

async function withKey(ctx) {
  await ctx.addInitScript(() => {
    const KEY = 'catering-quote-app';
    if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, JSON.stringify({ state: { assistant: { apiKey: 'test-key', model: 'claude-sonnet-5-5', proxyUrl: '', voiceLang: 'en-IN' } }, version: 1 }));
    }
  });
}

export async function moreScenarios2(h, main, { clientCall, sendQuotes, colorShare }) {
  const {
    scenario, check, must, note, evidence, shot, newContext, newPage, appState, noHScroll, text, INR, openEvent, openMeal, mealEntries,
    waitPdfReady, savePdf, a11ySweep, PHONE, TABLET, LAPTOP, BASE, OUT, STORE, SEED_TOTAL,
  } = h;

  async function sendChat(page, msg) {
    const input = page.getByLabel('Message Claude');
    await input.fill(msg);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
  }

  /* ---------------------------------------------------------------- */
  /* 8. Claude chat with a mocked API                                  */
  /* ---------------------------------------------------------------- */
  await scenario('s8', 'Claude chat (mocked API): preview → Yes → Undo, choices, spelling, totals, 401, 529, offline (phone)', async () => {
    const ctx = await newContext(PHONE);
    await withKey(ctx);
    const mock = await mockClaude(ctx);
    const page = await newPage(ctx);
    const eventId = await openEvent(page, 'Thara Wedding');
    await page.getByRole('link', { name: 'Chat', exact: true }).click();
    await page.getByLabel('Message Claude').waitFor();
    const totalBefore = await text(page.getByTestId('header-total'));

    // (a) propose_changes → preview, nothing changes until Yes
    const MT = 'Muhurtham Morning Tiffin';
    const seedMT = await mealEntries(page, MT);
    await sendChat(page, 'Muhurtham tiffin la vada curry remove pannu, poori masala kilangu add pannu');
    const card = page.getByRole('group', { name: 'Change from Claude' }).or(page.locator('[aria-label="Change from Claude"]')).first();
    await page.getByRole('button', { name: 'Yes, do it' }).waitFor({ timeout: 20000 });
    const cardText = await text(card);
    check(/Day 2 · Muhurtham Morning Tiffin/.test(cardText), 'preview names "Day 2 · Muhurtham Morning Tiffin"', cardText.slice(0, 80));
    check(/Removed:[\s\S]*Vada Curry/.test(cardText) && /Added:[\s\S]*Poori Masala Kilangu/.test(cardText), 'preview lists Removed: Vada Curry / Added: Poori Masala Kilangu');
    check(await page.getByRole('button', { name: 'No, change it' }).isVisible(), '"No, change it" offered');
    const pending = await mealEntries(page, MT);
    check(pending === null || JSON.stringify(pending) === JSON.stringify(seedMT), 'menu unchanged before Yes');
    const hs = await noHScroll(page);
    check(hs.sw <= hs.cw, 'no horizontal scroll in chat', `${hs.sw}/${hs.cw}`);
    await shot(page, 's8a-preview');
    await page.getByRole('button', { name: 'Yes, do it' }).click();
    await page.getByRole('button', { name: 'Undo' }).waitFor();
    const applied = await mealEntries(page, MT);
    check(!applied.includes('Vada Curry') && applied.includes('Poori Masala Kilangu'), 'Yes, do it applied the change');
    check(applied.indexOf('Poori Masala Kilangu') === applied.indexOf('Pongal') + 1, 'added after Pongal');
    const st = await appState(page);
    check(st.history[0].by === 'claude' && st.history.filter((x) => x.by === 'claude').length === 1, 'one history entry by Claude');
    check(await page.getByRole('link', { name: 'Show in menu' }).isVisible(), 'applied card: Show in menu');
    check((await text(page.getByTestId('header-total'))) === totalBefore, 'header total unchanged by a dish swap');
    await shot(page, 's8a-applied');
    await page.getByRole('link', { name: 'Recent changes and undo' }).click();
    check(/Claude/.test(await text(page.locator('ol > li').first())), 'Recent changes shows the entry by "Claude"');
    await page.goBack();
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByText('Undone. The menu is back as it was.').waitFor();
    check(JSON.stringify(await mealEntries(page, MT)) === JSON.stringify(seedMT), 'Undo restored the dishes exactly');
    check((await text(page.getByTestId('header-total'))) === totalBefore, 'header total same after Undo');

    // (b) ask_choice
    const hist0 = (await appState(page)).history.length;
    await sendChat(page, 'lunch');
    const choice = page.getByRole('group', { name: 'Which lunch?' });
    await choice.waitFor({ timeout: 20000 });
    check(await choice.getByRole('button', { name: 'Day 1 · Viratha Lunch' }).isVisible(), 'choice "Day 1 · Viratha Lunch" shown');
    check(await choice.getByRole('button', { name: 'Day 2 · Muhurtham Lunch' }).isVisible(), 'choice "Day 2 · Muhurtham Lunch" shown');
    check((await appState(page)).history.length === hist0, 'nothing changed while choosing');
    await shot(page, 's8b-choice');
    const callsBefore = mock.calls.length;
    await choice.getByRole('button', { name: 'Day 2 · Muhurtham Lunch' }).click();
    await page.waitForFunction((n) => true, callsBefore);
    await page.getByText(/Okay \(day 2 · muhurtham lunch\)/i).waitFor({ timeout: 20000 });
    const lastCall = mock.calls.at(-1);
    const lastMsg = JSON.stringify(lastCall.messages.at(-1));
    check(mock.calls.length === callsBefore + 1 && /tool_result/.test(lastMsg) && /Day 2 · Muhurtham Lunch/.test(lastMsg), 'tapping a choice sends it (tool_result + text)');

    // (c) spelling: Mini Bahadur Shah → Did you mean Mini Badusha?
    await sendChat(page, 'Evening snacks la Mini Bahadur Shah add pannu');
    await page.getByRole('button', { name: 'Yes, Mini Badusha' }).waitFor({ timeout: 20000 });
    check(/Did you mean\s*Mini Badusha\?/.test(await text(page.locator('p', { hasText: 'Did you mean' }).last())), '"Did you mean Mini Badusha?"');
    await page.getByRole('button', { name: 'Yes, Mini Badusha' }).click();
    await page.getByRole('button', { name: 'Yes, do it' }).last().click();
    await page.getByRole('button', { name: 'Undo' }).last().waitFor();
    const snacks = await mealEntries(page, 'Evening Snacks');
    check(snacks.includes('Mini Badusha') && !snacks.includes('Mini Bahadur Shah'), 'menu uses the tapped spelling (Mini Badusha)');
    await shot(page, 's8c-spelling-applied');

    // (d) people / price → total before → after in ₹ with Indian grouping; then decline
    await sendChat(page, 'Brunch 120 per aakku, ₹260 ilaikku');
    await page.getByRole('button', { name: 'Yes, do it' }).last().waitFor({ timeout: 20000 });
    const tl = await text(page.getByTestId('proposal-total').last());
    const cardAll = await text(page.locator('[aria-label="Change from Claude"]').last());
    check(/People 100 → 120/.test(cardAll) && /Price ₹250 → ₹260/.test(cardAll), 'card shows People 100 → 120, Price ₹250 → ₹260');
    check(/Meal total ₹25,000 → ₹31,200/.test(cardAll), 'card shows Meal total ₹25,000 → ₹31,200');
    check(tl === 'Total ₹85,000 → ₹91,200', 'card shows event total before → after with Indian grouping', tl);
    const brunchBefore = JSON.stringify((await appState(page)).events[0].days[2].sessions[0]);
    await page.getByRole('button', { name: 'No, change it' }).last().click();
    await page.waitForTimeout(200);
    check(JSON.stringify((await appState(page)).events[0].days[2].sessions[0]) === brunchBefore, '"No, change it" changes nothing');
    await shot(page, 's8d-totals-declined');

    // (e) 401 → friendly key error, message kept
    mock.mode = '401';
    await sendChat(page, 'Kattu saatham 150 per');
    await page.getByText('The Claude key was not accepted — check Settings.').waitFor({ timeout: 20000 });
    check(true, '401 → "The Claude key was not accepted — check Settings."');
    check(await page.getByText('Kattu saatham 150 per', { exact: true }).last().isVisible(), 'the message text is kept in the chat');
    check(await page.getByRole('link', { name: 'Open Settings' }).last().isVisible().catch(() => false) || (await page.getByRole('button', { name: 'Open Settings' }).last().isVisible().catch(() => false)), 'error offers Open Settings');
    await shot(page, 's8e-401');

    // (f) 529 overloaded → busy message + Try again → works when the API is back
    mock.mode = '529';
    await sendChat(page, 'Kattu saatham 160 per');
    await page.getByText('Claude is busy, try again in a minute.').last().waitFor({ timeout: 30000 });
    check(true, '529 → "Claude is busy, try again in a minute."');
    const tryAgain = page.getByRole('button', { name: 'Try again' }).last();
    check(await tryAgain.isVisible(), 'Try again offered');
    mock.mode = 'normal';
    await tryAgain.click();
    await page.getByText(/Okay \(kattu saatham 160 per\)/i).waitFor({ timeout: 20000 });
    check(true, 'Try again resends the kept message');

    // (g) offline → "No internet" + draft kept
    const nCalls = mock.calls.length;
    await ctx.setOffline(true);
    await sendChat(page, 'Viratha lunch 200 per');
    await page.getByText('No internet. You can still edit the Menu.').waitFor();
    check(true, 'offline → "No internet. You can still edit the Menu."');
    check((await page.getByLabel('Message Claude').inputValue()) === 'Viratha lunch 200 per', 'draft kept in the message box');
    check(mock.calls.length === nCalls, 'no request sent while offline');
    await shot(page, 's8g-offline');
    await ctx.setOffline(false);
    const apiErr = page.__errors.filter((e) => !/401|529|Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e));
    check(apiErr.length === 0, 'no unexpected console errors', apiErr.join(' | '));
    await ctx.close();
    void eventId;
  });

  /* ---------------------------------------------------------------- */
  /* 9. Offline app (service worker)                                   */
  /* ---------------------------------------------------------------- */
  await scenario('s9', 'Offline after one visit: app loads, Menu edits, PDF generates (phone)', async () => {
    const ctx = await newContext(PHONE);
    await withKey(ctx);
    const page = await newPage(ctx);
    await page.goto(BASE);
    const swOk = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 30000))]);
      return reg ? 'ready' : 'timeout';
    });
    must(swOk === 'ready', 'service worker installed and ready', swOk);
    // let clients.claim() take control
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => undefined);
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const c = await caches.open(keys[0]);
      return (await c.keys()).map((r) => new URL(r.url).pathname);
    });
    check(cached.some((p) => /render-.*\.js$/.test(p)) && cached.some((p) => /Poppins-Bold\.ttf$/.test(p)) && cached.some((p) => /emoji\/1f37d\.png$/.test(p)), 'PDF generator, fonts and emoji precached', `${cached.length} files`);
    await ctx.setOffline(true);
    await page.reload();
    await page.getByRole('link', { name: /Thara Wedding/ }).first().waitFor({ timeout: 15000 });
    check(true, 'app loads offline');
    const eventId = await openEvent(page, 'Thara Wedding');
    await openMeal(page, '24 Feb', 'Viratha Tiffin');
    await page.getByLabel('Price per plate (leaf)', { exact: true }).fill('150');
    await page.waitForTimeout(100);
    check((await text(page.getByTestId('session-total'))) === INR(15000), 'Menu edit works offline (₹15,000)');
    await page.getByRole('link', { name: 'PDF', exact: true }).click();
    await waitPdfReady(page, 60000);
    check(true, 'PDF preview renders offline');
    await page.getByRole('button', { name: 'Copy for chef (no prices)' }).first().click();
    await page.waitForTimeout(800);
    await waitPdfReady(page, 60000);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: 'Save PDF' }).click()]);
    const pdf = await savePdf(dl, 'offline-chef');
    check(pdf.head === '%PDF-' && pdf.text.includes('Viratha Tiffin'), 'chef PDF generated offline');
    const fonts = (() => {
      try {
        return execFileSync('pdffonts', [pdf.file], { encoding: 'utf8' });
      } catch {
        return '';
      }
    })();
    if (fonts) note(`pdffonts: ${fonts.split('\n').slice(2).map((l) => l.split(/\s+/)[0]).join(', ')}`);
    await shot(page, 's9-offline-pdf');
    // chat offline
    await page.getByRole('link', { name: 'Chat', exact: true }).click();
    await page.getByLabel('Message Claude').fill('Brunch 130 per');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByText('No internet. You can still edit the Menu.').waitFor();
    check((await page.getByLabel('Message Claude').inputValue()) === 'Brunch 130 per', 'chat offline: "No internet" + draft kept');
    await ctx.setOffline(false);
    void eventId;
    await ctx.close();
  });

  /* ---------------------------------------------------------------- */
  /* 10. Accessibility / readability sweep at 390                      */
  /* ---------------------------------------------------------------- */
  await scenario('s10', 'Accessibility sweep on every main screen at 390 + 200% text zoom', async () => {
    const ctx = await newContext(PHONE);
    await withKey(ctx);
    const page = await newPage(ctx);
    const eventId = await openEvent(page, 'Thara Wedding');
    const ev = `${BASE}#/event/${eventId}`;
    const st = await appState(page);
    const brunchId = st.events[0].days[2].sessions[0].id;
    const screens = [
      ['Events home', BASE, async () => page.getByRole('link', { name: 'New event' }).first()],
      ['New event', `${BASE}#/new`, async () => {
        await page.getByLabel('Copy an old event').check();
        return page.getByRole('button', { name: 'Create event' });
      }],
      ['Menu', `${ev}/menu`, async () => page.getByRole('button', { name: 'Add a meal' })],
      ['Meal editor', `${ev}/menu/${brunchId}`, async () => page.getByRole('link', { name: 'Done' })],
      ['Add dish', `${ev}/menu/${brunchId}/add`, async () => {
        await page.getByLabel('Search dishes').fill('sam');
        await page.getByRole('button', { name: 'Samosa', exact: true }).waitFor();
        return page.getByRole('link', { name: /^Done/ });
      }],
      ['PDF', `${ev}/pdf`, async () => {
        await waitPdfReady(page);
        return page.getByRole('button', { name: 'Send', exact: true });
      }],
      ['Share sheet', `${ev}/pdf?v=chef`, async () => {
        await waitPdfReady(page);
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        await page.getByRole('dialog', { name: 'Send PDF' }).waitFor();
        return page.getByRole('button', { name: 'Send on WhatsApp' });
      }],
      ['History', `${ev}/history`, async () => page.getByRole('heading', { name: 'Recent changes' })],
      ['Event details', `${ev}/details`, async () => page.getByLabel('Event name')],
      ['Chat', `${ev}/chat`, async () => page.getByRole('button', { name: 'Speak' })],
      ['Settings', `${BASE}#/settings`, async () => page.getByLabel('Claude API key')],
    ];
    const report = {};
    for (const [name, url, prep] of screens) {
      await page.goto('about:blank');
      await page.goto(url);
      await page.waitForTimeout(300);
      const primary = await prep();
      await primary.waitFor({ timeout: 30000 });
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      await shot(page, `s10-${slug}-390`);
      report[name] = await a11ySweep(page, name);
      // 200% text zoom
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      await page.waitForTimeout(200);
      const z = await page.evaluate(() => {
        const clipped = [];
        for (const el of document.querySelectorAll('body *')) {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!own) continue;
          if ((s.overflowX !== 'visible' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.tagName.toLowerCase()}[${el.textContent.trim().slice(0, 30)}]`);
          if (r.right > innerWidth + 1 && !el.closest('[role="group"][aria-label="Quick actions"]')) clipped.push(`offscreen ${el.tagName.toLowerCase()}[${el.textContent.trim().slice(0, 30)}] right=${Math.round(r.right)}`);
        }
        return { sw: document.scrollingElement.scrollWidth, cw: document.documentElement.clientWidth, clipped: [...new Set(clipped)].slice(0, 10) };
      });
      // the app sizes text in px (Tailwind arbitrary values) → root font-size zoom only scales rem-based classes
      check(z.sw <= z.cw, `${name} @200% text: no horizontal scroll`, `${z.sw}/${z.cw}`);
      if (z.clipped.length) note(`${name} @200%: truncated/clipped text: ${z.clipped.join('; ')}`);
      await primary.scrollIntoViewIfNeeded().catch(() => undefined);
      const vis = await primary.isVisible().catch(() => false);
      check(vis, `${name} @200%: primary action reachable`);
      await shot(page, `s10-${slug}-zoom200`);
      await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    }
    // page zoom: WCAG 1.4.10 reflow width (320 CSS px) is a hard check; 195 px (= 390 px phone at 200 % page zoom) is reported only
    for (const width of [320, 195]) {
      await page.setViewportSize({ width, height: Math.round((width * 844) / 390) });
      for (const [name, url] of [['Events home', BASE], ['Menu', `${ev}/menu`], ['Meal editor', `${ev}/menu/${brunchId}`], ['PDF', `${ev}/pdf`], ['Chat', `${ev}/chat`]]) {
        await page.goto('about:blank');
        await page.goto(url);
        await page.waitForTimeout(400);
        const z = await noHScroll(page);
        if (width === 320) check(z.sw <= z.cw, `${name} at 320 CSS px: no horizontal scroll`, `${z.sw}/${z.cw}`);
        else if (z.sw > z.cw) note(`${name} at 195 CSS px (200% page zoom): horizontal scroll ${z.sw}/${z.cw}`);
        await shot(page, `s10-${name.toLowerCase().replace(/\s+/g, '-')}-${width}px`);
      }
    }
    await ctx.close();
    void report;
  });

  await scenario('s10-keyboard', 'Laptop keyboard: Tab through Chat, visible focus, Enter sends (1366)', async () => {
    const ctx = await newContext(LAPTOP);
    await withKey(ctx);
    const mock = await mockClaude(ctx);
    const page = await newPage(ctx);
    const eventId = await openEvent(page, 'Thara Wedding');
    await page.goto(`${BASE}#/event/${eventId}/chat`);
    await page.getByLabel('Message Claude').waitFor();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    const seen = [];
    let noRing = [];
    let lastY = -1;
    let orderIssues = 0;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || /0px 0px 0px [2-9]/.test(s.boxShadow) || (s.boxShadow !== 'none' && s.boxShadow !== '');
        return { name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 30), ring, y: Math.round(r.y), inAside: !!el.closest('aside') };
      });
      if (!f) continue;
      seen.push(f.name);
      if (!f.ring) noRing.push(f.name);
      if (!f.inAside && f.y < lastY - 200) orderIssues++;
      if (!f.inAside) lastY = f.y;
      if (f.name === 'Message Claude') break;
    }
    note(`tab order: ${seen.join(' → ')}`);
    check(seen.includes('Message Claude'), 'Tab reaches the message box');
    check(noRing.length === 0, 'every focused element shows a visible focus ring', noRing.join(', '));
    check(orderIssues <= 1, 'tab order follows the visual order (top → bottom)', String(orderIssues));
    await shot(page, 's10-keyboard-focus');
    await page.keyboard.type('Viratha lunch 120 per');
    await page.keyboard.press('Enter');
    await page.getByText(/Okay \(viratha lunch 120 per\)/i).waitFor({ timeout: 20000 });
    check(mock.calls.length === 1, 'Enter sends the message');
    await ctx.close();
  });

  /* ---------------------------------------------------------------- */
  /* 11. Tablet / laptop: main flow + live PDF pane                     */
  /* ---------------------------------------------------------------- */
  for (const [dev, device] of [['tablet', TABLET], ['laptop', LAPTOP]]) {
    await scenario(`s11-${dev}`, `Main flow + live PDF pane + centred share dialog (${dev} ${device.viewport.width}×${device.viewport.height})`, async () => {
      const r = await clientCall(device, dev);
      const page = r.page;
      const aside = page.getByRole('complementary', { name: 'Live PDF preview' });
      check(await aside.isVisible(), 'live PDF pane next to Menu');
      await aside.getByTestId('pdf-page').first().waitFor({ timeout: 60000 });
      const mainBox = await page.locator('main').boundingBox();
      const asideBox = await aside.boundingBox();
      check(asideBox.x >= mainBox.x + mainBox.width - 2, 'pane is to the right of the Menu', `main ${Math.round(mainBox.x)}+${Math.round(mainBox.width)} aside ${Math.round(asideBox.x)}`);
      await shot(page, `s11-${dev}-menu-pane`);
      // edit → pane updates
      await openMeal(page, '24 Feb', 'Viratha Tiffin');
      await aside.getByTestId('pdf-page').first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(2500);
      const sig = () => aside.getByTestId('pdf-page').first().evaluate((c) => c.toDataURL('image/png').length + ':' + c.toDataURL('image/png').slice(-200));
      const before = await sig();
      await page.getByLabel('Price per plate (leaf)', { exact: true }).fill('175');
      let changed = false;
      for (let i = 0; i < 30 && !changed; i++) {
        await page.waitForTimeout(500);
        changed = (await sig().catch(() => before)) !== before;
      }
      check(changed, 'live pane re-renders after an edit');
      await shot(page, `s11-${dev}-pane-updated`);
      await page.getByLabel('Price per plate (leaf)', { exact: true }).fill('150');
      // chat next to the pane
      await page.getByRole('link', { name: 'Chat', exact: true }).click();
      await page.waitForURL(/\/chat/);
      check(await aside.isVisible(), 'live PDF pane next to Chat');
      await shot(page, `s11-${dev}-chat-pane`);
      // full send flow (share sheet = centred dialog checked inside)
      await sendQuotes(page, dev);
      const hs = await noHScroll(page);
      check(hs.sw <= hs.cw, 'no horizontal scroll', `${hs.sw}/${hs.cw}`);
      check(page.__errors.length === 0, 'no console errors', page.__errors.join(' | '));
      await r.ctx.close();
    });
  }

  /* ---------------------------------------------------------------- */
  /* 12. Extras: reduced motion, focus inside sheets, install banner    */
  /* ---------------------------------------------------------------- */
  await scenario('s12', 'Reduced motion, focus stays put in the share sheet, install banner after 2nd share (phone)', async () => {
    const ctx = await newContext(PHONE, { reducedMotion: 'reduce' });
    const page = await newPage(ctx);
    const eventId = await openEvent(page, 'Thara Wedding');
    await page.goto(`${BASE}#/event/${eventId}/pdf`);
    await waitPdfReady(page);
    // "Add price" in the missing-price warning opens the first unpriced meal
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('dialog', { name: 'Some meals have no price' }).getByRole('button', { name: 'Add price' }).click();
    await page.getByLabel('Meal name').waitFor();
    check((await page.getByLabel('Meal name').inputValue()) === 'Viratha Tiffin', '"Add price" opens the first meal without a price (Viratha Tiffin)');
    await page.goto(`${BASE}#/event/${eventId}/pdf`);
    await waitPdfReady(page);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('dialog', { name: 'Some meals have no price' }).getByRole('button', { name: 'Send anyway' }).click();
    const sheet = page.getByRole('dialog', { name: 'Send PDF' });
    await sheet.waitFor();
    const dur = await sheet.evaluate((el) => {
      const s = getComputedStyle(el);
      return Math.max(...s.animationDuration.split(',').map((d) => (d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000)), ...s.transitionDuration.split(',').map((d) => (d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000)));
    });
    check(dur <= 50, 'prefers-reduced-motion: share sheet animation ≤50 ms', `${dur} ms`);
    // keyboard: focus the "Mark as sent" checkbox, toggle with Space → focus must stay on it
    const cb = sheet.getByRole('checkbox', { name: 'Mark as sent' });
    await cb.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const focused = await page.evaluate(() => document.activeElement?.closest('label')?.textContent?.trim() ?? document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim());
    check(!(await cb.isChecked()), 'Space toggled "Mark as sent" off');
    check(focused === 'Mark as sent', 'focus stays on the checkbox after toggling (no jump inside the sheet)', String(focused));
    // Escape closes and returns focus to the opener
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check(!(await sheet.isVisible().catch(() => false)), 'Esc closes the share sheet');
    // focus trap: Tab cycles inside the sheet
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('dialog', { name: 'Some meals have no price' }).getByRole('button', { name: 'Send anyway' }).click();
    await sheet.waitFor();
    let outside = 0;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (!(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))) outside++;
    }
    check(outside === 0, 'Tab stays inside the share sheet (focus trap)', String(outside));
    await page.keyboard.press('Escape');

    // install banner: needs beforeinstallprompt AND ≥2 shares; dismissible
    await page.goto(BASE);
    const fire = () =>
      page.evaluate(() => {
        const e = new Event('beforeinstallprompt', { cancelable: true });
        e.prompt = async () => undefined;
        e.userChoice = Promise.resolve({ outcome: 'dismissed' });
        window.dispatchEvent(e);
      });
    const banner = page.getByRole('region', { name: 'Add to home screen' });
    await fire();
    await page.waitForTimeout(200);
    const shares = (await appState(page)).meta.shareCount;
    check(shares === 0 && !(await banner.isVisible()), 'no install banner before any share (first visit)');
    const setShares = (n) =>
      page.evaluate(([k, n]) => {
        const raw = JSON.parse(localStorage.getItem(k));
        raw.state.meta.shareCount = n;
        localStorage.setItem(k, JSON.stringify(raw));
      }, [STORE, n]);
    await setShares(1);
    await page.reload();
    await fire();
    await page.waitForTimeout(200);
    check(!(await banner.isVisible()), 'no banner after 1 share');
    await setShares(2);
    await page.reload();
    await page.waitForTimeout(200);
    check(!(await banner.isVisible()), 'no banner after 2 shares until beforeinstallprompt fires');
    await fire();
    await banner.waitFor({ timeout: 3000 });
    check(true, 'banner shows after the 2nd share once beforeinstallprompt fired');
    await shot(page, 's12-install-banner');
    await banner.getByRole('button', { name: 'Hide this message' }).click();
    check(!(await banner.isVisible()), 'banner dismissible');
    await page.reload();
    await fire();
    await page.waitForTimeout(200);
    check(!(await banner.isVisible()), 'stays dismissed after reload');
    await ctx.close();
  });

  if (main.ctx) await main.ctx.close();
}
