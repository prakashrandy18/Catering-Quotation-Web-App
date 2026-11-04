import type { Dish } from '@/types';
import { suggestSpelling, tidyDishName } from '@/lib/search';

/**
 * Spoken / typed variants that the generic similarity search cannot bridge
 * (speech-to-text turns "Badusha" into "Bahadur Shah", etc.). Keys are lowercase
 * fragments; they are replaced inside the typed name before the library lookup.
 */
const ALIASES: [RegExp, string][] = [
  [/\bbahadur\s*shah\b/g, 'badusha'],
  [/\bbadhusha\b/g, 'badusha'],
  [/\bbadshah\b/g, 'badusha'],
  [/\bjalebi\b/g, 'jilebi'],
  [/\bjangri\b/g, 'jangiri'],
  [/\bjamoon\b/g, 'jamun'],
  [/\bidli\b/g, 'idly'],
  [/\bvadai curry\b/g, 'vada curry'],
  [/\bbuttermilk\b/g, 'butter milk'],
  [/\bbiriyani\b/g, 'biryani'],
  [/\bpapad\b/g, 'papadam'],
  [/\bpoori kizhangu\b/g, 'poori masala kilangu'],
  [/\bpoori masal\b/g, 'poori masala'],
  [/\bkizhangu\b/g, 'kilangu'],
  [/\brasmalai\b/g, 'rasamalai'],
];

export interface SpellingQuestion {
  /** lowercase typed text; key into the card's choices and the spelling memory */
  key: string;
  /** What he said / typed, as shown: "Mini Bahadur Shah" */
  typed: string;
  /** Library spelling we think he meant: "Mini Badusha" */
  suggestion: string;
}

export type SpellingChoice = 'suggestion' | 'typed';

export interface NameContext {
  /** DISH_LIBRARY + the user's saved dishes */
  library: Dish[];
  /** meta.spellingMemory: typed (lowercase) → chosen name */
  memory: Record<string, string>;
  /** choices made on the preview card, by question key; default = suggestion */
  choices: Record<string, SpellingChoice>;
  /**
   * Questions already shown on a preview card: they keep being asked (with the card's choice)
   * even after the choice was remembered or saved as a dish.
   */
  pinned?: SpellingQuestion[];
}

const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Exact library name (case-insensitive) or null. */
export function libraryName(name: string, library: Dish[]): string | null {
  const k = key(name);
  return library.find((d) => d.name.toLowerCase() === k)?.name ?? null;
}

/** Library spelling for a misheard/misspelt name, using the alias map first, then fuzzy search. */
export function findSuggestion(typed: string, library: Dish[]): string | null {
  if (libraryName(typed, library)) return null;
  let aliased = key(typed);
  for (const [re, rep] of ALIASES) aliased = aliased.replace(re, rep);
  const viaAlias = libraryName(aliased, library);
  if (viaAlias) return viaAlias;
  return suggestSpelling(aliased, library)?.name ?? null;
}

/** Keep Claude's casing unless the name is all lower/upper case. */
function tidy(name: string): string {
  const t = name.trim().replace(/\s+/g, ' ');
  return t === t.toLowerCase() || t === t.toUpperCase() ? tidyDishName(t.toLowerCase()) : t;
}

/**
 * Final name for a dish Claude wants to add, plus the "Did you mean …?" question when one is needed.
 * Order: exact library name → remembered choice → alias/fuzzy suggestion → as typed.
 */
export function resolveDishName(name: string, heardAs: string | null | undefined, ctx: NameContext): { final: string; question?: SpellingQuestion } {
  const lib = libraryName(name, ctx.library);
  const heard = heardAs && key(heardAs) !== key(name) ? heardAs.trim() : null;

  const pinned = ctx.pinned?.find((q) => q.key === key(heard ?? name));
  if (pinned) return { final: (ctx.choices[pinned.key] ?? 'suggestion') === 'typed' ? pinned.typed : pinned.suggestion, question: pinned };

  if (heard) {
    const remembered = ctx.memory[key(heard)];
    if (remembered) return { final: remembered };
    const suggestion = lib ?? tidy(name);
    const q: SpellingQuestion = { key: key(heard), typed: tidy(heard), suggestion };
    return { final: (ctx.choices[q.key] ?? 'suggestion') === 'typed' ? q.typed : suggestion, question: q };
  }

  if (lib) return { final: lib };
  const remembered = ctx.memory[key(name)];
  if (remembered) return { final: remembered };
  const typed = tidy(name);
  const suggestion = findSuggestion(name, ctx.library);
  if (!suggestion || key(suggestion) === key(typed)) return { final: typed };
  const q: SpellingQuestion = { key: key(name), typed, suggestion };
  return { final: (ctx.choices[q.key] ?? 'suggestion') === 'typed' ? typed : suggestion, question: q };
}
