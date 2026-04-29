import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRawCode,
  generateUniqueRoomCode,
} from "./generateCode";

// ─── generateRawCode ─────────────────────────────────────────────────────────

describe("generateRawCode", () => {
  it("returns a code of exactly ROOM_CODE_LENGTH characters", () => {
    const code = generateRawCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("uses only characters from ROOM_CODE_ALPHABET", () => {
    // Run 100 samples to catch any alphabet violations reliably.
    for (let i = 0; i < 100; i++) {
      const code = generateRawCode();
      for (const char of code) {
        expect(ROOM_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it("never includes the excluded characters (0, O, 1, I, L)", () => {
    const excluded = ["0", "O", "1", "I", "L"];
    for (let i = 0; i < 200; i++) {
      const code = generateRawCode();
      for (const bad of excluded) {
        expect(code).not.toContain(bad);
      }
    }
  });

  it("generates unique codes across many calls (collision probability is negligible)", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateRawCode()));
    // With 481M+ possible codes, 500 samples should be 100% unique.
    expect(codes.size).toBe(500);
  });

  it("ROOM_CODE_ALPHABET has exactly 31 characters (23 letters + 8 digits)", () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
  });
});

// ─── generateUniqueRoomCode ──────────────────────────────────────────────────

function makeClient(
  existingCodes: string[],
): SupabaseClient<Database> {
  const maybeSingle = vi.fn().mockImplementation(() => {
    // Pop the first code from the "existing" list to simulate a collision,
    // then return null (free) for subsequent calls.
    const code = existingCodes.shift();
    if (code !== undefined) {
      return Promise.resolve({ data: { code }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal mock
  return { from } as any;
}

describe("generateUniqueRoomCode", () => {
  it("returns a code when the first attempt is free", async () => {
    const client = makeClient([]);
    const code = await generateUniqueRoomCode(client);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("retries until a free code is found after collisions", async () => {
    // Simulate 3 collisions before a free slot appears.
    // We seed 3 arbitrary values to trigger the collision branch 3 times.
    const client = makeClient(["AAA111", "BBB222", "CCC333"]);
    const code = await generateUniqueRoomCode(client);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("throws when the Supabase query errors", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "DB down" } });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal mock
    const client = { from } as any;

    await expect(generateUniqueRoomCode(client)).rejects.toThrow(
      "Room code collision check failed",
    );
  });
});
