/**
 * Scenarios 4–11 (history, persistence/backup, new event, settings, chat, offline, a11y, tablet/laptop).
 */
import fs from 'node:fs';
import path from 'node:path';
import { moreScenarios2 } from './scenarios3.mjs';

/** Fraction of pixels of a PNG (rasterised PDF page) within `tol` of `hex`. */
async function colorShare(page, pngFile, hex, tol = 26) {
  const b64 = fs.readFileSync(pngFile).toString('base64');
  return page.evaluate(
    async ({ b64, hex, tol }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const t = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - t[0]) <= tol && Math.abs(d[i + 1] - t[1]) <= tol && Math.abs(d[i + 2] - t[2]) <= tol) n++;
      return n / (c.width * c.height);
    },
    { b64, hex, tol },
  );
}

export async function moreScenarios(h, main, { clientCall, sendQuotes }) {
  const {
    scenario, check, must, note, evidence, shot, newContext, newPage, appState, noHScroll, text, INR, openEvent, openDay, openMeal, mealEntries,
    waitPdfReady, savePdf, a11ySweep, PHONE, TABLET, LAPTOP, BASE, OUT, STORE, SEED_TOTAL, EXPECTED_AFTER_EDITS,
  } = h;

  /* ---------------------------------------------------------------- */
  /* 4. Undo / history                                                 */
  /* ---------------------------------------------------------------- */
  await scenario('s4', 'Recent changes: undo newest, Redo, older needs confirmation (phone)', async () => {
    const page = main.page;
    must(page, 'main flow page exists');
    // a fresh edit: Kattu Saatham people 100 → 150
    await openMeal(page, '26 Feb', 'Kattu Saatham');
    await page.getByLabel('People', { exact: true }).fill('150');
    await page.waitForTimeout(100);
    check((await text(page.getByTestId('session-total'))) === INR(15000), 'Kattu Saatham 150 × ₹100 = ₹15,000');
    const totalAfterEdit = EXPECTED_AFTER_EDITS + 5000;
    await page.getByRole('link', { name: 'Recent changes and undo' }).click();
    await page.getByRole('heading', { name: 'Recent changes' }).waitFor();
    const items = page.locator('ol > li');
    const n = await items.count();
    const all = await items.allTextContents();
    check(n >= 8, 'history lists the edits', `${n} entries`);
    check(all.some((t) => /Added: Samosa/.test(t)), 'history has "Added: Samosa"');
    check(all.some((t) => /Removed: Moru/.test(t)), 'history has "Removed: Moru"');
    check(all.some((t) => /Undid/.test(t)), 'history has the toast Undo ("Undid …")');
    check(all.every((t) => /^You|You/.test(t)), 'every entry is by "You"');
    check(/Kattu Saatham changed/.test(all[0]) && /Current/.test(all[0]), 'newest = Kattu Saatham change, marked Current', all[0].slice(0, 60));
    check(await page.getByText('Saved on this phone').isVisible(), 'subtitle "Saved on this phone"');
    await shot(page, 's4-history');
    // undo newest — no confirmation
    await items.first().getByRole('button', { name: 'Undo this change' }).click();
    check(!(await page.getByRole('dialog').isVisible().catch(() => false)), 'newest undo: no confirmation dialog');
    const toast = page.getByRole('status').filter({ hasText: 'Undone:' });
    await toast.waitFor();
    check(/Undone: Kattu Saatham changed/.test(await text(toast)), 'toast "Undone: Kattu Saatham changed"');
    check((await text(page.getByTestId('header-total'))) === INR(EXPECTED_AFTER_EDITS), 'undo restored the total', await text(page.getByTestId('header-total')));
    await shot(page, 's4-undo-toast');
    await toast.getByRole('button', { name: 'Redo' }).click();
    await page.waitForTimeout(150);
    check((await text(page.getByTestId('header-total'))) === INR(totalAfterEdit), 'Redo re-applied (₹1,11,200)', await text(page.getByTestId('header-total')));
    // older entry → confirmation; Cancel changes nothing; Yes undoes it and later ones; Redo restores
    const older = page.locator('ol > li').nth(3);
    const olderTitle = (await older.textContent()).slice(0, 60);
    await older.getByRole('button', { name: 'Undo this change' }).click();
    const dlg = page.getByRole('dialog', { name: 'Undo this change?' });
    await dlg.waitFor();
    check(/also undoes the 3 changes/.test(await text(dlg)), 'confirmation says it also undoes 3 later changes', (await text(dlg)).slice(0, 120));
    await shot(page, 's4-older-confirm');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    check((await text(page.getByTestId('header-total'))) === INR(totalAfterEdit), 'Cancel changed nothing');
    await page.locator('ol > li').nth(3).getByRole('button', { name: 'Undo this change' }).click();
    await page.getByRole('dialog', { name: 'Undo this change?' }).getByRole('button', { name: 'Yes, undo' }).click();
    const t2 = page.getByRole('status').filter({ hasText: 'Undone:' }).last();
    await t2.waitFor();
    note(`older undo target: ${olderTitle.replace(/\s+/g, ' ')}`);
    const totalOld = await text(page.getByTestId('header-total'));
    check(totalOld !== INR(totalAfterEdit), 'older undo rolled the event back', totalOld);
    await t2.getByRole('button', { name: 'Redo' }).click();
    await page.waitForTimeout(150);
    check((await text(page.getByTestId('header-total'))) === INR(totalAfterEdit), 'Redo brought everything back', await text(page.getByTestId('header-total')));
    main.expectedTotal = totalAfterEdit;
  });

  /* ---------------------------------------------------------------- */
  /* 5. Reload persistence + backup / restore                          */
  /* ---------------------------------------------------------------- */
  await scenario('s5', 'Reload keeps edits; Save backup (no key) → clear → Restore (phone)', async () => {
    const page = main.page;
    must(page, 'main flow page exists');
    const before = await appState(page);
    const histCount = before.history.length;
    await page.reload();
    await page.getByTestId('header-total').waitFor();
    check((await text(page.getByTestId('header-total'))) === INR(main.expectedTotal), 'reload keeps the total', await text(page.getByTestId('header-total')));
    const after = await appState(page);
    check(after.history.length === histCount, 'reload keeps history', `${after.history.length}`);
    check((await mealEntries(page, 'Vilayadal Evening (Snacks)')).includes('Samosa'), 'reload keeps Samosa');

    // set an API key through Settings → Claude assistant
    await page.goto(BASE + '#/settings');
    const key = page.getByLabel('Claude API key');
    await key.waitFor();
    await key.fill('sk-ant-e2e-secret-key');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(200);
    check((await appState(page)).assistant.apiKey === 'sk-ant-e2e-secret-key', 'API key saved in this browser');

    // backup
    await page.goto(BASE);
    const lb = page.getByTestId('last-backup');
    check(/Save one now/.test(await text(lb)), 'never backed up → "Save one now"', await text(lb));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save backup' }).click()]);
    const file = path.join(OUT, 'backup', dl.suggestedFilename());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await dl.saveAs(file);
    evidence(file);
    const json = fs.readFileSync(file, 'utf8');
    check(/^catering-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), 'backup file name', dl.suggestedFilename());
    check(!json.includes('sk-ant') && !/"apiKey"/.test(json), 'backup contains no API key');
    const parsed = JSON.parse(json);
    check(parsed.app === 'catering-quote-app' && parsed.data.events.length === 1, 'backup has the event');
    check(/today/i.test(await text(lb)), 'after saving: "Last backup: today"', await text(lb));
    await shot(page, 's5-backup-saved');

    // clear storage → sample comes back
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('link', { name: /Thara Wedding/ }).first().waitFor();
    await openEvent(page, 'Thara Wedding');
    check((await text(page.getByTestId('header-total'))) === INR(SEED_TOTAL), 'cleared storage → sample event back (₹85,000)');
    // restore
    await page.goto(BASE);
    await page.getByTestId('restore-file').setInputFiles(file);
    const dlg = page.getByRole('dialog', { name: 'Restore this backup?' });
    await dlg.waitFor();
    await dlg.getByRole('button', { name: 'Yes, restore' }).click();
    await page.getByRole('status').filter({ hasText: 'Restored 1 event' }).waitFor();
    check(true, 'toast "Restored 1 event from your backup."');
    await openEvent(page, 'Thara Wedding');
    check((await text(page.getByTestId('header-total'))) === INR(main.expectedTotal), 'restore brought the edits back', await text(page.getByTestId('header-total')));
    check((await appState(page)).history.length === histCount, 'restore brought history back');
    check((await mealEntries(page, 'Brunch')).includes('Moru'), 'restored Brunch still has Moru');

    // stale-backup reminder: lastBackupAt 8 days ago
    await page.evaluate((k) => {
      const raw = JSON.parse(localStorage.getItem(k));
      raw.state.meta.lastBackupAt = Date.now() - 8 * 86400000;
      localStorage.setItem(k, JSON.stringify(raw));
    }, STORE);
    await page.goto(BASE);
    await page.reload();
    const lb2 = page.getByTestId('last-backup');
    check(/8 days ago/.test(await text(lb2)) && /Please save a new backup/.test(await text(lb2)), 'backup >7 days → reminder', await text(lb2));
    const color = await page.getByRole('region', { name: 'Backup' }).evaluate((el) => getComputedStyle(el).backgroundColor);
    note(`stale backup card background ${color}`);
    await shot(page, 's5-backup-stale');
  });

  /* ---------------------------------------------------------------- */
  /* 6. New event for another client                                   */
  /* ---------------------------------------------------------------- */
  await scenario('s6', 'New event "Priya Engagement" copied from Thara, re-dated, renamed (phone)', async () => {
    const page = main.page;
    must(page, 'main flow page exists');
    await page.goto(BASE);
    await page.getByRole('link', { name: 'New event' }).first().click();
    await page.getByLabel('Event name', { exact: true }).fill('Priya Engagement');
    await page.getByLabel('From', { exact: true }).fill('2027-03-10');
    await page.getByLabel('To', { exact: true }).fill('2027-03-11');
    await page.getByLabel('Location', { exact: true }).fill('Tambaram');
    await page.getByLabel('Copy an old event').check();
    const pick = page.getByRole('radio', { name: /Thara Wedding/ });
    await pick.check();
    check(await page.getByText('2 days: one Day is made for each date.').isVisible(), '"2 days" hint');
    await shot(page, 's6-new-event-form', { fullPage: true });
    const hs = await noHScroll(page);
    check(hs.sw <= hs.cw, 'no horizontal scroll on New event', `${hs.sw}/${hs.cw}`);
    await page.getByRole('button', { name: 'Create event' }).click();
    await page.waitForURL(/#\/event\/[^/]+\/menu/);
    const newId = /#\/event\/([^/?]+)/.exec(page.url())[1];
    check((await text(page.getByTestId('event-title'))) === 'Priya Engagement', 'header shows Priya Engagement');
    const st = await appState(page);
    const ev = st.events.find((e) => e.id === newId);
    const thara = st.events.find((e) => e.name === 'Thara Wedding');
    check(ev.location === 'Tambaram' && ev.status === 'draft', 'location Tambaram, status Not sent');
    check(ev.days.length === 2 && ev.days[0].date === '10-03-2027' && ev.days[1].date === '11-03-2027', 'two days re-dated 10-03-2027, 11-03-2027', ev.days.map((d) => d.date).join(','));
    check(
      JSON.stringify(ev.days.map((d) => d.sessions.map((s) => s.name))) === JSON.stringify(thara.days.slice(0, 2).map((d) => d.sessions.map((s) => s.name))),
      'days 1–2 have Thara’s meals',
    );
    check(ev.days[1].sessions.find((s) => s.name.startsWith('Vilayadal')).entries.some((e) => e.text === 'Samosa'), 'copied meals include the edits (Samosa)');
    const ids = new Set(thara.days.flatMap((d) => d.sessions.map((s) => s.id)));
    check(ev.days.every((d) => d.sessions.every((s) => !ids.has(s.id))), 'copied meals have new ids');
    check(await page.getByRole('button', { name: /^10 Mar/ }).isVisible(), 'day button "10 Mar"');
    // rename a meal
    await openMeal(page, '10 Mar', 'Viratha Tiffin');
    await page.getByLabel('Meal name').fill('Nichayathartham Tiffin');
    await page.getByRole('link', { name: 'Done' }).click();
    check(await page.getByRole('link', { name: /Nichayathartham Tiffin/ }).isVisible(), 'renamed meal shows on Menu');
    const st2 = await appState(page);
    check(st2.events.find((e) => e.name === 'Thara Wedding').days[0].sessions[0].name === 'Viratha Tiffin', 'Thara Wedding untouched');
    // rename event in Event details
    await page.getByRole('link', { name: 'Event details' }).click();
    const nameField = page.getByLabel('Event name', { exact: true });
    await nameField.fill('Priya & Karthik Engagement');
    await page.waitForTimeout(100);
    check((await text(page.getByTestId('event-title'))) === 'Priya & Karthik Engagement', 'header follows the new event name');
    await shot(page, 's6-event-details');
    // PDF filename follows (chef copy → no warning)
    await page.goto(`${BASE}#/event/${newId}/pdf?v=chef`);
    await waitPdfReady(page);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: 'Save PDF' }).click()]);
    const pdf = await savePdf(dl, 'priya-chef');
    check(pdf.name === 'Priya & Karthik Engagement – Chef Price Request.pdf', 'PDF file name follows the new name', pdf.name);
    check(pdf.text.includes('10-03-2027') && pdf.text.includes('Tambaram'), 'PDF has the new dates and location');
    check(pdf.text.includes('Nichayathartham Tiffin'), 'PDF has the renamed meal');
    check(!pdf.text.includes('26-02-2027'), 'PDF has no old Day 3');
  });

  /* ---------------------------------------------------------------- */
  /* 7. Settings: brand colour, contact phone, payment terms           */
  /* ---------------------------------------------------------------- */
  await scenario('s7', 'Settings: Maroon colour, contact phone, payment terms → UI + PDFs (phone)', async () => {
    const ctx = await newContext(PHONE);
    const page = await newPage(ctx);
    await page.goto(BASE);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Maroon' }).waitFor();
    await page.getByRole('button', { name: 'Maroon' }).click();
    check((await page.getByRole('button', { name: 'Maroon' }).getAttribute('aria-pressed')) === 'true', 'Maroon selected');
    await page.getByLabel('Contact phone').fill('9876543210');
    const terms = '50% advance, balance on the event day';
    await page.getByLabel('Payment terms').fill(terms);
    await page.waitForTimeout(200);
    await shot(page, 's7-settings', { fullPage: true });
    await a11ySweep(page, 'Settings 390');
    await openEvent(page, 'Thara Wedding');
    const dayBg = await page.getByRole('button', { name: /^24 Feb/ }).evaluate((el) => getComputedStyle(el).backgroundColor);
    check(dayBg === 'rgb(122, 31, 43)', 'UI recoloured: selected day button is Maroon', dayBg);
    await shot(page, 's7-menu-maroon');
    // client PDF via Save PDF (warning → Send anyway)
    await page.getByRole('link', { name: 'PDF', exact: true }).click();
    await waitPdfReady(page);
    await page.getByRole('button', { name: 'Save PDF' }).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.getByRole('dialog', { name: 'Some meals have no price' }).getByRole('button', { name: 'Send anyway' }).click(),
    ]);
    const client = await savePdf(dl, 'maroon-client');
    check(client.text.replace(/\s+/g, ' ').includes(terms), 'payment terms in the client PDF');
    const maroon1 = await colorShare(page, client.pages[0], '#7A1F2B');
    const green1 = await colorShare(page, client.pages[0], '#2D5A12');
    check(maroon1 > 0.003 && green1 < 0.0005, 'client PDF page 1 uses Maroon (title/day bars), no green', `maroon ${(maroon1 * 100).toFixed(2)}% green ${(green1 * 100).toFixed(3)}%`);
    // chef PDF
    await page.getByRole('button', { name: 'Copy for chef (no prices)' }).first().click();
    await page.waitForTimeout(800);
    await waitPdfReady(page);
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: 'Save PDF' }).click()]);
    const chef = await savePdf(dl2, 'maroon-chef');
    check(chef.text.includes('9876543210'), 'contact phone in the chef PDF sign-off');
    check(!chef.text.includes('8122831347'), 'old phone gone from the chef PDF');
    check(!chef.text.replace(/\s+/g, ' ').includes(terms), 'payment terms NOT in the chef PDF');
    const maroon2 = await colorShare(page, chef.pages[0], '#7A1F2B');
    const green2 = await colorShare(page, chef.pages[0], '#2D5A12');
    check(maroon2 > 0.003 && green2 < 0.0005, 'chef PDF page 1 title/day bar Maroon', `maroon ${(maroon2 * 100).toFixed(2)}% green ${(green2 * 100).toFixed(3)}%`);
    check(page.__errors.length === 0, 'no console errors', page.__errors.join(' | '));
    await ctx.close();
  });

  await moreScenarios2(h, main, { clientCall, sendQuotes, colorShare });
}

