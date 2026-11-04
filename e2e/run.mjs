/**
 * End-to-end QA suite for the catering quotation app (production build, real Chromium).
 *
 *   npm run build && LANG=C.UTF-8 LC_ALL=C.UTF-8 npm run e2e
 *
 * Env:
 *   E2E_URL   use an already running server (e.g. http://localhost:4177/) instead of starting `vite preview`
 *   E2E_PORT  port for the preview server this script starts (default 4177)
 *   E2E_ONLY  comma-separated scenario ids to run (e.g. "s1,s2"); default all
 *   PLAYWRIGHT_PATH  where to load playwright from (default: require('playwright'), then /opt/node-tools/node_modules/playwright)
 *
 * Outputs (gitignored) in e2e/output/: screenshots, downloaded PDFs + their text / page PNGs,
 * summary.json and summary.md. Exit code 1 if any check failed.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { registerScenarios } from './scenarios.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean);
  for (const t of tries) {
    try {
      return require(t);
    } catch {
      /* next */
    }
  }
  throw new Error('playwright not found (set PLAYWRIGHT_PATH)');
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'e2e', 'output');
const PORT = Number(process.env.E2E_PORT ?? 4177);
const BASE = (process.env.E2E_URL ?? `http://localhost:${PORT}/`).replace(/\/?$/, '/');
const ONLY = (process.env.E2E_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const STORE = 'catering-quote-app';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

if (!/UTF-8/i.test(`${process.env.LANG ?? ''}${process.env.LC_ALL ?? ''}`)) {
  console.warn('WARNING: run with LANG=C.UTF-8 LC_ALL=C.UTF-8, otherwise download names with "–" may be mangled.');
}

/* ------------------------------------------------------------------ */
/* Result bookkeeping                                                  */
/* ------------------------------------------------------------------ */

const results = [];
let current = null;

function check(cond, msg, extra) {
  const ok = !!cond;
  current.checks.push({ ok, msg: extra ? `${msg} (${extra})` : msg });
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${extra ? ` (${extra})` : ''}`);
  return ok;
}
function must(cond, msg, extra) {
  if (!check(cond, msg, extra)) throw new Error(`required check failed: ${msg}`);
}
function note(msg) {
  current.notes.push(msg);
  console.log(`  · ${msg}`);
}
function evidence(file) {
  current.evidence.push(path.relative(ROOT, file));
}
async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  evidence(file);
  return file;
}

async function scenario(id, name, fn) {
  if (ONLY.length && !ONLY.includes(id)) return;
  console.log(`\n[${id}] ${name}`);
  current = { id, name, checks: [], notes: [], evidence: [], error: null };
  results.push(current);
  const t0 = Date.now();
  try {
    await fn();
  } catch (e) {
    current.error = String(e?.stack ?? e).split('\n').slice(0, 4).join('\n');
    console.log(`  !! ${current.error}`);
  }
  current.ms = Date.now() - t0;
  current.status = current.error || current.checks.some((c) => !c.ok) ? 'FAIL' : 'PASS';
  console.log(`  => ${current.status} (${(current.ms / 1000).toFixed(1)}s)`);
}

/* ------------------------------------------------------------------ */
/* Browser helpers                                                     */
/* ------------------------------------------------------------------ */

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const TABLET = { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const LAPTOP = { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 };

let browser;

/** New context; `share`: 'none' removes navigator.share/canShare, 'mock' records calls in window.__shares. */
async function newContext(device, { share = 'none', ...rest } = {}) {
  const context = await browser.newContext({ ...device, acceptDownloads: true, locale: 'en-IN', ...rest });
  await context.addInitScript((mode) => {
    if (mode === 'none') {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    } else if (mode === 'mock') {
      window.__shares = [];
      Object.defineProperty(navigator, 'canShare', { value: (d) => !!d && Array.isArray(d.files), configurable: true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (d) => {
          window.__shares.push({
            files: (d.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })),
            text: d.text ?? null,
            title: d.title ?? null,
          });
        },
      });
    }
  }, share);
  return context;
}

/** Page that records console errors / page errors into page.__errors. */
async function newPage(context) {
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') page.__errors.push(`console: ${m.text()}`);
  });
  return page;
}

async function appState(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw).state : null;
  }, STORE);
}

async function noHScroll(page) {
  return page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.documentElement.clientWidth }));
}

async function text(locator) {
  return ((await locator.textContent()) ?? '').trim();
}

const INR = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

/** Open the first event whose card names `name` from the home screen; returns the event id. */
async function openEvent(page, name) {
  await page.goto(BASE);
  const card = page.getByRole('link', { name: new RegExp(name) }).first();
  await card.click();
  await page.waitForURL(/#\/event\/[^/]+\/menu/);
  return /#\/event\/([^/?]+)/.exec(page.url())[1];
}

async function openDay(page, short) {
  await page.getByRole('button', { name: new RegExp(`^${short}`) }).click();
}

async function openMeal(page, short, meal) {
  await page.getByRole('link', { name: 'Menu', exact: true }).click();
  await page.waitForURL(/\/menu/);
  await openDay(page, short);
  await page.getByRole('link', { name: new RegExp(meal) }).first().click();
  await page.getByLabel('Meal name').waitFor();
}

async function mealEntries(page, mealName) {
  const s = await appState(page);
  for (const ev of s?.events ?? []) for (const d of ev.days) for (const m of d.sessions) if (m.name === mealName) return m.entries.map((e) => (e.kind === 'gap' ? '[gap]' : e.text));
  return null;
}

async function waitPdfReady(page, timeout = 60000) {
  await page.getByTestId('pdf-page').first().waitFor({ timeout });
  await page.waitForFunction(() => !/Making your PDF/.test(document.body.innerText), null, { timeout });
}

/** Saves a Download, runs pdfinfo/pdftotext/pdftoppm on it and returns { file, name, text, info, pages[] }. */
async function savePdf(download, tag) {
  const name = download.suggestedFilename();
  const dir = path.join(OUT, 'pdf', tag);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  await download.saveAs(file);
  evidence(file);
  const head = fs.readFileSync(file).subarray(0, 5).toString('latin1');
  let info = '';
  let txt = '';
  try {
    info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
    txt = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(dir, 'text.txt'), txt);
    execFileSync('pdftoppm', ['-r', '60', '-png', file, path.join(dir, 'page')]);
  } catch (e) {
    note(`pdf tools failed: ${e.message}`);
  }
  const pages = fs.readdirSync(dir).filter((f) => /^page-\d+\.png$/.test(f)).sort().map((f) => path.join(dir, f));
  pages.forEach(evidence);
  return { file, name, head, info, text: txt, pages };
}

/** Average RGB of a region of a rasterised PDF page (via a tiny PNG decode in the browser). */
async function samplePng(page, pngFile, rect) {
  const b64 = fs.readFileSync(pngFile).toString('base64');
  return page.evaluate(
    async ({ b64, rect }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const x = Math.round(rect.x * img.width);
      const y = Math.round(rect.y * img.height);
      const w = Math.max(1, Math.round(rect.w * img.width));
      const h = Math.max(1, Math.round(rect.h * img.height));
      const d = g.getImageData(x, y, w, h).data;
      // most common non-white colour (bucketed) = the bar colour
      const counts = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const [r, gg, bb] = [d[i], d[i + 1], d[i + 2]];
        if (r > 235 && gg > 235 && bb > 235) continue;
        const k = `${r >> 3},${gg >> 3},${bb >> 3}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top) return null;
      const [r, gg, bb] = top[0].split(',').map((v) => (Number(v) << 3) + 4);
      return { r, g: gg, b: bb, share: top[1] / (w * h) };
    },
    { b64, rect },
  );
}

const hexRgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const near = (a, b, tol = 24) => !!a && Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol;

/* ------------------------------------------------------------------ */
/* Accessibility / readability sweep (runs in the page)                */
/* ------------------------------------------------------------------ */

async function a11ySweep(page, label) {
  const r = await page.evaluate(() => {
    const out = { small: [], tinyText: [], contrast: [], hscroll: null };
    const vis = (el) => {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.bottom > 0 && b.right > 0 && b.left < innerWidth;
    };
    const sel = (el) => {
      const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.getAttribute('placeholder') || '';
      return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${name}]`;
    };
    const hidden = (el) => el.closest('[aria-hidden="true"]') || el.classList.contains('sr-only-text');
    // 1. tap targets: the element, or its <label> when it is a covered input (radios/checkboxes)
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')) {
      if (!vis(el) || hidden(el) || el.disabled) continue;
      if (el.type === 'hidden') continue;
      let b = el.getBoundingClientRect();
      if ((el.type === 'checkbox' || el.type === 'radio' || el.type === 'color' || el.type === 'file') && el.closest('label')) b = el.closest('label').getBoundingClientRect();
      if (el.type === 'checkbox' || el.type === 'radio') {
        const lab = el.id && document.querySelector(`label[for="${el.id}"]`);
        if (lab) {
          const lb = lab.getBoundingClientRect();
          if (lb.height >= b.height) b = lb;
        }
      }
      // inline text links inside a paragraph are exempt (WCAG 2.5.8 inline exception)
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p')) continue;
      if (b.width < 43.5 || b.height < 43.5) out.small.push(`${sel(el)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    // 2. text size + contrast for every element that owns a visible text node
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const blend = (top, under) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    });
    const bgOf = (el) => {
      const stack = [];
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.backgroundImage && s.backgroundImage !== 'none' && !/gradient/.test(s.backgroundImage)) return null; // image: skip
        const c = parse(s.backgroundColor);
        if (c && c.a > 0) {
          stack.push(c);
          if (c.a >= 1) break;
        }
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg);
      return bg;
    };
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      const el = t.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (!vis(el) || hidden(el) || el.closest('canvas, svg, [role="img"]')) continue;
      if (el.closest('button:disabled, [aria-disabled="true"], input:disabled')) continue;
      const s = getComputedStyle(el);
      const fs = parseFloat(s.fontSize);
      if (/^[\p{Extended_Pictographic}\s✓✕›‹•·]+$/u.test(t.textContent.trim())) continue; // decorative glyphs
      if (fs < 13) out.tinyText.push(`${sel(el)} ${fs}px`);
      const fg = parse(s.color);
      const bg = bgOf(el);
      if (!fg || !bg) continue;
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      const fgc = blend({ ...fg, a: fg.a * o }, bg);
      const L1 = lum(fgc);
      const L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = fs >= 24 || (fs >= 18.66 && Number(s.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      if (ratio < need) out.contrast.push(`${sel(el)} ${ratio.toFixed(2)}:1 (need ${need}) fg=${s.color}`);
    }
    out.hscroll = { sw: document.scrollingElement.scrollWidth, cw: document.documentElement.clientWidth };
    return out;
  });
  const ok = r.small.length === 0 && r.tinyText.length === 0 && r.contrast.length === 0 && r.hscroll.sw <= r.hscroll.cw;
  check(r.hscroll.sw <= r.hscroll.cw, `${label}: no horizontal scroll`, `${r.hscroll.sw}/${r.hscroll.cw}`);
  check(r.small.length === 0, `${label}: all targets ≥44×44`, r.small.slice(0, 8).join('; '));
  check(r.tinyText.length === 0, `${label}: no text <13px`, r.tinyText.slice(0, 8).join('; '));
  check(r.contrast.length === 0, `${label}: text contrast ≥4.5:1`, r.contrast.slice(0, 8).join('; '));
  return { ok, ...r };
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

