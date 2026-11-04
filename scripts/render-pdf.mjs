#!/usr/bin/env node
/**
 * Writes the client + chef PDFs of the seed event ("Thara Wedding") to a folder,
 * for comparing with docs/reference/sample-pdf by eye.
 *
 *   node scripts/render-pdf.mjs <outDir> [--scenario]
 *
 * --scenario applies the acceptance edits first (Brunch 120 people × ₹260, + "Samosa" in Vilayadal Evening).
 * Rasterise with: pdftoppm -r 60 -png <outDir>/chef.pdf <outDir>/chef
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outDir = resolve(args.find((a) => !a.startsWith('--')) ?? 'pdf-out');
const scenario = args.includes('--scenario');

const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { setPdfAssetBase } = await server.ssrLoadModule('/src/pdf/assets.ts');
  const { renderPdfBuffer } = await server.ssrLoadModule('/src/pdf/render.tsx');
  const { buildSampleEvent, DEFAULT_BRAND } = await server.ssrLoadModule('/src/data/seed.ts');
  setPdfAssetBase(resolve(root, 'public') + '/');

  const event = buildSampleEvent(0);
  if (scenario) {
    const brunch = event.days[2].sessions[0];
    brunch.people = 120;
    brunch.pricing = { mode: 'perLeaf', rate: 260 };
    event.days[1].sessions[2].entries.push({ id: 'samosa', kind: 'dish', text: 'Samosa' });
  }

  mkdirSync(outDir, { recursive: true });
  for (const variant of ['chef', 'client']) {
    const buf = await renderPdfBuffer(event, DEFAULT_BRAND, variant);
    const file = resolve(outDir, `${variant}.pdf`);
    writeFileSync(file, buf);
    console.log(`wrote ${file} (${buf.length} bytes)`);
  }
} finally {
  await server.close();
}
