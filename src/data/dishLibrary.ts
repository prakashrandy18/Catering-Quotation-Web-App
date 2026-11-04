import type { Dish, DishCategory } from '@/types';

/**
 * Built-in dish library: every dish in the sample PDF + common South Indian wedding dishes,
 * spelled the way this business writes them (Kulambu, Oorugai, Saatham …).
 * The user's own additions are stored separately in the app store (customDishes).
 */
const RAW: Record<DishCategory, string[]> = {
  Sweet: [
    'Ashoka Halwa', 'Badam Halwa', 'Carrot Halwa', 'Kasi Halwa', 'Gulab Jamun', 'Rasamalai', 'Sandwich Sweet',
    'Kaju Katli', 'Mini Jangiri', 'Jangiri', 'Jilebi', 'Mini Badusha', 'Badusha', 'Makkan Peda', 'Mysore Pak',
    'Laddu', 'Boondi Laddu', 'Rava Kesari', 'Sakkarai Pongal', 'Akkaravadisal', 'Semiya Payasam', 'Paal Payasam',
    'Elaneer Payasam', 'Kalyana Payasam', 'Ada Pradhaman Payasam', 'Paruppu Payasam', 'Beetroot Sweet Pachadi',
    'Ice Cream', 'Ice Cream (Kulfi)', 'Fruit Salad', 'Rasmalai',
  ],
  Tiffin: [
    'Thattu Idly', 'Idly', 'Mini Sambar Idly', 'Ghee Podi Idly', 'Podi Idly', 'Milagu Pongal', 'Pongal', 'Ven Pongal',
    'Poori', 'Poori Masala Kilangu', 'Masala Dosai', 'Rava Dosai', 'Ghee Roast Dosai', 'Onion Rava Dosai',
    'Veg Uthappam', 'Aappam', 'Idiyappam', 'Rava Upma', 'Semiya Upma', 'Kichadi', 'Paniyaram', 'Rumali Roti',
    'Chapati', 'Parotta', 'Vada Curry', 'Kurma', 'Coconut Milk',
  ],
  Rice: [
    'White Rice', 'Saatham (White Rice)', 'Veg Biryani', 'Palak Biryani', 'Bisibelabath with Kaara Boondi',
    'Bisibelabath', 'Puliyodharai', 'Puli Saatham', 'Curd Saatham', 'Curd Rice', 'Coconut Rice', 'Lemon Rice',
    'Tomato Rice', 'Ghee Rice', 'Jeera Rice', 'Veg Pulao', 'Fried Rice',
  ],
  'Kulambu & Rasam': [
    'Sambar', 'Kalyana Sambar', 'Mixed Sambar', 'Vatha Kulambu', 'Milagu Kulambu', 'Vendakkai Moru Kulambu',
    'Moru Kulambu', 'Kara Kulambu', 'Rasam', 'Mysore Rasam', 'Tomato Rasam', 'Seeraga Rasam', 'Pepper Rasam',
    'Dal', 'Veg Paya',
  ],
  'Poriyal & Kootu': [
    'Avarai Curry', 'Aviyal', 'Malabar Aviyal', 'Poosani Kootu', 'Chow Chow Kootu', 'Poricha Kootu', 'Beans Usili',
    'Kose Poriyal', 'National Poriyal', 'Cabbage Poriyal', 'Beans Poriyal', 'Carrot Poriyal',
    'Kathirikai Karamani Podi Curry', 'Seppankizhangu Roast', 'Senai Roast', 'Potato Podimas', 'Potato Fry',
    'Gobi 65', 'Kadai Mushroom', 'Paneer Butter Masala',
  ],
  'Vadai & Snacks': [
    'Medhu Vadai', 'Vazhaipoo Vadai', 'Aamai Vadai', 'Masala Vadai', 'Keerai Vadai', 'Sambar Vadai', 'Curd Vadai',
    'Veg Vadai', 'Pani Poori', 'Samosa', 'Cutlet', 'Bonda Bajji', 'Bajji', 'Cheese Balls', 'Mixture', 'Onion Pakoda',
    'Potato Chips', 'Nendhiram Chips', 'Appalam', 'Arisi Appalam', 'Papadam',
  ],
  'Pachadi & Pickle': [
    'Carrot Curd Pachadi', 'Curd Pachadi', 'Fruit Pachadi', 'Onion Raita', 'Puli Inji', 'Veppilai Katti',
    'Mango Pickle', 'Fresh Mango Oorugai', 'Andhra Special Thakkali Oorugai', 'Oorugai', 'Lemon Pickle',
    'Coconut Chutney', 'Thakkali Chutney', 'Groundnut Chutney', 'Kara Chutney', 'Idly Podi',
  ],
  Drinks: [
    'Coffee', 'Tea', 'Boost', 'Juice', 'Watermelon Juice', 'Milk Sarbath', 'Rounding Badam Milk', 'Badam Milk',
    'Rose Milk', 'Butter Milk', 'Moru', 'Omam Water', 'Lime Juice',
  ],
  'North Indian': ['Chapati', 'Naan', 'Kurma', 'Chana Masala', 'Dal Makhani', 'Gobi Manchurian', 'Noodles'],
  Others: [
    'Ghee', 'Cup Curd', 'Banana', 'Vethalai Paakku', 'Vethalai Rasikala Paakku', 'Beeda', 'Water Bottle', 'Spoon',
    'Carry Bag',
  ],
};

function build(): Dish[] {
  const seen = new Set<string>();
  const out: Dish[] = [];
  (Object.keys(RAW) as DishCategory[]).forEach((category) => {
    RAW[category].forEach((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name, category });
    });
  });
  return out;
}

export const DISH_LIBRARY: Dish[] = build();
