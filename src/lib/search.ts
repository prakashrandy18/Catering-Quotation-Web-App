import type { Dish } from '@/types';

/**
 * Phonetic-ish normalisation for Tanglish dish names so "vada curry", "Vadacurry",
 * "vadai kari" and "Vada Curry" land close together.
 */
export function normalizeDish(s: string): string {
  let t = s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const rules: [RegExp, string][] = [
    [/zh/g, 'l'],
    [/ll/g, 'l'],
    [/th/g, 't'],
    [/dh/g, 'd'],
    [/kh/g, 'k'],
    [/bh/g, 'b'],
    [/ph/g, 'p'],
    [/sh/g, 's'],
    [/ch/g, 's'],
    [/ee/g, 'i'],
    [/oo/g, 'u'],
    [/aa/g, 'a'],
    [/ou/g, 'u'],
    [/w/g, 'v'],
    [/y/g, 'i'],
    [/c/g, 'k'],
    [/q/g, 'k'],
    [/(.)\1+/g, '$1'],
    [/ai\b|ai$/g, 'a'],
  ];
  for (const [re, rep] of rules) t = t.replace(re, rep);
  // drop trailing vowels that Tanglish adds/removes freely (vadai/vada, kootu/koot)
  t = t.replace(/[aeiu]$/g, '');
  return t;
}

/** Levenshtein distance (small strings). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity between a query and a dish name (1 = same). */
export function similarity(query: string, name: string): number {
  const q = normalizeDish(query);
  const n = normalizeDish(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (n.startsWith(q)) return 0.92 - Math.min(0.2, (n.length - q.length) * 0.01);
  if (n.includes(q)) return 0.8 - Math.min(0.2, (n.length - q.length) * 0.01);
  const d = editDistance(q, n);
  return Math.max(0, 1 - d / Math.max(q.length, n.length));
}

export interface DishMatch extends Dish {
  score: number;
}

/** Search dishes for an autocomplete box. Plain substring matches rank first. */
export function searchDishes(query: string, dishes: Dish[], limit = 8): DishMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return dishes
    .map((d) => {
      const lower = d.name.toLowerCase();
      let score = similarity(q, d.name);
      if (lower.startsWith(q)) score = Math.max(score, 0.99);
      else if (lower.split(/\s+/).some((w) => w.startsWith(q))) score = Math.max(score, 0.95);
      else if (lower.includes(q)) score = Math.max(score, 0.9);
      return { ...d, score };
    })
    .filter((d) => d.score >= 0.45)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .slice(0, limit);
}

/**
 * Best library spelling for a typed dish, or null if the typed name is already a library name
 * or nothing is close enough. Used for "Did you mean …?".
 */
export function suggestSpelling(typed: string, dishes: Dish[]): Dish | null {
  const exact = dishes.find((d) => d.name.toLowerCase() === typed.trim().toLowerCase());
  if (exact) return null;
  let best: DishMatch | null = null;
  for (const d of dishes) {
    const score = similarity(typed, d.name);
    if (!best || score > best.score) best = { ...d, score };
  }
  return best && best.score >= 0.6 ? { name: best.name, category: best.category } : null;
}

/** Title-case a typed dish name: "poori masala kilangu" → "Poori Masala Kilangu". */
export function tidyDishName(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w.length <= 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}
