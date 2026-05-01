export const WORD_POOL_LANGS = ["en", "it"] as const;
export type WordPoolLang = (typeof WORD_POOL_LANGS)[number];

export const WORD_POOL_CATEGORIES = [
  "food",
  "animals",
  "places",
  "movies",
  "objects",
] as const;
export type WordPoolCategory = (typeof WORD_POOL_CATEGORIES)[number];

/** Shape of each JSON file under public/words/{lang}/{category}.json */
export interface WordPool {
  version: number;
  lang: WordPoolLang;
  category: WordPoolCategory;
  words: string[];
}