async function waitForServer(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server not reachable at ${url}`);
}

let server = null;
if (!process.env.E2E_URL) {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('dist/ missing: run `npm run build` first');
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
}
const stopServer = () => {
  if (!server) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
  server = null;
};
process.on('exit', stopServer);
process.on('SIGINT', () => process.exit(130));

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

// Seed facts (src/data/seed.ts): confirmed rates only Vilayadal ₹100×200, Muhurtham Dinner ₹300×100,
// Brunch ₹250×100, Kattu Saatham ₹100×100.
const SEED_TOTAL = 100 * 200 + 300 * 100 + 250 * 100 + 100 * 100; // 85,000
const EXPECTED_AFTER_EDITS = SEED_TOTAL + 150 * 100 - 250 * 100 + 120 * 260; // tiffin 150×100, brunch 120×260


try {
  await waitForServer(BASE);
  browser = await chromium.launch();
  await registerScenarios({
    scenario, check, must, note, evidence, shot,
    newContext, newPage, appState, noHScroll, text, INR, openEvent, openDay, openMeal, mealEntries,
    waitPdfReady, savePdf, samplePng, hexRgb, near, a11ySweep,
    PHONE, TABLET, LAPTOP, BASE, OUT, ROOT, STORE, SEED_TOTAL, EXPECTED_AFTER_EDITS,
    getBrowser: () => browser,
  });
} catch (e) {
  console.error('suite error', e);
  results.push({ id: 'suite', name: 'suite setup', status: 'FAIL', checks: [], notes: [], evidence: [], error: String(e) });
} finally {
  await browser?.close();
  stopServer();
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

const summary = {
  base: BASE,
  at: new Date().toISOString(),
  passed: results.filter((r) => r.status === 'PASS').length,
  failed: results.filter((r) => r.status !== 'PASS').length,
  results,
};
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
const md = [
  `# E2E summary (${summary.at})`,
  '',
  `Base: ${BASE} — ${summary.passed} passed, ${summary.failed} failed`,
  '',
  '| id | scenario | status | checks | evidence |',
  '|---|---|---|---|---|',
  ...results.map(
    (r) =>
      `| ${r.id} | ${r.name} | ${r.status} | ${r.checks.filter((c) => c.ok).length}/${r.checks.length} | ${r.evidence.slice(0, 4).join('<br>')} |`,
  ),
  '',
  ...results.flatMap((r) => [
    `## ${r.id} ${r.name} — ${r.status}`,
    ...r.checks.map((c) => `- ${c.ok ? 'PASS' : 'FAIL'} ${c.msg}`),
    ...r.notes.map((n) => `- note: ${n}`),
    ...(r.error ? ['', '```', r.error, '```'] : []),
    '',
  ]),
].join('\n');
fs.writeFileSync(path.join(OUT, 'summary.md'), md);
console.log(`\n${summary.passed} passed, ${summary.failed} failed → e2e/output/summary.md`);
process.exit(summary.failed ? 1 : 0);
