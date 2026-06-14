/**
 * E5-T10 / E6-T3: Unit tests for vote-threshold maths and parseRoomConfig
 * voting fields.
 *
 * Since E6-T3 the call-to-vote threshold is a fixed STRICT majority of alive
 * players (the configurable fraction is deprecated):
 *
 *   threshold = floor(alive_count / 2) + 1
 *
 * The server implements this in request_vote; the client mirrors it in
 * Room.tsx:
 *   const voteThreshold = Math.floor(activePlayerCount / 2) + 1
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
function computeThreshold(aliveCount: number): number {
  return Math.floor(aliveCount / 2) + 1;
}

// ─── computeThreshold ────────────────────────────────────────────────────────

describe("vote threshold formula (strict majority)", () => {
  it("4 players → 3 (half is not enough)", () => {
    expect(computeThreshold(4)).toBe(3);
  });

  it("3 players → 2", () => {
    expect(computeThreshold(3)).toBe(2);
  });

  it("2 players → 2 (both must agree)", () => {
    expect(computeThreshold(2)).toBe(2);
  });

  it("5 players → 3", () => {
    expect(computeThreshold(5)).toBe(3);
  });

  it("6 players → 4 (exactly half is not a majority)", () => {
    expect(computeThreshold(6)).toBe(4);
  });

  it("7 players → 4", () => {
    expect(computeThreshold(7)).toBe(4);
  });

  it("1 player → 1", () => {
    expect(computeThreshold(1)).toBe(1);
  });
});

// ─── parseRoomConfig — vote-related fields ───────────────────────────────────

describe("parseRoomConfig — voting fields", () => {
  it("voting_duration_seconds defaults to 30", () => {
    expect(parseRoomConfig({}).voting_duration_seconds).toBe(30);
    expect(parseRoomConfig({}).voting_duration_seconds).toBe(
      DEFAULT_ROOM_CONFIG.voting_duration_seconds,
    );
  });

  it("live_vote_tally defaults to true", () => {
    expect(parseRoomConfig({}).live_vote_tally).toBe(true);
  });

  it("live_vote_tally can be explicitly disabled", () => {
    expect(parseRoomConfig({ live_vote_tally: false }).live_vote_tally).toBe(
      false,
    );
  });

  it("falls back to default for zero voting_duration_seconds", () => {
    // Validation rule: voting_duration_seconds must be > 0.
    expect(
      parseRoomConfig({ voting_duration_seconds: 0 }).voting_duration_seconds,
    ).toBe(30);
  });

  it("parses a valid voting_duration_seconds", () => {
    expect(
      parseRoomConfig({ voting_duration_seconds: 90 }).voting_duration_seconds,
    ).toBe(90);
  });

  it("still parses the deprecated vote_threshold_fraction field", () => {
    // The fraction no longer drives the threshold but must survive parsing
    // so older persisted configs round-trip unchanged.
    expect(
      parseRoomConfig({ vote_threshold_fraction: 0.67 })
        .vote_threshold_fraction,
    ).toBe(0.67);
    expect(parseRoomConfig({}).vote_threshold_fraction).toBe(0.5);
  });

  it("call_to_vote defaults to true and can be disabled", () => {
    expect(parseRoomConfig({}).call_to_vote).toBe(true);
    expect(parseRoomConfig({ call_to_vote: false }).call_to_vote).toBe(false);
  });
});
