import clsx from 'clsx';
import { useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/toast';
import { brandPalette, contrastRatio } from '@/lib/theme';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Sheet';
import { Field, TextArea } from '@/components/ui/Field';
import { IconWarning } from '@/components/ui/icons';
import AssistantSettingsCard from '@/assistant/AssistantSettingsCard';
import { BackupCard } from './components/BackupCard';
import { BrandMark, logoSource } from './components/BrandMark';
import { resizeLogo } from './components/resizeLogo';
import { Card, PageHeader, Segmented, useScrollTop } from './components/ui';

const SWATCHES = [
  { name: 'Forest green', hex: '#2D5A12' },
  { name: 'Maroon', hex: '#7A1F2B' },
  { name: 'Royal blue', hex: '#1F4E79' },
  { name: 'Temple gold', hex: '#8A6508' },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="font-display text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Small mock-up of the PDF cover: updates live as the colour, font, name and logo change. */
function CoverPreview() {
  const brand = useAppStore((s) => s.brand);
  const p = brandPalette(brand.brandColor);
  const font = brand.headingFont === 'Helvetica' ? 'Helvetica, Arial, sans-serif' : 'Poppins, system-ui, sans-serif';
  const showLogo = !!logoSource(brand);
  return (
    <div aria-label="Preview of the first page of your PDF" role="img" className="overflow-hidden rounded-lg bg-white shadow-[0_6px_18px_rgba(0,0,0,0.12)]">
      <div className="flex flex-col items-center gap-2 px-4 py-5 text-center" style={{ background: `linear-gradient(${p.soft}, ${p.tint})` }}>
        {showLogo && <BrandMark brand={brand} size={48} color={p.base} />}
        <div className="text-[19px] font-bold uppercase leading-tight" style={{ color: p.base, fontFamily: font }}>
          {brand.clientPdfTitle || 'Quotation'}
        </div>
        <div className="text-sm font-medium" style={{ color: p.base }}>
          {brand.businessName || 'Your business name'}
        </div>
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <div className="rounded px-2.5 py-1.5 text-[13px] font-bold text-white" style={{ background: p.base }}>
          Day 1 &nbsp;24-02-2027 — Viratham &amp; Reception
        </div>
        <div className="mt-2 space-y-1.5" aria-hidden="true">
          <div className="h-2 w-3/4 rounded bg-paper-line" />
          <div className="h-2 w-1/2 rounded bg-paper-line" />
        </div>
      </div>
    </div>
  );
}

function LogoAndColours() {
  const brand = useAppStore((s) => s.brand);
  const updateBrand = useAppStore((s) => s.updateBrand);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const color = brand.brandColor;
  const preset = SWATCHES.find((s) => s.hex.toLowerCase() === color.toLowerCase());
  const palette = brandPalette(color);
  const whiteContrast = contrastRatio(palette.base, '#ffffff');

  const onLogo = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const url = await resizeLogo(file);
      updateBrand({ logoDataUrl: url });
      toast({ text: 'Logo changed', tone: 'success' });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : 'Could not use this picture.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="logo-h" title="Logo & colours">
      <div className="flex flex-col gap-2">
        <span id="colour-label" className="text-[15px] font-semibold">
          Brand colour
        </span>
        <div role="group" aria-labelledby="colour-label" className="grid grid-cols-5 gap-1">
          {SWATCHES.map((s) => {
            const on = preset?.hex === s.hex;
            return (
              <button
                key={s.hex}
                type="button"
                aria-pressed={on}
                aria-label={s.name}
                onClick={() => updateBrand({ brandColor: s.hex })}
                className="flex min-h-[44px] flex-col items-center gap-1 rounded-2xl p-1 text-[13px] font-medium text-ink hover:bg-paper-sunk"
              >
                <span
                  className={clsx('flex h-12 w-12 items-center justify-center rounded-[14px] text-white ring-offset-2', on ? 'ring-2 ring-ink' : '')}
                  style={{ background: s.hex }}
                >
                  {on && <span aria-hidden="true">✓</span>}
                </span>
                {s.name}
              </button>
            );
          })}
          <label className="relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl p-1 text-[13px] font-medium text-ink hover:bg-paper-sunk focus-within:outline focus-within:outline-2 focus-within:outline-brand">
            <span
              className={clsx('flex h-12 w-12 items-center justify-center rounded-[14px] border-2 border-dashed border-paper-strong ring-offset-2', !preset && 'ring-2 ring-ink')}
              style={!preset ? { background: color } : undefined}
            >
              {!preset ? <span className="text-white" aria-hidden="true">✓</span> : <span aria-hidden="true" className="text-xl text-ink-muted">+</span>}
            </span>
            Custom
            <input
              type="color"
              aria-label="Custom colour"
              value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#2D5A12'}
              onChange={(e) => updateBrand({ brandColor: e.target.value.toUpperCase() })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
        <p className="text-sm text-ink-muted">
          Now: {preset ? preset.name : 'Custom colour'} {color.toUpperCase()}
        </p>
        {!palette.whiteTextOk && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-[15px] font-medium text-warn">
            <IconWarning size={18} className="mt-0.5 shrink-0" />
            White words may be hard to read on this colour ({whiteContrast.toFixed(1)} to 1). Please choose a darker colour.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-[15px] font-semibold">Logo</span>
        <div className="flex items-center gap-4">
          <BrandMark brand={brand} size={72} className="!rounded-2xl" />
          <div className="flex flex-1 flex-wrap gap-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              Change logo
            </Button>
            {logoSource(brand) && (
              <Button variant="ghost" onClick={() => updateBrand({ logoDataUrl: '' })}>
                Remove logo
              </Button>
            )}
            {brand.logoDataUrl !== null && (
              <Button variant="ghost" onClick={() => updateBrand({ logoDataUrl: null })}>
                Use default logo
              </Button>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only-text"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="logo-file"
          onChange={(e) => void onLogo(e.target.files?.[0])}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">Heading font</span>
        <Segmented
          label="Heading font"
          value={brand.headingFont}
          options={[
            { value: 'Poppins', label: 'Poppins' },
            { value: 'Helvetica', label: 'Helvetica' },
          ]}
          onChange={(v) => updateBrand({ headingFont: v })}
        />
      </div>
    </Section>
  );
}

function PdfText() {
  const brand = useAppStore((s) => s.brand);
  const updateBrand = useAppStore((s) => s.updateBrand);
  return (
    <Section id="pdf-h" title="PDF text">
      <Field label="Business name" value={brand.businessName} onChange={(e) => updateBrand({ businessName: e.target.value })} autoComplete="off" />
      <Field label="Client PDF title" value={brand.clientPdfTitle} onChange={(e) => updateBrand({ clientPdfTitle: e.target.value })} autoComplete="off" />
      <Field label="Chef PDF title" value={brand.chefPdfTitle} onChange={(e) => updateBrand({ chefPdfTitle: e.target.value })} autoComplete="off" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Contact name" value={brand.contactName} onChange={(e) => updateBrand({ contactName: e.target.value })} autoComplete="off" />
        <Field
          label="Contact phone"
          type="tel"
          inputMode="tel"
          value={brand.contactPhone}
          onChange={(e) => updateBrand({ contactPhone: e.target.value })}
          autoComplete="off"
        />
      </div>
      <TextArea
        label="Payment terms"
        hint="One line for each point. Leave empty to hide."
        rows={4}
        value={brand.paymentTerms}
        onChange={(e) => updateBrand({ paymentTerms: e.target.value })}
      />
      <TextArea label="Note to chef" rows={4} value={brand.chefNote} onChange={(e) => updateBrand({ chefNote: e.target.value })} />
    </Section>
  );
}

export default function SettingsScreen() {
  useScrollTop();
  const resetToSample = useAppStore((s) => s.resetToSample);
  const replaceAll = useAppStore((s) => s.replaceAll);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="min-h-dvh bg-paper pb-12">
      <PageHeader title="Settings" subtitle="Logo, colours, PDF text and backup" backTo="/" backLabel="Back to events" />
      <div className="mx-auto grid w-full max-w-2xl gap-6 px-5 py-6 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10">
        <div className="lg:order-2 lg:sticky lg:top-[76px]">
          <p className="mb-2 text-[15px] font-semibold">How your PDF looks</p>
          <CoverPreview />
        </div>

        <div className="flex min-w-0 flex-col gap-8 lg:order-1">
          <LogoAndColours />
          <PdfText />

          <Section id="claude-h" title="Claude assistant">
            <AssistantSettingsCard />
          </Section>

          <Section id="backup-h" title="Backup & restore">
            <BackupCard />
            <Card className="flex flex-col gap-2">
              <p className="font-semibold">Start again with the sample event</p>
              <p className="text-[15px] text-ink-muted">This removes all your events and puts back the Thara Wedding sample. Your logo and colours stay.</p>
              <Button variant="danger" className="self-start" onClick={() => setConfirmReset(true)}>
                Start again with the sample event
              </Button>
            </Card>
          </Section>

          <p className="text-[15px] text-ink-muted">Anyone with this link can open the app, but your events stay on this phone.</p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Start again?"
        message="All events on this phone will be replaced by the sample event. Save a backup first if you want to keep them."
        confirmLabel="Yes, start again"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          // keep logo, colours, saved dishes and the Claude key; only the events start again
          const { brand, assistant, customDishes } = useAppStore.getState();
          resetToSample();
          replaceAll({ brand, assistant, customDishes });
          toast({ text: 'Back to the sample event', tone: 'success' });
        }}
      />
    </div>
  );
}
