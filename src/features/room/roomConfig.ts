/**
 * Canonical shape for the `rooms.config` / `games.config_snapshot` JSONB.
 * All settings are optional at the DB layer (stored as arbitrary JSON) but
 * are always fully typed here via `parseRoomConfig`, which fills in defaults.
 */
import {
  WORD_POOL_CATEGORIES,
  WORD_POOL_LANGS,
  type WordPoolCategory,
  type WordPoolLang,
} from "@/lib/words";

export type { WordPoolCategory, WordPoolLang };

export interface RoomConfig {
  /** Word-pool language — EN or IT. */
  language: WordPoolLang;
  /** Which word categories to draw from (must be non-empty). */
  categories: WordPoolCategory[];
  /** How many players are imposters (≥ 1). Validated by the RPC. */
  imposter_count: number;
  /**
   * When true, each imposter's reveal additionally shows the names of the
   * other imposters. Consumed in E5-T4.
   */
  imposters_see_each_other: boolean;
  /**
   * How many hint strings to give each imposter (0 = no hints). The word
   * pool must carry the hint field — added in E5-T5.
   */
  imposter_hint_count: number;
  /** How many games make up a "set". Counter tracked in E5-T2. */
  num_games: number;
  /** Discussion timer length in seconds. 0 = disabled. */
  timer_seconds: number;
  /**
   * Fraction of players who must call-to-vote to trigger an active vote
   * (e.g. 0.5 = simple majority). Consumed in E5-T7.
   */
  vote_threshold_fraction: number;
  /** How long the voting window stays open, in seconds. */
  voting_duration_seconds: number;
  /**
   * When true, every player can see a running vote tally during voting.
   * When false, only imposters can see each other's votes; civilians see none.
   * Consumed in E5-T6 / E5-T8.
   */
  live_vote_tally: boolean;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  language: "en",
  categories: ["food"],
  imposter_count: 1,
  imposters_see_each_other: false,
  imposter_hint_count: 0,
  num_games: 3,
  timer_seconds: 0,
  vote_threshold_fraction: 0.5,
  voting_duration_seconds: 60,
  live_vote_tally: false,
};

function isWordPoolLang(v: unknown): v is WordPoolLang {
  return WORD_POOL_LANGS.includes(v as WordPoolLang);
}

function isWordPoolCategory(v: unknown): v is WordPoolCategory {
  return WORD_POOL_CATEGORIES.includes(v as WordPoolCategory);
}

/**
 * Coerce arbitrary JSONB from the DB into a fully-typed `RoomConfig`,
 * filling in defaults for any missing or invalid fields.
 */
export function parseRoomConfig(raw: unknown): RoomConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_ROOM_CONFIG };
  }
  const r = raw as Record<string, unknown>;

  const language = isWordPoolLang(r["language"])
    ? r["language"]
    : DEFAULT_ROOM_CONFIG.language;

  const rawCats = Array.isArray(r["categories"]) ? r["categories"] : [];
  const validCats = (rawCats as unknown[]).filter(isWordPoolCategory);
  const categories: WordPoolCategory[] =
    validCats.length > 0 ? validCats : DEFAULT_ROOM_CONFIG.categories;

  const imposter_count =
    typeof r["imposter_count"] === "number" && r["imposter_count"] >= 1
      ? Math.floor(r["imposter_count"])
      : DEFAULT_ROOM_CONFIG.imposter_count;

  const imposters_see_each_other = r["imposters_see_each_other"] === true;

  const imposter_hint_count =
    typeof r["imposter_hint_count"] === "number" &&
    r["imposter_hint_count"] >= 0
      ? Math.floor(r["imposter_hint_count"])
      : DEFAULT_ROOM_CONFIG.imposter_hint_count;

  const num_games =
    typeof r["num_games"] === "number" && r["num_games"] >= 1
      ? Math.floor(r["num_games"])
      : DEFAULT_ROOM_CONFIG.num_games;

  const timer_seconds =
    typeof r["timer_seconds"] === "number" && r["timer_seconds"] >= 0
      ? Math.floor(r["timer_seconds"])
      : DEFAULT_ROOM_CONFIG.timer_seconds;

  const vote_threshold_fraction =
    typeof r["vote_threshold_fraction"] === "number"
      ? Math.max(0.1, Math.min(1, r["vote_threshold_fraction"]))
      : DEFAULT_ROOM_CONFIG.vote_threshold_fraction;

  const voting_duration_seconds =
    typeof r["voting_duration_seconds"] === "number" &&
    r["voting_duration_seconds"] > 0
      ? Math.floor(r["voting_duration_seconds"])
      : DEFAULT_ROOM_CONFIG.voting_duration_seconds;

  const live_vote_tally = r["live_vote_tally"] === true;

  return {
    language,
    categories,
    imposter_count,
    imposters_see_each_other,
    imposter_hint_count,
    num_games,
    timer_seconds,
    vote_threshold_fraction,
    voting_duration_seconds,
    live_vote_tally,
  };
}
