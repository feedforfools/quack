import type { WordPool, WordPoolCategory, WordPoolLang } from "./types";
import { WORD_POOL_CATEGORIES, WORD_POOL_LANGS } from "./types";

/** Thrown when a word-pool JSON file fails schema validation. */
export class WordPoolValidationError extends Error {
  constructor(
    public readonly lang: string,
    public readonly category: string,
    reason: string,
  ) {
    super(`Invalid word pool (${lang}/${category}): ${reason}`);
    this.name = "WordPoolValidationError";
  }
}

/** Thrown when the network fetch for a word-pool file fails. */
export class WordPoolFetchError extends Error {
  constructor(
    public readonly lang: string,
    public readonly category: string,
    cause: unknown,
  ) {
    super(
      `Failed to fetch word pool (${lang}/${category}): ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "WordPoolFetchError";
    this.cause = cause;
  }
}

/**
 * Validates that an unknown value conforms to the WordPool schema.
 * Throws WordPoolValidationError if validation fails.
 */
function validate(
  raw: unknown,
  lang: string,
  category: string,
): asserts raw is WordPool {
  if (typeof raw !== "object" || raw === null) {
    throw new WordPoolValidationError(lang, category, "root must be an object");
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj["version"] !== "number") {
    throw new WordPoolValidationError(lang, category, '"version" must be a number');
  }
  if (!WORD_POOL_LANGS.includes(obj["lang"] as WordPoolLang)) {
    throw new WordPoolValidationError(
      lang,
      category,
      `"lang" must be one of ${WORD_POOL_LANGS.join(", ")}`,
    );
  }
  if (!WORD_POOL_CATEGORIES.includes(obj["category"] as WordPoolCategory)) {
    throw new WordPoolValidationError(
      lang,
      category,
      `"category" must be one of ${WORD_POOL_CATEGORIES.join(", ")}`,
    );
  }
  if (!Array.isArray(obj["words"])) {
    throw new WordPoolValidationError(lang, category, '"words" must be an array');
  }
  if ((obj["words"] as unknown[]).length === 0) {
    throw new WordPoolValidationError(lang, category, '"words" must not be empty');
  }
  for (const w of obj["words"] as unknown[]) {
    if (typeof w !== "string" || w.trim() === "") {
      throw new WordPoolValidationError(
        lang,
        category,
        '"words" entries must be non-empty strings',
      );
    }
  }
}

/**
 * Fetches and validates a single word-pool JSON file.
 * Files are served from /words/{lang}/{category}.json (Vite public/).
 *
 * @param lang     Language code ("en" | "it")
 * @param category Category slug
 * @param fetcher  Optional fetch override — inject in tests to avoid network I/O
 */
export async function fetchWordPool(
  lang: WordPoolLang,
  category: WordPoolCategory,
  fetcher: typeof fetch = fetch,
): Promise<WordPool> {
  const url = `/words/${lang}/${category}.json`;
  let response: Response;
  try {
    response = await fetcher(url);
  } catch (err) {
    throw new WordPoolFetchError(lang, category, err);
  }

  if (!response.ok) {
    throw new WordPoolFetchError(
      lang,
      category,
      `HTTP ${response.status} ${response.statusText}`,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    throw new WordPoolFetchError(lang, category, `JSON parse error: ${err}`);
  }

  validate(raw, lang, category);
  return raw;
}

/**
 * Fetches multiple word-pool files in parallel.
 * Rejects if any single pool fails to load or validate.
 *
 * @param lang       Language code
 * @param categories Array of category slugs to load
 * @param fetcher    Optional fetch override
 */
export async function fetchWordPools(
  lang: WordPoolLang,
  categories: WordPoolCategory[],
  fetcher: typeof fetch = fetch,
): Promise<WordPool[]> {
  return Promise.all(
    categories.map((cat) => fetchWordPool(lang, cat, fetcher)),
  );
}
