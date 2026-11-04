/**
 * Where the PDF generator finds its fonts / images.
 *
 * Browser: relative to document.baseURI, so it works under any GitHub Pages sub-path.
 * Node (tests, scripts/render-pdf): call setPdfAssetBase('/abs/path/to/public/').
 */
import { Font } from '@react-pdf/renderer';

let assetBase: string | null = null;

export function setPdfAssetBase(base: string): void {
  assetBase = base.endsWith('/') ? base : base + '/';
}

export function assetUrl(rel: string): string {
  if (assetBase !== null) return assetBase + rel;
  if (typeof document !== 'undefined' && document.baseURI) return new URL(rel, document.baseURI).href;
  return rel;
}

export const ASSETS = {
  poppinsRegular: 'fonts/Poppins-Regular.ttf',
  poppinsBold: 'fonts/Poppins-Bold.ttf',
  texture: 'pdf/header-texture.jpg',
  logo: 'brand/logo.png',
  emoji: (file: string) => `emoji/${file}.png`,
};

let registeredFor: string | null = null;

/** Idempotent: registers Poppins and turns off hyphenation (dish names must never be split). */
export function registerPdfAssets(): void {
  const key = assetUrl('');
  if (registeredFor === key) return;
  registeredFor = key;
  Font.register({
    family: 'Poppins',
    fonts: [
      { src: assetUrl(ASSETS.poppinsRegular), fontWeight: 400 },
      { src: assetUrl(ASSETS.poppinsBold), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word: string) => [word]);
}
