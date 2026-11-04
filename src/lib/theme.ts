/** Brand colour → CSS variables used by Tailwind's `brand` colour (see tailwind.config.js). */

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** Mix colour a towards b by t (0..1). */
export function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const la = relativeLuminance(ra);
  const lb = relativeLuminance(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Derived palette for a brand colour (also used by the PDF). */
export function brandPalette(hex: string) {
  const base = hexToRgb(hex) ?? [45, 90, 18];
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  return {
    base: rgbToHex(base),
    dark: rgbToHex(mix(base, black, 0.25)),
    soft: rgbToHex(mix(base, white, 0.85)), // chips / total boxes (≈ #E6EEDF for the default green)
    tint: rgbToHex(mix(base, white, 0.93)), // selected rows (≈ #F1F6EC)
    /** Whether white text is readable on the brand colour (≥ 4.5:1). */
    whiteTextOk: contrastRatio(rgbToHex(base), '#ffffff') >= 4.5,
  };
}

export function applyBrandColor(hex: string): void {
  const p = brandPalette(hex);
  const root = document.documentElement;
  const toVar = (h: string) => (hexToRgb(h) ?? [0, 0, 0]).join(' ');
  root.style.setProperty('--brand', toVar(p.base));
  root.style.setProperty('--brand-dark', toVar(p.dark));
  root.style.setProperty('--brand-soft', toVar(p.soft));
  root.style.setProperty('--brand-tint', toVar(p.tint));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', p.base);
}
