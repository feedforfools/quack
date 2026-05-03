/**
 * E5-T10: Unit tests for vote-threshold maths and parseRoomConfig voting fields.
 *
 * The server-side threshold formula is:
 *   threshold = CEIL(player_count × vote_threshold_fraction)
 *
 * The client mirrors this in Room.tsx:
 *   const voteThreshold = Math.ceil(activePlayerCount * parsedConfig.vote_threshold_fraction)
 *
 * These tests document and verify that formula at key boundary values.
 */
import { describe, it, expect } from "vitest";
import {
  parseRoomConfig,
  DEFAULT_ROOM_CONFIG,
} from "@/features/room/roomConfig";

// Pure implementation of the formula so tests read clearly without importing
// the whole Room component.
function computeThreshold(playerCount: number, fraction: number): number {
  return Math.ceil(playerCount * fraction);
}

// ─── computeThreshold ────────────────────────────────────────────────────────

describe("vote threshold formula", () => {
  it("4 players × 0.5 = 2 (default half-majority)", () => {
    expect(computeThreshold(4, 0.5)).toBe(2);
  });

  it("3 players × 0.34 = 2 (CEIL(1.02) = 2)", () => {
    expect(computeThreshold(3, 0.34)).toBe(2);
  });

  it("2 players × 0.5 = 1 (CEIL(1.0) = 1)", () => {
    expect(computeThreshold(2, 0.5)).toBe(1);
  });

  it("5 players × 0.5 = 3 (CEIL(2.5) = 3)", () => {
    expect(computeThreshold(5, 0.5)).toBe(3);
  });

  it("4 players × 1.0 = 4 (unanimous)", () => {
    expect(computeThreshold(4, 1.0)).toBe(4);
  });

  it("4 players × 0.67 = 3 (CEIL(2.68) = 3)", () => {
    expect(computeThreshold(4, 0.67)).toBe(3);
  });

  it("1 player × 0.5 = 1 (CEIL(0.5) = 1)", () => {
    expect(computeThreshold(1, 0.5)).toBe(1);
  });

  it("3 players × 0.67 = 3 (CEIL(2.01) = 3 — two-thirds requires all three)", () => {
    expect(computeThreshold(3, 0.67)).toBe(3);
  });

  it("6 players × 0.5 = 3 (even count, exact half)", () => {
    expect(computeThreshold(6, 0.5)).toBe(3);
  });

  it("6 players × 0.67 = 5 (CEIL(4.02) = 5)", () => {
    expect(computeThreshold(6, 0.67)).toBe(5);
  });
});

// ─── parseRoomConfig — vote-related fields ───────────────────────────────────

describe("parseRoomConfig — voting fields", () => {
  it("vote_threshold_fraction defaults to 0.5", () => {
    expect(parseRoomConfig({}).vote_threshold_fraction).toBe(
      DEFAULT_ROOM_CONFIG.vote_threshold_fraction,
    );
    expect(parseRoomConfig({}).vote_threshold_fraction).toBe(0.5);
  });

  it("voting_duration_seconds defaults to 60", () => {
    expect(parseRoomConfig({}).voting_duration_seconds).toBe(60);
  });

  it("live_vote_tally defaults to false", () => {
    expect(parseRoomConfig({}).live_vote_tally).toBe(false);
  });

  it("parses a valid vote_threshold_fraction", () => {
    expect(
      parseRoomConfig({ vote_threshold_fraction: 0.67 })
        .vote_threshold_fraction,
    ).toBe(0.67);
  });

  it("falls back to default for non-numeric vote_threshold_fraction", () => {
    expect(
      parseRoomConfig({ vote_threshold_fraction: "half" })
        .vote_threshold_fraction,
    ).toBe(0.5);
  });

  it("falls back to default for zero voting_duration_seconds", () => {
    // Validation rule: voting_duration_seconds must be > 0.
    expect(
      parseRoomConfig({ voting_duration_seconds: 0 }).voting_duration_seconds,
    ).toBe(60);
  });

  it("parses a valid voting_duration_seconds", () => {
    expect(
      parseRoomConfig({ voting_duration_seconds: 90 }).voting_duration_seconds,
    ).toBe(90);
  });

  it("parses live_vote_tally = true", () => {
    expect(parseRoomConfig({ live_vote_tally: true }).live_vote_tally).toBe(
      true,
    );
  });

  it("falls back to false for non-boolean live_vote_tally", () => {
    expect(parseRoomConfig({ live_vote_tally: "yes" }).live_vote_tally).toBe(
      false,
    );
  });
});
