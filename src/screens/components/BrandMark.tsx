import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { BrandSettings } from '@/types';

/** The bundled default logo (may not exist; then initials are shown). */
export const DEFAULT_LOGO_URL = `${import.meta.env.BASE_URL}brand/logo.png`;

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'CQ';
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** null = default bundled logo, '' = no logo (initials), otherwise a data URL. */
export function logoSource(brand: Pick<BrandSettings, 'logoDataUrl'>): string | null {
  if (brand.logoDataUrl === null) return DEFAULT_LOGO_URL;
  return brand.logoDataUrl || null;
}

interface Props {
  brand: Pick<BrandSettings, 'logoDataUrl' | 'businessName' | 'brandColor'>;
  size?: number;
  className?: string;
  /** Use an explicit colour instead of the CSS brand variable (for previews). */
  color?: string;
}

/** Logo image or a coloured square with the business initials. */
export function BrandMark({ brand, size = 44, className, color }: Props) {
  const src = logoSource(brand);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const showImg = !!src && !failed;
  return (
    <div
      aria-hidden="true"
      className={clsx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] font-display font-bold text-white',
        !color && 'bg-brand',
        showImg && 'border border-paper-line !bg-white',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34), background: showImg ? undefined : color }}
    >
      {showImg ? <img src={src!} alt="" className="h-full w-full object-contain" onError={() => setFailed(true)} /> : initialsOf(brand.businessName)}
    </div>
  );
}
