import { describe, it, expect, vi } from "vitest";
import type { WordPool, WordEntry } from "./types";
import {
  fetchWordPool,
  fetchWordPools,
  WordPoolFetchError,
  WordPoolValidationError,
} from "./loader";
import { pickWord, pickHints, EmptyWordPoolError } from "./picker";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function entry(word: string, hints: string[] = []): WordEntry {
  return { word, hints };
}

function makePool(overrides: Partial<WordPool> = {}): WordPool {
  return {
    version: 1,
    lang: "en",
    category: "food",
    words: [entry("apple"), entry("banana"), entry("cherry")],
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
    await expect(fetchWordPool("it", "music", fetcher)).rejects.toThrow(
      /it\/music/,
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

  it("throws WordPoolValidationError when a word entry is not an object", async () => {
    // words contains a plain string — no longer valid; must be WordEntry objects
    const bad = { version: 1, lang: "en", category: "food", words: ["pizza"] };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(bad),
    } as unknown as Response);
    await expect(fetchWordPool("en", "food", fetcher)).rejects.toBeInstanceOf(
      WordPoolValidationError,
    );
  });

  it("throws WordPoolValidationError for an unknown lang value", async () => {
    const bad = {
      version: 1,
      lang: "xx",
      category: "food",
      words: [{ word: "hi", hints: [] }],
    };
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
      words: [{ word: "hi", hints: [] }],
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
    const fetcher = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(url.includes("animals") ? animals : food),
      } as unknown as Response),
    );
    const result = await fetchWordPools("en", ["food", "animals"], fetcher);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.category)).toEqual(
      expect.arrayContaining(["food", "animals"]),
    );
  });

  it("rejects if any single pool fails", async () => {
    const fetcher = vi.fn().mockImplementation((url: string) =>
      url.includes("music")
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
      fetchWordPools("en", ["food", "music"], fetcher),
    ).rejects.toBeInstanceOf(WordPoolFetchError);
  });
});

// ─── pickWord ─────────────────────────────────────────────────────────────────

describe("pickWord", () => {
  it("returns a WordEntry from the pool", () => {
    const pool = makePool({
      words: [entry("alpha"), entry("beta"), entry("gamma")],
    });
    const result = pickWord([pool]);
    expect(["alpha", "beta", "gamma"]).toContain(result.word);
  });

  it("is deterministic given a fixed rng", () => {
    const pool = makePool({
      words: [entry("alpha"), entry("beta"), entry("gamma")],
    });
    const rng = () => 0.5; // floor(0.5 * 3) = 1 → "beta"
    expect(pickWord([pool], rng).word).toBe("beta");
  });

  it("picks from the first word when rng returns 0", () => {
    const pool = makePool({ words: [entry("first"), entry("second")] });
    expect(pickWord([pool], () => 0).word).toBe("first");
  });

  it("picks from the last word when rng returns just below 1", () => {
    const pool = makePool({
      words: [entry("first"), entry("second"), entry("third")],
    });
    expect(pickWord([pool], () => 0.9999).word).toBe("third");
  });

  it("flattens words across multiple pools before picking", () => {
    const p1 = makePool({ words: [entry("only")] });
    const p2 = makePool({ category: "animals", words: [entry("never")] });
    // rng=0 → index 0 → first pool's first word
    expect(pickWord([p1, p2], () => 0).word).toBe("only");
    // rng >= 0.5 → index 1 → second pool's first word
    expect(pickWord([p1, p2], () => 0.5).word).toBe("never");
  });

  it("throws EmptyWordPoolError when all pools are empty (pools=[])", () => {
    expect(() => pickWord([])).toThrow(EmptyWordPoolError);
  });
});

// ─── pickHints ────────────────────────────────────────────────────────────────

describe("pickHints", () => {
  it("returns empty array when hintCount is 0", () => {
    const e = entry("pizza", ["Italian dish", "round", "delivered"]);
    expect(pickHints(e, 2, 0)).toEqual([]);
  });

  it("returns empty array when entry has no hints", () => {
    const e = entry("pizza", []);
    expect(pickHints(e, 2, 2)).toEqual([]);
  });

  it("returns imposterCount * hintCount elements", () => {
    const e = entry("pizza", ["a", "b", "c", "d", "e", "f"]);
    const result = pickHints(e, 2, 3);
    expect(result).toHaveLength(6);
  });

  it("each element is a string from the hints array", () => {
    const hints = ["a", "b", "c"];
    const e = entry("pizza", hints);
    const result = pickHints(e, 1, 3);
    expect(result.every((h) => hints.includes(h))).toBe(true);
  });

  it("works for a single imposter", () => {
    const e = entry("pizza", ["a", "b", "c"]);
    const result = pickHints(e, 1, 2, () => 0);
    expect(result).toHaveLength(2);
  });

  it("two imposters with 1 hint each receive different hints when pool is large enough", () => {
    // With ≥ 2 distinct hints, two imposters requesting 1 hint each must get
    // distinct entries (no duplicate assignment when pool allows it).
    const e = entry("pizza", ["alpha", "beta", "gamma", "delta"]);
    // rng=()=>0 produces a deterministic shuffle; two different slots are
    // selected for imposter[0] and imposter[1].
    const result = pickHints(e, 2, 1, () => 0);
    expect(result).toHaveLength(2);
    expect(result[0]).not.toBe(result[1]);
  });

  it("cycles hints when pool is smaller than total needed", () => {
    // 2 unique hints, 4 imposters × 1 hint = 4 slots needed → cycling occurs.
    const e = entry("pizza", ["x", "y"]);
    const result = pickHints(e, 4, 1, () => 0);
    expect(result).toHaveLength(4);
    // Every element must still come from the pool.
    expect(result.every((h) => ["x", "y"].includes(h))).toBe(true);
    // Pigeonhole: 4 slots but only 2 distinct values → at least one is reused.
    const unique = new Set(result);
    expect(unique.size).toBeLessThan(4);
  });

  it("each imposter receives exactly hintCount hints in the slice [i*hintCount..(i+1)*hintCount)", () => {
    // 3 imposters × 2 hints each = 6 entries total.
    const e = entry("pizza", ["a", "b", "c", "d", "e", "f"]);
    const result = pickHints(e, 3, 2, () => 0);
    expect(result).toHaveLength(6);
    // Verify three non-overlapping slices.
    const imp0 = result.slice(0, 2);
    const imp1 = result.slice(2, 4);
    const imp2 = result.slice(4, 6);
    const pool = e.hints;
    [imp0, imp1, imp2].forEach((slice) => {
      expect(slice).toHaveLength(2);
      slice.forEach((h) => expect(pool).toContain(h));
    });
  });

  it("returns empty array when imposterCount is 0", () => {
    const e = entry("pizza", ["a", "b"]);
    expect(pickHints(e, 0, 2)).toEqual([]);
  });
});
