import type { WordEntry, WordPool } from "./types";

/** Thrown when pickWord is called with no words available. */
export class EmptyWordPoolError extends Error {
  constructor() {
    super("Cannot pick a word: all provided word pools are empty");
    this.name = "EmptyWordPoolError";
  }
}

/**
 * Picks a single word entry at random from the combined words of all provided pools.
 *
 * @param pools  One or more WordPool objects (may come from different categories)
 * @param rng    Optional random-number generator — defaults to Math.random.
 *               Inject a seeded function in tests for deterministic results.
 * @returns      A randomly selected WordEntry (contains .word and .hints)
 */
export function pickWord(
  pools: WordPool[],
  rng: () => number = Math.random,
): WordEntry {
  const all: WordEntry[] = pools.flatMap((p) => p.words);
  if (all.length === 0) {
    throw new EmptyWordPoolError();
  }
  const index = Math.floor(rng() * all.length);
  // all is guaranteed non-empty and index is in [0, all.length)
  return all[index]!;
}

/**
 * Picks hints to distribute among N imposters from the chosen word entry.
 *
 * Returns a flat string[] of length `imposterCount * hintCount`, where the
 * hints for imposter[i] occupy indices [i*hintCount .. (i+1)*hintCount - 1].
 *
 * When the word's hint pool is smaller than `imposterCount * hintCount`, hints
 * are cycled so every imposter receives the requested number. The hints are
 * shuffled first so different imposters see different hints when possible.
 *
 * Returns [] when hintCount is 0 or either count is 0.
 */
export function pickHints(
  entry: WordEntry,
  imposterCount: number,
  hintCount: number,
  rng: () => number = Math.random,
): string[] {
  if (hintCount <= 0 || imposterCount <= 0 || entry.hints.length === 0) {
    return [];
  }

  // Shuffle a copy so we don't mutate the source and get variety across calls.
  const shuffled = entry.hints.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  const total = imposterCount * hintCount;
  const result: string[] = [];
  for (let i = 0; i < total; i++) {
    result.push(shuffled[i % shuffled.length]!);
  }
  return result;
}
