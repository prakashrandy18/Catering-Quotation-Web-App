/**
 * The quotation PDF (client) / price request PDF (chef), built with @react-pdf/renderer.
 * Measurements reproduce docs/reference/sample-pdf (1 CSS px of the sample = 0.75 pt).
 */
import type { ReactNode } from 'react';
import { Defs, Document, Image, LinearGradient, Page, Rect, Stop, Svg, Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { formatIndianNumber } from '@/lib/format';
import { ASSETS, assetUrl } from './assets';
import type {
  BreakdownDay,
  ChefModel,
  ChefSheetDay,
  ClientCard,
  ClientModel,
  ClientPrice,
  ColumnBlock,
  MenuCard,
  PdfModel,
} from './model';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const PAGE_W = 595.28;
const PAD_TOP = 21;
const PAD_X = 30;
const PAD_BOTTOM = 28;
const HEADER_H = 127.5;

const INK = '#1a1a1a';
const MUTED = '#555555';
const BOX = '#EBEBE9';
const CARD = '#F5F5F3';
const DAY_ROW = '#F0F0EC';
const ROW_LINE = '#D8D8D4';
const CELL_LINE = '#E3E3E0';
const DANGER = '#A1281A';

const BODY = 9.375;
const H = 'Helvetica';
const HB = 'Helvetica-Bold';

/** Session cards with more entries than this may split across pages. */
const CARD_NO_WRAP_MAX = 45;

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** Helvetica has no ₹ glyph: draw every ₹ in Poppins. */
function rupeeSplit(text: string, bold?: boolean): ReactNode[] {
  const parts = text.split('₹');
  const out: ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i > 0)
      out.push(
        <Text key={`r${i}`} style={{ fontFamily: 'Poppins', fontWeight: bold ? 700 : 400 }}>
          ₹
        </Text>,
      );
    if (p) out.push(p);
  });
  return out;
}

function RText({ children, style, bold }: { children: string; style?: Style | Style[]; bold?: boolean }) {
  return <Text style={style}>{children.includes('₹') ? rupeeSplit(children, bold) : children}</Text>;
}

