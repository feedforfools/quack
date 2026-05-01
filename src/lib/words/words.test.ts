import { describe, it, expect, vi } from "vitest";
import type { WordPool } from "./types";
import {
  fetchWordPool,
  fetchWordPools,
  WordPoolFetchError,
  WordPoolValidationError,
} from "./loader";
import { pickWord, EmptyWordPoolError } from "./picker";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePool(overrides: Partial<WordPool> = {}): WordPool {
  return {
    version: 1,
    lang: "en",
    category: "food",
    words: ["apple", "banana", "cherry"],
    ...overrides,
  };
}

function makeFetcher(pool: WordPool): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(pool),
  } as unknown as Response);
}

function makeErrorFetcher(status: number): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: "Not Found",
    json: () => Promise.reject(new Error("no body")),
  } as unknown as Response);
}

function makeNetworkFetcher(error: Error): typeof fetch {
  return vi.fn().mockRejectedValue(error);
}

// ─── fetchWordPool — happy path ───────────────────────────────────────────────

describe("fetchWordPool", () => {
  it("returns a valid pool from a successful response", async () => {
    const pool = makePool();
    const fetcher = makeFetcher(pool);
    const result = await fetchWordPool("en", "food", fetcher);
    expect(result).toEqual(pool);
  });

  it("fetches from /words/{lang}/{category}.json", async () => {
    const fetcher = makeFetcher(makePool());
    await fetchWordPool("it", "animals", fetcher);
    expect(fetcher).toHaveBeenCalledWith("/words/it/animals.json");
  });

  // ─── network / HTTP errors ──────────────────────────────────────────────────

  it("throws WordPoolFetchError on network failure", async () => {
    const fetcher = makeNetworkFetcher(new Error("offline"));
    await expect(fetchWordPool("en", "food", fetcher)).rejects.toBeInstanceOf(
      WordPoolFetchError,
    );
  });

  it("throws WordPoolFetchError on non-ok HTTP response", async () => {
    const fetcher = makeErrorFetcher(404);
    await expect(fetchWordPool("en", "food", fetcher)).rejects.toBeInstanceOf(
      WordPoolFetchError,
    );
  });

  it("WordPoolFetchError message includes lang and category", async () => {
    const fetcher = makeErrorFetcher(500);
    await expect(fetchWordPool("it", "movies", fetcher)).rejects.toThrow(
      /it\/movies/,
    );
  });

  // ─── validation errors ──────────────────────────────────────────────────────

  it("throws WordPoolValidationError when root is not an object", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve("not an object"),
    } as unknown as Response);
    await expect(fetchWordPool("en", "food", fetcher)).rejects.toBeInstanceOf(
      WordPoolValidationError,
    );
  });

  it("throws WordPoolValidationError when 'words' is missing", async () => {
    const bad = { version: 1, lang: "en", category: "food" };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(bad),
    } as unknown as Response);
    await expect(fetchWordPool("en", "food", fetcher)).rejects.toBeInstanceOf(
      WordPoolValidationError,
    );
  });

  it("throws WordPoolValidationError when 'words' is empty", async () => {
    const fetcher = makeFetcher(makePool({ words: [] }));
    await expect(fetchWordPool("en", "food", fetcher)).rejects.toBeInstanceOf(
      WordPoolValidationError,
    );
  });

  it("throws WordPoolValidationError when a word entry is not a string", async () => {
    // words contains a number — invalid
    const bad = { version: 1, lang: "en", category: "food", words: [42] };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(bad),
    } as unknown as Response);
    await expect(fetchWordPool("en", "food", fetcher)).rejects.toBeInstanceOf(
      WordPoolValidationError,
    );
  });

  it("throws WordPoolValidationError for an unknown lang value", async () => {
    const bad = { version: 1, lang: "xx", category: "food", words: ["hi"] };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(bad),
    } as unknown as Response);
    await expect(fetchWordPool("en", "food", fetcher)).rejects.toBeInstanceOf(
      WordPoolValidationError,
    );
  });

  it("throws WordPoolValidationError for an unknown category value", async () => {
    const bad = {
      version: 1,
      lang: "en",
      category: "nonsense",
      words: ["hi"],
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(bad),
    } as unknown as Response);
    await expect(fetchWordPool("en", "food", fetcher)).rejects.toBeInstanceOf(
      WordPoolValidationError,
    );
  });
});

// ─── fetchWordPools ───────────────────────────────────────────────────────────

describe("fetchWordPools", () => {
  it("fetches all requested categories in parallel and returns them", async () => {
    const food = makePool({ category: "food" });
    const animals = makePool({ category: "animals" });
    const fetcher = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(url.includes("animals") ? animals : food),
        } as unknown as Response),
      );
    const result = await fetchWordPools("en", ["food", "animals"], fetcher);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.category)).toEqual(
      expect.arrayContaining(["food", "animals"]),
    );
  });

  it("rejects if any single pool fails", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation((url: string) =>
        url.includes("movies")
          ? Promise.resolve({
              ok: false,
              status: 404,
              statusText: "Not Found",
            } as unknown as Response)
          : Promise.resolve({
              ok: true,
              json: () => Promise.resolve(makePool()),
            } as unknown as Response),
      );
    await expect(
      fetchWordPools("en", ["food", "movies"], fetcher),
    ).rejects.toBeInstanceOf(WordPoolFetchError);
  });
});

// ─── pickWord ─────────────────────────────────────────────────────────────────

describe("pickWord", () => {
  it("returns a word from the pool", () => {
    const pool = makePool({ words: ["alpha", "beta", "gamma"] });
    const word = pickWord([pool]);
    expect(["alpha", "beta", "gamma"]).toContain(word);
  });

  it("is deterministic given a fixed rng", () => {
    const pool = makePool({ words: ["alpha", "beta", "gamma"] });
    const rng = () => 0.5; // floor(0.5 * 3) = 1 → "beta"
    expect(pickWord([pool], rng)).toBe("beta");
  });

  it("picks from the first word when rng returns 0", () => {
    const pool = makePool({ words: ["first", "second"] });
    expect(pickWord([pool], () => 0)).toBe("first");
  });

  it("picks from the last word when rng returns just below 1", () => {
    const pool = makePool({ words: ["first", "second", "third"] });
    expect(pickWord([pool], () => 0.9999)).toBe("third");
  });

  it("flattens words across multiple pools before picking", () => {
    const p1 = makePool({ words: ["only"] });
    const p2 = makePool({ category: "animals", words: ["never"] });
    // rng=0 → index 0 → first pool's first word
    expect(pickWord([p1, p2], () => 0)).toBe("only");
    // rng >= 0.5 → index 1 → second pool's first word
    expect(pickWord([p1, p2], () => 0.5)).toBe("never");
  });

  it("throws EmptyWordPoolError when all pools are empty (pools=[])", () => {
    expect(() => pickWord([])).toThrow(EmptyWordPoolError);
  });
});
