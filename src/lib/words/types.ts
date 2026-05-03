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

/** A single entry in a word pool — the secret word plus clue hints for imposters. */
export interface WordEntry {
  word: string;
  /**
   * Short phrases that help an imposter blend in (e.g. "Italian dish").
   * Content reviewed under Epic 6 release gate G2.
   */
  hints: string[];
}

/** Shape of each JSON file under public/words/{lang}/{category}.json */
export interface WordPool {
  version: number;
  lang: WordPoolLang;
  category: WordPoolCategory;
  words: WordEntry[];
}