/** ₹31,200 with the symbol in Poppins. */
function Money({ value, bold, suffix }: { value: number; bold?: boolean; suffix?: string }) {
  return (
    <>
      <Text style={{ fontFamily: 'Poppins', fontWeight: bold ? 700 : 400 }}>₹</Text>
      {formatIndianNumber(value)}
      {suffix ?? ''}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function Header({ model }: { model: PdfModel }) {
  const { header, palette, fonts } = model;
  const lines = header.titleLines;
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const titleSize = Math.min(25.5, (25.5 * 24) / longest);
  const twoLines = lines.length > 1;
  return (
    <View style={{ marginTop: -PAD_TOP, marginHorizontal: -PAD_X, height: HEADER_H, position: 'relative' }}>
      {header.texture ? (
        <Image src={assetUrl(ASSETS.texture)} style={{ position: 'absolute', top: 0, left: 0, width: PAGE_W, height: HEADER_H, objectFit: 'cover' }} />
      ) : (
        <Svg style={{ position: 'absolute', top: 0, left: 0, width: PAGE_W, height: HEADER_H }} viewBox={`0 0 ${PAGE_W} ${HEADER_H}`}>
          <Defs>
            <LinearGradient id="band" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette.headerTop} />
              <Stop offset="1" stopColor={palette.headerBottom} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={String(PAGE_W)} height={String(HEADER_H)} fill="url(#band)" />
        </Svg>
      )}
      {header.logo.kind === 'bundled' && (
        <Image src={assetUrl(ASSETS.logo)} style={{ position: 'absolute', left: 51.3, top: 30.5, width: 22, height: 14.6 }} />
      )}
      {header.logo.kind === 'image' && (
        <Image
          src={header.logo.src}
          style={{ position: 'absolute', left: 40, top: 22, width: 56, height: 36, objectFit: 'contain', objectPosition: 'left top' }}
        />
      )}
      <View style={{ position: 'absolute', left: 110, right: 110, top: twoLines ? 25 : 38.6, alignItems: 'center' }}>
        {lines.map((l, i) => (
          <Text
            key={i}
            style={{
              fontFamily: fonts.heading,
              fontWeight: fonts.heading === 'Poppins' ? 700 : undefined,
              fontSize: titleSize,
              lineHeight: 27 / titleSize,
              color: palette.brand,
              textAlign: 'center',
            }}
          >
            {l}
          </Text>
        ))}
        {header.businessName ? (
          <Text style={{ fontFamily: H, fontSize: 8.25, color: palette.brand, marginTop: 14.9, textAlign: 'center' }}>{header.businessName}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Intro({ model }: { model: PdfModel }) {
  return (
    <View style={{ marginTop: 17.8 }}>
      <Text style={{ fontSize: BODY, lineHeight: 1.6 }}>{model.greeting}</Text>
      {model.paragraphs.map((p, i) => (
        <RText key={i} style={{ fontSize: BODY, lineHeight: 1.6, marginTop: 6.7 }}>
          {p}
        </RText>
      ))}
    </View>
  );
}

function TitleBox({ title, model, style }: { title: string; model: PdfModel; style?: Style }) {
  return (
    <View
      style={{
        backgroundColor: BOX,
        borderRadius: 6,
        height: 42.75,
        paddingLeft: 13.5,
        justifyContent: 'center',
        ...style,
      }}
    >
      <Text
        style={{
          fontFamily: model.fonts.heading,
          fontWeight: model.fonts.heading === 'Poppins' ? 700 : undefined,
          fontSize: 14.25,
          color: model.palette.brand,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

function EventInfo({ model }: { model: PdfModel }) {
  const rows: { label: string; value: string }[][] = [];
  for (let i = 0; i < model.info.length; i += 2) rows.push(model.info.slice(i, i + 2));
  return (
    <View>
      <TitleBox title="Event Information" model={model} style={{ marginTop: 9.1 }} />
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', marginTop: i === 0 ? 9.8 : 6 }}>
          {r.map((c, ci) => (
            <View key={c.label} style={ci === 0 ? { width: 260.25, marginRight: 15 } : { flex: 1 }}>
              <Text style={{ fontFamily: HB, fontSize: BODY, lineHeight: 1.12 }}>{c.label}</Text>
              <RText style={{ fontSize: BODY, lineHeight: 1.12 }}>{c.value}</RText>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Emoji({ file, size, style }: { file: string; size: number; style?: Style }) {
  return <Image src={assetUrl(ASSETS.emoji(file))} style={{ width: size, height: size, ...style }} />;
}

function MenuDetailsTitle() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12.2, marginBottom: 10.4 }}>
      <Emoji file="1f37d" size={17} style={{ marginRight: 6.5 }} />
      <Text style={{ fontFamily: HB, fontSize: 15.75, lineHeight: 1.15 }}>Menu Details</Text>
    </View>
  );
}

function DayBar({ index, date, title, model, first }: { index: number; date: string; title: string; model: PdfModel; first: boolean }) {
  const { palette } = model;
  return (
    <View
      style={{
        backgroundColor: palette.brand,
        height: 21,
        borderRadius: 2.5,
        paddingLeft: 9,
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: first ? 0 : 1.3,
        marginBottom: 7.6,
      }}
    >
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 2, paddingHorizontal: 6, paddingVertical: 1.2 }}>
        <Text style={{ fontFamily: HB, fontSize: 10.5, color: palette.brand }}>Day {index}</Text>
      </View>
      <Text style={{ fontFamily: HB, fontSize: 10.5, color: palette.onBrand, marginLeft: 7.7 }}>
        {date}
        <Text style={{ fontFamily: H }}>{title ? ` — ${title}` : ''}</Text>
      </Text>
    </View>
  );
}

const COL_W = 170.75;

function DishColumns({ block, first }: { block: ColumnBlock; first: boolean }) {
  const hasDishes = block.columns.some((c) => c.length);
  return (
    <View>
      {block.gapBefore && !first && (
        <View style={{ marginTop: 9.3, marginBottom: 8.2, borderTopWidth: 0.75, borderTopColor: '#D6D6D1', borderStyle: 'dashed' }} />
      )}
      {block.heading && (
        <Text style={{ fontFamily: HB, fontSize: BODY, textDecoration: 'underline', marginTop: first ? 0 : 5.7, marginBottom: 0.6, lineHeight: 1.25 }}>
          {block.heading}
        </Text>
      )}
      {hasDishes && (
        <View style={{ flexDirection: 'row' }}>
          {block.columns.map((col, ci) => (
            <View key={ci} style={{ width: COL_W, paddingRight: 6 }}>
              {col.map((d, di) => (
                <View key={di} style={{ flexDirection: 'row', paddingTop: 1.9, paddingBottom: 1.9 }} wrap={false}>
                  <View style={{ width: 15, paddingLeft: 4.5, paddingTop: 4.4 }}>
                    <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: INK }} />
                  </View>
                  <RText style={{ flex: 1, fontSize: BODY, lineHeight: 1.25 }}>{d}</RText>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function CardTitle({ card, model, right }: { card: MenuCard; model: PdfModel; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 3.6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexGrow: 1, flexShrink: 1, flexWrap: 'wrap' }}>
        <Emoji file={card.icon} size={10.5} style={{ marginRight: 4.2, marginBottom: 1.6 }} />
        <Text style={{ fontFamily: HB, fontSize: 11.25, lineHeight: 1.2, marginRight: 8.1 }}>{card.name}</Text>
        <RText bold style={{ fontFamily: HB, fontSize: 7.5, color: model.palette.brand, marginBottom: 1.4 }}>
          {card.meta}
        </RText>
      </View>
      {right}
    </View>
  );
}

function cardStyle(model: PdfModel): Style {
  return {
    backgroundColor: CARD,
    borderLeftWidth: 2.25,
    borderLeftColor: model.palette.brand,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 4.5,
    borderBottomRightRadius: 4.5,
    paddingTop: 7.4,
    paddingLeft: 10.5,
    paddingRight: 10.5,
    paddingBottom: 7.7,
    marginBottom: 9,
  };
}

function SessionCard({ card, model, right, footer }: { card: MenuCard; model: PdfModel; right?: ReactNode; footer?: ReactNode }) {
  return (
    <View style={cardStyle(model)} wrap={card.entryCount > CARD_NO_WRAP_MAX}>
      <CardTitle card={card} model={model} right={right} />
      {card.blocks.map((b, i) => (
        <DishColumns key={i} block={b} first={i === 0} />
      ))}
      {footer}
    </View>
  );
}

function SignOff({ model }: { model: PdfModel }) {
  const s = model.signOff;
  return (
    <View style={{ marginTop: 26.3 }} wrap={false}>
      <Text style={{ fontSize: BODY, lineHeight: 1.6 }}>{s.thanks}</Text>
      {s.contact ? <Text style={{ fontFamily: HB, fontSize: BODY, lineHeight: 1.6, marginTop: 6.8 }}>{s.contact}</Text> : null}
      {s.phone ? <Text style={{ fontFamily: HB, fontSize: BODY, lineHeight: 1.6 }}>{s.phone}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

const TABLE_FS = 8.25;

function Th({ children, width, align }: { children: ReactNode; width: string; align?: 'left' | 'center' | 'right' }) {
  return (
    <View style={{ width, paddingHorizontal: 4.5, justifyContent: 'center' }}>
      <Text style={{ fontFamily: HB, fontSize: TABLE_FS, textAlign: align ?? 'left' }}>{children}</Text>
    </View>
  );
}

function DayRow({ label, model }: { label: string; model: PdfModel }) {
  return (
    <View
      style={{ backgroundColor: DAY_ROW, height: 18.8, justifyContent: 'center', paddingHorizontal: 4.5, borderBottomWidth: 0.75, borderBottomColor: ROW_LINE }}
      wrap={false}
    >
      <Text style={{ fontFamily: HB, fontSize: TABLE_FS, color: model.palette.brand }}>{label}</Text>
    </View>
  );
}

function SessionCell({ icon, name, width }: { icon: string; name: string; width: string }) {
  return (
    <View style={{ width, paddingHorizontal: 4.5, flexDirection: 'row', alignItems: 'center' }}>
      <Emoji file={icon} size={8.4} style={{ marginRight: 3.4 }} />
      <Text style={{ fontSize: TABLE_FS, flex: 1 }}>{name}</Text>
    </View>
  );
}

function Cell({ children, width, align, border, style }: { children?: ReactNode; width: string; align?: 'left' | 'center' | 'right'; border?: boolean; style?: Style }) {
  return (
    <View
      style={{
        width,
        paddingHorizontal: 4.5,
        justifyContent: 'center',
        alignSelf: 'stretch',
        ...(border ? { borderLeftWidth: 0.75, borderLeftColor: CELL_LINE } : {}),
      }}
    >
      {children !== undefined && <Text style={{ fontSize: TABLE_FS, textAlign: align ?? 'left', ...style }}>{children}</Text>}
    </View>
  );
}

const rowStyle: Style = { flexDirection: 'row', minHeight: 24, borderBottomWidth: 0.75, borderBottomColor: ROW_LINE };

function ChefPriceSheet({ model }: { model: ChefModel }) {
  const W = ['34%', '22.1%', '11.9%', '16%', '16%'];
  return (
    <View break>
      <TitleBox title={model.priceSheet.title} model={model} style={{ marginTop: 0.6 }} />
      <View style={{ marginTop: 11.2 }}>
        <View style={{ flexDirection: 'row', height: 20.25, backgroundColor: BOX }} wrap={false}>
          <Th width={W[0]}>Session</Th>
          <Th width={W[1]}>Time</Th>
          <Th width={W[2]} align="center">
            People
          </Th>
          <Th width={W[3]}>
            Rate per Leaf (<Text style={{ fontFamily: 'Poppins', fontWeight: 700 }}>₹</Text>)
          </Th>
          <Th width={W[4]}>
            Total (<Text style={{ fontFamily: 'Poppins', fontWeight: 700 }}>₹</Text>)
          </Th>
        </View>
        {model.priceSheet.days.map((d: ChefSheetDay, i) => (
          <View key={i}>
            <DayRow label={d.label} model={model} />
            {d.rows.map((r, j) => (
              <View key={j} style={rowStyle} wrap={false}>
                <SessionCell icon={r.icon} name={r.name} width={W[0]} />
                <Cell width={W[1]}>{r.time}</Cell>
                <Cell width={W[2]} align="center">
                  {r.people}
                </Cell>
                <Cell width={W[3]} border />
                <Cell width={W[4]} border />
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={{ marginTop: 9.5 }} wrap={false}>
        <FillLine label="Grand Total (₹):" width={195} />
        <FillLine label="Notes / Extra Charges:" width={315} />
        <View style={{ borderTopWidth: 0.75, borderTopColor: '#555555', marginTop: 14.7, marginBottom: 5.6 }} />
        <FillLine label="Chef / Caterer Name:" width={195} />
        <FillLine label="Contact Number:" width={195} />
        <FillLine label="Signature & Date:" width={195} />
      </View>
      <SignOff model={model} />
    </View>
  );
}

function FillLine({ label, width }: { label: string; width: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 21.75 }}>
      <RText bold style={{ fontFamily: HB, fontSize: 9, lineHeight: 1.2 }}>
        {label}
      </RText>
      <View style={{ width, marginLeft: 2.5, borderBottomWidth: 0.75, borderBottomColor: '#333333', marginBottom: 1.8 }} />
    </View>
  );
}

function priceCells(p: ClientPrice) {
  switch (p.kind) {
    case 'perLeaf':
      return { rate: <Money value={p.rate} />, total: <Money value={p.total} bold /> };
    case 'fixed':
      return { rate: 'Fixed', total: <Money value={p.total} bold /> };
    case 'missing':
      return { rate: p.rate == null ? 'TBC' : <Money value={p.rate} />, total: 'TBC' };
    case 'excluded':
      return { rate: '—', total: 'Excluded' };
  }
}

function ClientBreakdown({ model }: { model: ClientModel }) {
  const W = ['44%', '14%', '21%', '21%'];
  const b = model.breakdown;
  return (
    <View break>
      <TitleBox title={b.title} model={model} style={{ marginTop: 0 }} />
      <View style={{ marginTop: 11.2 }}>
        <View style={{ flexDirection: 'row', height: 20.25, backgroundColor: BOX }} wrap={false}>
          <Th width={W[0]}>Session</Th>
          <Th width={W[1]} align="center">
            People
          </Th>
          <Th width={W[2]} align="right">
            Rate per Leaf (<Text style={{ fontFamily: 'Poppins', fontWeight: 700 }}>₹</Text>)
          </Th>
          <Th width={W[3]} align="right">
            Total (<Text style={{ fontFamily: 'Poppins', fontWeight: 700 }}>₹</Text>)
          </Th>
        </View>
        {b.days.map((d: BreakdownDay, i) => (
          <View key={i}>
            <DayRow label={d.label} model={model} />
            {d.rows.map((r, j) => {
              const c = priceCells(r.price);
              const muted = r.price.kind === 'excluded' || r.price.kind === 'missing';
              const tone = r.price.kind === 'missing' ? { color: DANGER } : r.price.kind === 'excluded' ? { color: MUTED } : {};
              return (
                <View key={j} style={{ ...rowStyle, minHeight: 22 }} wrap={false}>
                  <SessionCell icon={r.icon} name={r.name} width={W[0]} />
                  <Cell width={W[1]} align="center">
                    {r.people}
                  </Cell>
                  <Cell width={W[2]} align="right" style={muted ? tone : undefined}>
                    {c.rate}
                  </Cell>
                  <Cell width={W[3]} align="right" style={muted ? tone : { fontFamily: HB }}>
                    {c.total}
                  </Cell>
                </View>
              );
            })}
            <View style={{ ...rowStyle, minHeight: 20, backgroundColor: '#F7F7F5' }} wrap={false}>
              <Cell width="79%" align="right" style={{ fontFamily: HB }}>
                {d.subtotalLabel}
              </Cell>
              <Cell width="21%" align="right" style={d.subtotal == null ? { color: DANGER } : { fontFamily: HB }}>
                {d.subtotal == null ? 'TBC' : <Money value={d.subtotal} bold />}
              </Cell>
            </View>
          </View>
        ))}
        <View
          style={{ flexDirection: 'row', minHeight: 26, backgroundColor: model.palette.brand, alignItems: 'center', borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }}
          wrap={false}
        >
          <View style={{ width: '60%', paddingHorizontal: 6 }}>
            <Text style={{ fontFamily: HB, fontSize: 10.5, color: model.palette.onBrand }}>Grand Total</Text>
          </View>
          <View style={{ width: '40%', paddingHorizontal: 6 }}>
            <Text style={{ fontFamily: HB, fontSize: 10.5, color: model.palette.onBrand, textAlign: 'right' }}>
              {b.grandTotal == null ? 'To be confirmed' : <Money value={b.grandTotal} bold />}
            </Text>
          </View>
        </View>
      </View>
      {b.notes.length > 0 && (
        <View style={{ marginTop: 7 }}>
          {b.notes.map((n, i) => (
            <Text key={i} style={{ fontSize: 8.25, color: MUTED, lineHeight: 1.5 }}>
              {n}
            </Text>
          ))}
        </View>
      )}
      {model.eventNotes.length > 0 && (
        <View style={{ marginTop: 16 }} wrap={false}>
          <SectionTitle model={model}>Notes</SectionTitle>
          {model.eventNotes.map((n, i) => (
            <RText key={i} style={{ fontSize: BODY, lineHeight: 1.5 }}>
              {n}
            </RText>
          ))}
        </View>
      )}
      {model.paymentTerms.length > 0 && (
        <View style={{ marginTop: 16 }} wrap={false}>
          <SectionTitle model={model}>Payment Terms</SectionTitle>
          {model.paymentTerms.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', paddingVertical: 1.5 }}>
              <View style={{ width: 13, paddingLeft: 3, paddingTop: 4.4 }}>
                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: INK }} />
              </View>
              <RText style={{ flex: 1, fontSize: BODY, lineHeight: 1.35 }}>{t}</RText>
            </View>
          ))}
        </View>
      )}
      <SignOff model={model} />
    </View>
  );
}

function SectionTitle({ children, model }: { children: string; model: PdfModel }) {
  return (
    <Text
      style={{
        fontFamily: model.fonts.heading,
        fontWeight: model.fonts.heading === 'Poppins' ? 700 : undefined,
        fontSize: 12,
        color: model.palette.brand,
        marginBottom: 5,
      }}
    >
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* Menu pages                                                          */
/* ------------------------------------------------------------------ */

function ClientCardRight({ card }: { card: ClientCard }) {
  const p = card.price;
  if (p.kind === 'perLeaf' || p.kind === 'fixed')
    return (
      <Text style={{ fontFamily: HB, fontSize: 10.5, lineHeight: 1.2, color: INK, marginLeft: 8 }}>
        <Money value={p.total} bold />
      </Text>
    );
  if (p.kind === 'missing')
    return <Text style={{ fontFamily: HB, fontSize: 8.25, color: DANGER, marginLeft: 8, marginBottom: 1.6 }}>{p.label}</Text>;
  return <Text style={{ fontFamily: H, fontSize: 8.25, color: MUTED, marginLeft: 8, marginBottom: 1.6 }}>{p.label}</Text>;
}

function clientMeta(card: ClientCard): MenuCard {
  const p = card.price;
  if (p.kind === 'perLeaf' || (p.kind === 'missing' && p.rate != null)) {
    const rate = p.kind === 'perLeaf' ? p.rate : (p.rate as number);
    return { ...card, meta: `${card.meta}  •  ₹${formatIndianNumber(rate)}/leaf` };
  }
  if (p.kind === 'fixed') return { ...card, meta: `${card.meta}  •  Fixed price` };
  return card;
}

function DaySubtotal({ value }: { value: number | null }) {
  if (value == null) return <Text style={{ fontFamily: HB, fontSize: 8.25, color: DANGER }}>Rate to be confirmed</Text>;
  return (
    <Text style={{ fontFamily: HB, fontSize: 9 }}>
      <Money value={value} bold />
    </Text>
  );
}

function MenuSection({ model }: { model: PdfModel }) {
  const days = model.days;
  return (
    <>
      {days.map((day, di) => {
        const sessions = day.sessions as (MenuCard | ClientCard)[];
        const renderCard = (s: MenuCard | ClientCard, isLast: boolean) => {
          if (model.variant === 'client') {
            const c = s as ClientCard;
            const subtotal =
              isLast && model.variant === 'client' ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.75, borderTopColor: '#E3E3DF', marginTop: 6, paddingTop: 5 }}>
                  <Text style={{ fontFamily: HB, fontSize: 9 }}>Day {day.index} subtotal</Text>
                  <DaySubtotal value={(day as ClientModel['days'][number]).subtotal} />
                </View>
              ) : null;
            return <SessionCard key={s.id} card={clientMeta(c)} model={model} right={<ClientCardRight card={c} />} footer={subtotal} />;
          }
          return <SessionCard key={s.id} card={s} model={model} />;
        };
        const [first, ...rest] = sessions;
        return (
          <View key={di}>
            {/* the day bar never sits alone at the bottom of a page */}
            <View wrap={false}>
              {di === 0 && <MenuDetailsTitle />}
              <DayBar index={day.index} date={day.date} title={day.title} model={model} first={di === 0} />
              {first && renderCard(first, rest.length === 0)}
            </View>
            {rest.map((s, i) => renderCard(s, i === rest.length - 1))}
          </View>
        );
      })}
      {days.length === 0 && <MenuDetailsTitle />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

export function QuotationDocument({ model }: { model: PdfModel }) {
  return (
    <Document title={model.docTitle} author={model.author} creator={model.author} producer={model.author} language="en-IN">
      <Page
        size="A4"
        style={{
          paddingTop: PAD_TOP,
          paddingBottom: PAD_BOTTOM,
          paddingLeft: PAD_X,
          paddingRight: PAD_X,
          fontFamily: H,
          fontSize: BODY,
          color: INK,
          backgroundColor: '#FFFFFF',
        }}
      >
        <Header model={model} />
        <Intro model={model} />
        <EventInfo model={model} />
        <MenuSection model={model} />
        {model.variant === 'chef' ? <ChefPriceSheet model={model} /> : <ClientBreakdown model={model} />}
      </Page>
    </Document>
  );
}
