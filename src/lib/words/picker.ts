import type { WordPool } from "./types";

/** Thrown when pickWord is called with no words available. */
export class EmptyWordPoolError extends Error {
  constructor() {
    super("Cannot pick a word: all provided word pools are empty");
    this.name = "EmptyWordPoolError";
  }
}

/**
 * Picks a single word at random from the combined words of all provided pools.
 *
 * @param pools  One or more WordPool objects (may come from different categories)
 * @param rng    Optional random-number generator — defaults to Math.random.
 *               Inject a seeded function in tests for deterministic results.
 * @returns      A randomly selected word string
 */
export function pickWord(
  pools: WordPool[],
  rng: () => number = Math.random,
): string {
  const all: string[] = pools.flatMap((p) => p.words);
  if (all.length === 0) {
    throw new EmptyWordPoolError();
  }
  const index = Math.floor(rng() * all.length);
  // all is guaranteed non-empty and index is in [0, all.length)
  return all[index]!;
}
