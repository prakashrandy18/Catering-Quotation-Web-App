import type { BrandSettings, AssistantSettings, CateringEvent, Day, MenuEntry, Pricing, Session } from '@/types';
import { newId } from '@/lib/id';

/**
 * Seed data = the menu in docs/reference/sample-pdf/Catering_Menu_Chef_Price_Request.pdf, exactly.
 * Dish order is the reading order of the sample's 3-column (column-major) lists.
 *
 * Rates: only the rates confirmed in the brief are filled in. Others are null ("Price missing")
 * so the app asks for them instead of inventing numbers.
 */

const dish = (text: string): MenuEntry => ({ id: newId('en'), kind: 'dish', text });
const gap = (): MenuEntry => ({ id: newId('en'), kind: 'gap', text: '' });
const heading = (text: string): MenuEntry => ({ id: newId('en'), kind: 'heading', text });
const dishes = (...names: string[]) => names.map(dish);

function session(
  name: string,
  icon: string,
  time: string | null,
  people: number | null,
  pricing: Pricing,
  entries: MenuEntry[],
): Session {
  return { id: newId('se'), name, icon, time, people, pricing, entries };
}

const perLeaf = (rate: number | null): Pricing => ({ mode: 'perLeaf', rate });

export function buildSampleEvent(now = Date.now()): CateringEvent {
  const day1: Day = {
    id: newId('dy'),
    date: '24-02-2027',
    title: 'Viratham & Reception',
    sessions: [
      session('Viratha Tiffin', '🍽️', '08:00', 100, perLeaf(null), dishes(
        'Ashoka Halwa', 'Thattu Idly', 'Milagu Pongal', 'Poori',
        'Medhu Vadai', 'Coconut Chutney', 'Poori Masala Kilangu', 'Sambar',
        'Idly Podi', 'Coffee',
      )),
      session('Viratha Lunch', '🍛', '12:30', 100, perLeaf(null), dishes(
        'Gulab Jamun', 'Vazhaipoo Vadai', 'Avarai Curry', 'Carrot Curd Pachadi', 'Aviyal', 'Poosani Kootu',
        'Semiya Payasam', 'White Rice', 'Dal', 'Ghee', 'Kalyana Sambar', 'Mysore Rasam',
        'Butter Milk', 'Appalam', 'Vethalai Paakku', 'Banana',
      )),
      session('Evening Snacks', '☕', '18:00', 500, perLeaf(null), dishes(
        'Pani Poori', 'Cutlet', 'Samosa', 'Bonda Bajji', 'Cheese Balls',
      )),
      session('Evening Beverages', '🥤', null, null, { mode: 'excluded' }, dishes(
        'Watermelon Juice', 'Milk Sarbath', 'Tea', 'Coffee', 'Boost', 'Rounding Badam Milk',
      )),
      session('Reception Dinner', '🌙', '20:00', 800, perLeaf(null), [
        ...dishes(
          'Rasamalai', 'Sandwich Sweet', 'Elaneer Payasam', 'Gobi 65', 'Mini Sambar Idly', 'Veg Uthappam', 'Rumali Roti', 'Kadai Mushroom',
          'Idiyappam', 'Veg Paya', 'Palak Biryani', 'Onion Raita', 'Potato Chips', 'Sambar', 'Kara Chutney', 'National Poriyal',
          'Fresh Mango Oorugai', 'Bisibelabath with Kaara Boondi', 'White Rice', 'Rasam', 'Vatha Kulambu', 'Appalam',
        ),
        heading('Live Stall'),
        ...dishes('Fruit Salad', 'Ice Cream', 'Beeda'),
      ]),
    ],
  };

  const day2: Day = {
    id: newId('dy'),
    date: '25-02-2027',
    title: 'Muhurtham',
    sessions: [
      session('Muhurtham Morning Tiffin', '🌅', '07:30', 300, perLeaf(null), dishes(
        'Badam Halwa', 'Ghee Podi Idly', 'Masala Dosai', 'Poori',
        'Aappam', 'Coconut Milk', 'Pongal', 'Vada Curry',
        'Medhu Vadai', 'Sambar', 'Thakkali Chutney', 'Groundnut Chutney',
      )),
      session('Muhurtham Lunch', '🍛', '12:30', 300, perLeaf(null), dishes(
        'Kaju Katli', 'Mini Jangiri', 'Kalyana Payasam', 'Veg Biryani', 'Curd Pachadi', 'Beetroot Sweet Pachadi', 'Beans Usili', 'Malabar Aviyal',
        'Puli Inji', 'Veppilai Katti', 'White Rice', 'Ghee', 'Dal', 'Mixed Sambar', 'Vendakkai Moru Kulambu', 'Tomato Rasam',
        'Cup Curd', 'Puliyodharai', 'Nendhiram Chips', 'Aamai Vadai', 'Mango Pickle', 'Vethalai Paakku', 'Banana',
      )),
      session('Vilayadal Evening (Snacks)', '☕', '15:30', 200, perLeaf(100), dishes(
        'Mini Badusha', 'Mixture', 'Onion Pakoda', 'Tea', 'Coffee', 'Juice',
      )),
      session('Muhurtham Dinner', '🌙', '19:00', 100, perLeaf(300), dishes(
        'Jilebi', 'Paal Payasam', 'Curd Pachadi', 'Fruit Pachadi', 'Kose Poriyal',
        'Kathirikai Karamani Podi Curry', 'Chow Chow Kootu', 'Andhra Special Thakkali Oorugai', 'Veg Vadai', 'Papadam',
        'White Rice', 'Sambar', 'Rasam', 'Coconut Rice',
      )),
    ],
  };

  const day3: Day = {
    id: newId('dy'),
    date: '26-02-2027',
    title: 'Brunch & Kattu Saatham',
    sessions: [
      session('Brunch', '🍲', '10:00', 100, perLeaf(250), [
        ...dishes(
          'Makkan Peda', 'Ada Pradhaman Payasam', 'Curd Vadai', 'Curd Pachadi', 'Arisi Appalam',
          'Seppankizhangu Roast', 'Poricha Kootu', 'Potato Podimas', 'Saatham (White Rice)', 'Milagu Kulambu',
          'Seeraga Rasam', 'Moru', 'Oorugai', 'Ice Cream (Kulfi)',
        ),
        gap(),
        ...dishes('Omam Water', 'Vethalai Rasikala Paakku'),
      ]),
      session('Kattu Saatham', '🛍️', '12:00', 100, perLeaf(100), dishes(
        'Puli Saatham', 'Curd Saatham', 'Podi Idly', 'Water Bottle', 'Spoon', 'Carry Bag',
      )),
    ],
  };

  return {
    id: newId('ev'),
    name: 'Thara Wedding',
    clientName: 'Thara',
    clientPhone: '',
    location: 'Avadi',
    status: 'draft',
    days: [day1, day2, day3],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

/** A blank event skeleton with one day per date. */
export function buildBlankEvent(name: string, dates: string[], location: string, now = Date.now()): CateringEvent {
  return {
    id: newId('ev'),
    name: name.trim() || 'New event',
    clientName: '',
    clientPhone: '',
    location: location.trim(),
    status: 'draft',
    days: dates.map((date, i) => ({ id: newId('dy'), date, title: `Day ${i + 1}`, sessions: [] })),
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

/** Wedding template: typical 2-day structure with empty menus. */
export function buildWeddingTemplate(name: string, dates: string[], location: string, now = Date.now()): CateringEvent {
  const e = buildBlankEvent(name, dates, location, now);
  const blank = (n: string, icon: string, time: string | null, people: number | null): Session =>
    session(n, icon, time, people, perLeaf(null), []);
  if (e.days[0]) {
    e.days[0].title = 'Viratham & Reception';
    e.days[0].sessions = [
      blank('Viratha Tiffin', '🍽️', '08:00', 100),
      blank('Viratha Lunch', '🍛', '12:30', 100),
      blank('Evening Snacks', '☕', '18:00', 300),
      blank('Reception Dinner', '🌙', '20:00', 500),
    ];
  }
  if (e.days[1]) {
    e.days[1].title = 'Muhurtham';
    e.days[1].sessions = [
      blank('Muhurtham Morning Tiffin', '🌅', '07:30', 300),
      blank('Muhurtham Lunch', '🍛', '12:30', 300),
    ];
  }
  return e;
}

export const DEFAULT_BRAND: BrandSettings = {
  businessName: 'Dream Light Event Management',
  logoDataUrl: null,
  brandColor: '#2D5A12',
  headingFont: 'Poppins',
  clientPdfTitle: 'Marriage Proposal Quotation',
  chefPdfTitle: 'Catering Menu Price Request',
  contactName: 'Akash R',
  contactPhone: '8122831347',
  paymentTerms: '',
  chefNote:
    'Please review the menu below for an upcoming wedding. Kindly share your best rate per leaf for each session. Write your rates in the price sheet on the last page and send it back to us.',
};

export const DEFAULT_ASSISTANT: AssistantSettings = {
  apiKey: '',
  model: 'claude-sonnet-5-5',
  proxyUrl: '',
  voiceLang: 'en-IN',
};

/** Emoji choices offered when creating a meal. */
export const SESSION_ICONS: { icon: string; label: string }[] = [
  { icon: '🍽️', label: 'Tiffin' },
  { icon: '🌅', label: 'Morning' },
  { icon: '🍛', label: 'Lunch' },
  { icon: '☕', label: 'Snacks' },
  { icon: '🥤', label: 'Drinks' },
  { icon: '🌙', label: 'Dinner' },
  { icon: '🍲', label: 'Brunch' },
  { icon: '🛍️', label: 'Parcel' },
];
