/**
 * Real-life scenarios. Each `scenario(id, name, fn)` is independent unless noted
 * (s2 → s5 share one phone context: the owner's phone during a client call).
 */
import fs from 'node:fs';
import path from 'node:path';
import { moreScenarios } from './scenarios2.mjs';

export async function registerScenarios(h) {
  const {
    scenario, check, must, note, shot, newContext, newPage, appState, noHScroll, text, INR, openEvent, openDay, openMeal, mealEntries,
    waitPdfReady, savePdf, samplePng, hexRgb, near, a11ySweep, PHONE, TABLET, LAPTOP, BASE, OUT, STORE, SEED_TOTAL, EXPECTED_AFTER_EDITS,
  } = h;

  /* ---------------------------------------------------------------- */
  /* 1. First open                                                     */
  /* ---------------------------------------------------------------- */
  for (const [dev, device] of [['phone', PHONE], ['tablet', TABLET], ['laptop', LAPTOP]]) {
    await scenario(`s1-${dev}`, `First open (${dev} ${device.viewport.width}×${device.viewport.height})`, async () => {
      const ctx = await newContext(device);
      const page = await newPage(ctx);
      await page.goto(BASE);
      await page.getByRole('link', { name: /Thara Wedding/ }).first().waitFor();
      check(await page.getByRole('link', { name: /Thara Wedding/ }).first().isVisible(), 'sample event "Thara Wedding" shown');
      const ne = page.getByRole('link', { name: 'New event' }).first();
      const box = await ne.boundingBox();
      check(box && box.y >= 0 && box.y + box.height <= device.viewport.height, '"New event" visible without scrolling', box && `y=${Math.round(box.y)}`);
      check(await page.getByRole('button', { name: 'Save backup' }).isVisible(), 'backup card: Save backup');
      check(await page.getByRole('button', { name: 'Restore backup' }).isVisible(), 'backup card: Restore backup');
      check(await page.getByText('Your events are saved on this phone only.').isVisible(), 'backup card text');
      check(await page.getByRole('link', { name: 'Settings' }).isVisible(), 'Settings link');
      check((await page.locator('input[type="password"]').count()) === 0, 'no login prompt');
      const hs = await noHScroll(page);
      check(hs.sw <= hs.cw, 'no horizontal scroll', `${hs.sw}/${hs.cw}`);
      await shot(page, `s1-first-open-${dev}`);
      if (dev === 'phone') await a11ySweep(page, 'Events home 390');
      await page.waitForTimeout(500);
      check(page.__errors.length === 0, 'no console errors / page errors', page.__errors.join(' | '));
      await ctx.close();
    });
  }

  /* ---------------------------------------------------------------- */
  /* 2–5. Main flow on the phone                                        */
  /* ---------------------------------------------------------------- */
  const main = { ctx: null, page: null, eventId: null };
  async function clientCall(device, tag) {
    const ctx = await newContext(device);
    const page = await newPage(ctx);
    const eventId = await openEvent(page, 'Thara Wedding');
    check(/\/menu/.test(page.url()), 'tapping the event opens Menu');
    check((await text(page.getByTestId('grand-total'))) === INR(SEED_TOTAL), 'seed grand total', `${await text(page.getByTestId('grand-total'))} vs ${INR(SEED_TOTAL)}`);
    check((await text(page.getByTestId('header-total'))) === INR(SEED_TOTAL), 'seed header total');
    check(await page.getByText('Price missing').first().isVisible(), '"Price missing" marker on unpriced meals');

    // Day 1 Viratha Tiffin dishes
    await openMeal(page, '24 Feb', 'Viratha Tiffin');
    const vt = await mealEntries(page, 'Viratha Tiffin');
    const vtUi = await page.locator('button[aria-label^="Rename "]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
    const tiffin = vt ?? vtUi;
    check(tiffin.includes('Poori Masala Kilangu') && tiffin.includes('Ashoka Halwa'), 'Viratha Tiffin has Poori Masala Kilangu + Ashoka Halwa');
    check(!tiffin.includes('Vada Curry') && !tiffin.includes('Carrot Halwa'), 'Viratha Tiffin has no Vada Curry / Carrot Halwa');
    check(await page.getByTestId('session-total').filter({ hasText: 'Price missing' }).isVisible(), 'Total for this meal says Price missing');

    // price 150 per plate (typed)
    const price = page.getByLabel('Price per plate (leaf)', { exact: true });
    const inputMode = await price.getAttribute('inputmode');
    check(inputMode === 'numeric', 'price field opens numeric keypad (inputmode=numeric)');
    await price.fill('150');
    await page.waitForTimeout(100);
    check((await text(page.getByTestId('session-total'))) === INR(15000), 'Viratha Tiffin total = ₹15,000', await text(page.getByTestId('session-total')));
    // ± steppers
    await page.getByRole('button', { name: 'More Price per plate (leaf)' }).click();
    check((await text(page.getByTestId('session-total'))) === INR(16000), '+ price → ₹16,000 instantly');
    await page.getByRole('button', { name: 'Less Price per plate (leaf)' }).click();
    check((await text(page.getByTestId('session-total'))) === INR(15000), '− price → back to ₹15,000');
    await page.getByRole('link', { name: 'Done' }).click();
    await page.waitForURL(/\/menu\?day=/);
    if (tag === 'phone') await shot(page, 's2-menu-after-tiffin-price');

    // Day 2 Vilayadal: add Samosa via search "sam"
    await openMeal(page, '25 Feb', 'Vilayadal Evening');
    await page.getByRole('link', { name: 'Add dish' }).click();
    const search = page.getByLabel('Search dishes');
    await search.fill('sam');
    const samosa = page.getByRole('button', { name: 'Samosa', exact: true });
    await samosa.waitFor({ timeout: 5000 });
    if (tag === 'phone') await shot(page, 's2-add-dish-sam');
    await samosa.click();
    check((await samosa.getAttribute('aria-pressed')) === 'true', 'Samosa marked added');
    const done = page.getByRole('link', { name: /^Done/ });
    check(/1 added/.test(await text(done)), 'Done button shows "1 added"', await text(done));
    await done.click();
    await page.getByLabel('Meal name').waitFor();
    check((await mealEntries(page, 'Vilayadal Evening (Snacks)')).includes('Samosa'), 'Samosa added to Vilayadal Evening');

    // Day 3 Brunch: people 120 (typed), price 260 → ₹31,200
    await openMeal(page, '26 Feb', 'Brunch');
    await page.getByLabel('People', { exact: true }).fill('120');
    await page.getByLabel('Price per plate (leaf)', { exact: true }).fill('260');
    await page.waitForTimeout(100);
    check((await text(page.getByTestId('session-total'))) === INR(31200), 'Brunch total = ₹31,200', await text(page.getByTestId('session-total')));

    // remove Moru → toast Undo restores it
    await page.getByRole('button', { name: 'Remove Moru', exact: true }).click();
    check(!(await mealEntries(page, 'Brunch')).includes('Moru'), 'Moru removed');
    const toastEl = page.getByRole('status').filter({ hasText: 'Removed Moru' });
    await toastEl.waitFor();
    check(true, 'toast "Removed Moru" (role=status) shown');
    if (tag === 'phone') await shot(page, 's2-remove-moru-toast');
    await toastEl.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(150);
    const brunchAfterUndo = await mealEntries(page, 'Brunch');
    check(brunchAfterUndo.includes('Moru'), 'Undo from toast restored Moru');
    check((await text(page.getByTestId('session-total'))) === INR(31200), 'Brunch total still ₹31,200 after Undo (no edit lost)');

    // reorder a dish up
    const iMoru = brunchAfterUndo.indexOf('Moru');
    await page.getByRole('button', { name: 'Move Moru up', exact: true }).click();
    const afterMove = await mealEntries(page, 'Brunch');
    check(afterMove.indexOf('Moru') === iMoru - 1, 'Move Moru up → one place higher');
    // add a blank space
    const gapsBefore = afterMove.filter((x) => x === '[gap]').length;
    await page.getByRole('button', { name: 'Add blank space' }).click();
    const afterGap = await mealEntries(page, 'Brunch');
    check(afterGap.filter((x) => x === '[gap]').length === gapsBefore + 1 && afterGap.at(-1) === '[gap]', 'Add blank space appends a blank space');
    if (tag === 'phone') await shot(page, 's2-brunch-editor', { fullPage: true });

    // totals
    await page.getByRole('link', { name: 'Done' }).click();
    await page.waitForURL(/\/menu\?day=/);
    const gt = await text(page.getByTestId('grand-total'));
    const ht = await text(page.getByTestId('header-total'));
    check(gt === INR(EXPECTED_AFTER_EDITS), `Menu grand total = ${INR(EXPECTED_AFTER_EDITS)}`, gt);
    check(ht === INR(EXPECTED_AFTER_EDITS), `header total = ${INR(EXPECTED_AFTER_EDITS)}`, ht);
    const dayBtn = await text(page.getByRole('button', { name: /^26 Feb/ }));
    check(dayBtn.includes(INR(31200 + 10000)), 'Day 3 button shows ₹41,200', dayBtn);
    const hs = await noHScroll(page);
    check(hs.sw <= hs.cw, 'no horizontal scroll on Menu', `${hs.sw}/${hs.cw}`);
    if (tag === 'phone') await shot(page, 's2-menu-day3-totals');
    return { ctx, page, eventId };
  }

  await scenario('s2', 'Client phone call: menu edits, totals (phone)', async () => {
    Object.assign(main, await clientCall(PHONE, 'phone'));
    check(main.page.__errors.length === 0, 'no console errors', main.page.__errors.join(' | '));
  });

  /* ---------------------------------------------------------------- */
  /* 3. Send quotes                                                    */
  /* ---------------------------------------------------------------- */
  async function sendQuotes(page, tag) {
    await page.getByRole('link', { name: 'PDF', exact: true }).click();
    await page.waitForURL(/\/pdf/);
    const client = page.getByRole('button', { name: 'Quote for client' }).first();
    check((await client.getAttribute('aria-pressed')) === 'true', 'Quote for client selected by default');
    await waitPdfReady(page);
    check(await page.getByText('CLIENT COPY — WITH PRICES').first().isVisible(), 'banner CLIENT COPY — WITH PRICES');
    await shot(page, `s3-pdf-client-${tag}`);

    // Send → missing-price warning → Send anyway → Send on WhatsApp (no Web Share → download)
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const warn = page.getByRole('dialog', { name: 'Some meals have no price' });
    await warn.waitFor();
    check(await warn.getByRole('button', { name: 'Add price' }).isVisible(), 'warning offers Add price');
    check(await warn.getByText('Viratha Lunch').isVisible(), 'warning lists Viratha Lunch');
    await shot(page, `s3-missing-price-warning-${tag}`);
    await warn.getByRole('button', { name: 'Send anyway' }).click();
    const sheet = page.getByRole('dialog', { name: 'Send PDF' });
    await sheet.waitFor();
    const sb = await sheet.boundingBox();
    const vw = page.viewportSize().width;
    if (vw >= 768) check(sb && Math.abs(sb.x + sb.width / 2 - vw / 2) < 4 && sb.width <= 530, 'share sheet is a centred dialog', `x=${sb?.x} w=${sb?.width}`);
    else check(sb && sb.width >= vw - 1, 'share sheet is a bottom sheet on phone');
    await page.waitForTimeout(300); // entrance animation (180 ms)
    await shot(page, `s3-share-sheet-client-${tag}`);
    const wa = sheet.getByRole('button', { name: 'Send on WhatsApp' });
    const waColors = await wa.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
    check(waColors[0] === 'rgb(23, 122, 66)' && waColors[1] === 'rgb(255, 255, 255)', 'WhatsApp button #177A42 / white', waColors.join(' '));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), wa.click()]);
    const pdf = await savePdf(dl, `client-${tag}`);
    check(pdf.name === 'Thara Wedding – Quotation.pdf', 'file name "Thara Wedding – Quotation.pdf"', pdf.name);
    check(pdf.head === '%PDF-', 'valid PDF header');
    check(/Pages:\s+\d+/.test(pdf.info), 'pdfinfo reads it', (/Pages:\s+(\d+)/.exec(pdf.info) ?? [])[1] + ' pages');
    const titleLine = (/Title:\s+(.*)/.exec(pdf.info) ?? [])[1] ?? '';
    check(/Thara Wedding/.test(titleLine), 'PDF title metadata names the event', titleLine);
    const t = pdf.text;
    check(t.includes('Samosa'), 'client PDF contains Samosa');
    check(t.includes('31,200'), 'client PDF contains ₹31,200 (Brunch)');
    check(/Day 3 subtotal[\s\S]{0,200}41,200/.test(t) || /Day 3 subtotal/.test(t), 'client PDF has Day 3 subtotal', (/Day 3 subtotal.*$/m.exec(t) ?? [''])[0].replace(/\s+/g, ' '));
    check(t.includes('41,200'), 'Day 3 subtotal ₹41,200 printed');
    check(/Grand Total/i.test(t) && t.includes('1,06,200'), 'grand total ₹1,06,200 printed');
    check(t.includes('Rates to be confirmed for'), '"Rates to be confirmed for" note');
    check(t.includes('Excluding Evening Beverages'), '"Excluding Evening Beverages" note');
    check(/\bMoru\b/.test(t), 'Moru present (it was restored by Undo)');
    check(!/₹\s*0(?![\d,])/.test(t), 'never prints ₹0');
    const toastText = await page.getByRole('status').filter({ hasText: 'PDF saved' }).first().textContent({ timeout: 5000 }).catch(() => '');
    check(/Open WhatsApp and attach it/.test(toastText), 'fallback toast tells the next step', toastText);
    const st = await appState(page);
    const ev = st.events.find((e) => e.name === 'Thara Wedding');
    check(ev.status === 'draft', 'status stays Not sent after a plain download (nothing proves it was sent)', ev.status);
    const doneSheet = page.getByRole('dialog', { name: 'Send PDF' });
    check(await doneSheet.getByRole('button', { name: 'Done, I sent it' }).isVisible(), 'download fallback offers "Done, I sent it"');
    await doneSheet.getByText('Mark as sent').click();
    await doneSheet.getByRole('button', { name: 'Done, I sent it' }).click();
    const ev2 = (await appState(page)).events.find((e) => e.name === 'Thara Wedding');
    check(ev2.status === 'sent', 'status → Sent after ticking Mark as sent + Done, I sent it', ev2.status);

    // Chef copy
    await page.getByRole('button', { name: 'Copy for chef (no prices)' }).first().click();
    await page.waitForURL(/v=chef/);
    await page.waitForTimeout(800);
    await waitPdfReady(page);
    check(await page.getByText('CHEF COPY — NO PRICES').first().isVisible(), 'banner CHEF COPY — NO PRICES');
    await shot(page, `s3-pdf-chef-${tag}`);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const sheet2 = page.getByRole('dialog', { name: 'Send PDF' });
    await sheet2.waitFor();
    check(!(await page.getByRole('dialog', { name: 'Some meals have no price' }).isVisible().catch(() => false)), 'no missing-price warning for the chef copy');
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), sheet2.getByRole('button', { name: 'Send on WhatsApp' }).click()]);
    const chef = await savePdf(dl2, `chef-${tag}`);
    // The sheet stays open after a download fallback ("saved, not sent yet"); the user closes it.
    check(await sheet2.getByText('It has not been sent yet').isVisible().catch(() => false), 'download fallback says the chef PDF is saved, not sent');
    await sheet2.getByRole('button', { name: 'Close' }).click();
    await sheet2.waitFor({ state: 'detached' });
    check(!(await page.getByRole('dialog').isVisible().catch(() => false)), 'share sheet closed');
    check(chef.name === 'Thara Wedding – Chef Price Request.pdf', 'file name "Thara Wedding – Chef Price Request.pdf"', chef.name);
    check(chef.head === '%PDF-', 'valid chef PDF');
    const c = chef.text;
    check(c.includes('Samosa'), 'chef PDF contains Samosa');
    check(c.includes('Price Sheet (To be filled by Chef)'), 'chef PDF has "Price Sheet (To be filled by Chef)"');
    check(!/₹\s*\d/.test(c), 'chef PDF has no ₹ amount', (/₹\s*\d[\d,]*/.exec(c) ?? [''])[0]);
    check(!/\b(31,200|1,06,200|41,200|15,000)\b/.test(c), 'chef PDF has none of the client totals');
    check(!/Client Name|Payment Terms/i.test(c), 'chef PDF has no client name line / payment terms');
    check(!/\bThara\b(?! Wedding)/.test(c), 'chef PDF never prints the client name on its own');
    if (/Thara Wedding/.test(c)) note('chef PDF prints the event name "Thara Wedding" (event title, not the client field)');
    return { client: pdf, chef };
  }

  await scenario('s3', 'Send quotes: client + chef PDFs, download fallback (phone)', async () => {
    must(main.page, 'main flow page exists (s2 ran)');
    const r = await sendQuotes(main.page, 'phone');
    main.pdfs = r;
    note(`client PDF pages: ${r.client.pages.length}, chef PDF pages: ${r.chef.pages.length}`);
  });

  await scenario('s3-share', 'Send on WhatsApp with navigator.share mocked (phone)', async () => {
    const ctx = await newContext(PHONE, { share: 'mock' });
    const page = await newPage(ctx);
    await openEvent(page, 'Thara Wedding');
    // ≤3 taps from Menu: PDF tab → Send → (warning: Send anyway) → Send on WhatsApp
    let taps = 0;
    await page.getByRole('link', { name: 'PDF', exact: true }).click();
    taps++;
    await waitPdfReady(page);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    taps++;
    await page.getByRole('dialog', { name: 'Some meals have no price' }).getByRole('button', { name: 'Send anyway' }).click();
    const sheet = page.getByRole('dialog', { name: 'Send PDF' });
    await sheet.waitFor();
    check(!(await sheet.getByText('cannot attach files').isVisible().catch(() => false)), 'no "cannot attach files" hint when file sharing is supported');
    await sheet.getByRole('button', { name: 'Send on WhatsApp' }).click();
    taps++;
    await page.waitForFunction(() => window.__shares.length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    const shares = await page.evaluate(() => window.__shares);
    check(shares.length === 1, 'navigator.share called once', String(shares.length));
    const s = shares[0];
    check(s.files.length === 1 && s.files[0].type === 'application/pdf' && s.files[0].size > 10000, 'one PDF File shared', JSON.stringify(s.files));
    check(s.files[0].name === 'Thara Wedding – Quotation.pdf', 'shared file name', s.files[0].name);
    check(!!s.text && /please find the quotation for Thara Wedding/.test(s.text), 'share message names the event + audience', s.text);
    check(taps <= 3 + 1, `taps from Menu: ${taps} (+1 for the missing-price warning)`);
    const st = await appState(page);
    check(st.events[0].status === 'sent', 'event status becomes Sent');
    check(await page.getByRole('status').filter({ hasText: 'Quote sent.' }).isVisible(), 'toast "Quote sent."');
    // chef share via mock
    await page.getByRole('button', { name: 'Copy for chef (no prices)' }).first().click();
    await page.waitForTimeout(800);
    await waitPdfReady(page);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('dialog', { name: 'Send PDF' }).getByRole('button', { name: 'Send on WhatsApp' }).click();
    await page.waitForFunction(() => window.__shares.length > 1, null, { timeout: 60000 });
    const s2 = (await page.evaluate(() => window.__shares))[1];
    check(s2.files[0].name === 'Thara Wedding – Chef Price Request.pdf' && /Chef/.test(s2.text ?? ''), 'chef share: file + message names the chef', `${s2.files[0].name} | ${s2.text}`);
    check(page.__errors.length === 0, 'no console errors', page.__errors.join(' | '));
    await ctx.close();
  });
  await moreScenarios(h, main, { clientCall, sendQuotes });
}

