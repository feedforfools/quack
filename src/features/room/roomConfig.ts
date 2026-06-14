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

export type GameType = "imposter" | "lupus" | "secret-hitler";

/**
 * How a game progresses once started:
 *  - "single": one discussion, one vote, done (original flow).
 *  - "multi":  discussion → vote → eliminate, repeated round after round until
 *    all imposters are out, imposters reach parity, max_rounds is hit, or an
 *    imposter guesses the word. Also the natural structure for future
 *    Mafia-style games.
 */
export type RoundMode = "single" | "multi";

export interface RoomConfig {
  /** Selected game mode for the next game in the room. */
  game_type: GameType;
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
  /** Single-shot vote or round-by-round eliminations. */
  round_mode: RoundMode;
  /**
   * Maximum number of vote rounds in "multi" mode (1–10). When the cap is
   * reached with imposters still alive, the imposters win. Ignored in
   * "single" mode.
   */
  max_rounds: number;
  /** Discussion timer length in seconds. 0 = disabled. */
  timer_seconds: number;
  /**
   * DEPRECATED (E6-T3): the call-to-vote threshold is now a fixed strict
   * majority of alive players (floor(n/2) + 1), computed server-side by
   * request_vote. Kept only so older persisted configs still parse.
   */
  vote_threshold_fraction: number;
  /** How long the voting window stays open, in seconds (default 30). */
  voting_duration_seconds: number;
  /**
   * When true (default), every player can see a running vote tally during
   * voting. When false, only imposters can see each other's votes.
   */
  live_vote_tally: boolean;
  /**
   * When true (default), the result of each vote round shows how many votes
   * every player received. Enforced server-side by get_round_results.
   */
  show_vote_counts: boolean;
  /**
   * When true, players can initiate a call-to-vote during the discussion phase.
   * When false, voting can only be triggered by the discussion timer expiring.
   */
  call_to_vote: boolean;
  /**
   * Maximum number of players allowed in the lobby (including the host).
   * Default 20, max 20.
   */
  max_players: number;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  game_type: "imposter",
  language: "en",
  categories: ["easy"],
  imposter_count: 1,
  imposters_see_each_other: false,
  imposter_hint_count: 0,
  round_mode: "single",
  max_rounds: 5,
  timer_seconds: 300,
  vote_threshold_fraction: 0.5,
  voting_duration_seconds: 30,
  live_vote_tally: true,
  show_vote_counts: true,
  call_to_vote: true,
  max_players: 20,
};

/** Bounds for the multi-round cap (settings stepper + parser clamp). */
export const MAX_ROUNDS_MIN = 1;
export const MAX_ROUNDS_MAX = 10;

function isWordPoolLang(v: unknown): v is WordPoolLang {
  return WORD_POOL_LANGS.includes(v as WordPoolLang);
}

function isWordPoolCategory(v: unknown): v is WordPoolCategory {
  return WORD_POOL_CATEGORIES.includes(v as WordPoolCategory);
}

function isGameType(v: unknown): v is GameType {
  return v === "imposter" || v === "lupus" || v === "secret-hitler";
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

  const game_type = isGameType(r["game_type"])
    ? r["game_type"]
    : DEFAULT_ROOM_CONFIG.game_type;

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

  const round_mode: RoundMode =
    r["round_mode"] === "multi" ? "multi" : "single";

  const max_rounds =
    typeof r["max_rounds"] === "number" &&
    r["max_rounds"] >= MAX_ROUNDS_MIN &&
    r["max_rounds"] <= MAX_ROUNDS_MAX
      ? Math.floor(r["max_rounds"])
      : DEFAULT_ROOM_CONFIG.max_rounds;

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

  const live_vote_tally = r["live_vote_tally"] !== false;

  const show_vote_counts = r["show_vote_counts"] !== false;

  const call_to_vote = r["call_to_vote"] !== false;

  const max_players =
    typeof r["max_players"] === "number" &&
    r["max_players"] >= 3 &&
    r["max_players"] <= 20
      ? Math.floor(r["max_players"])
      : DEFAULT_ROOM_CONFIG.max_players;

  return {
    game_type,
    language,
    categories,
    imposter_count,
    imposters_see_each_other,
    imposter_hint_count,
    round_mode,
    max_rounds,
    timer_seconds,
    vote_threshold_fraction,
    voting_duration_seconds,
    live_vote_tally,
    show_vote_counts,
    call_to_vote,
    max_players,
  };
}
