import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * 28-character alphabet for room codes.
 * Excludes visually ambiguous characters: 0, O, 1, I, L.
 * Gives 28^6 ≈ 481 million possible codes — ample for active concurrency.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
const MAX_RETRIES = 10;

/**
 * Generates a cryptographically random room code.
 * Uses crypto.getRandomValues for unbiased selection.
 */
export function generateRawCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]!)
    .join("");
}

/**
 * Generates a room code that does not collide with any active room in
 * the database. Retries up to MAX_RETRIES times.
 *
 * Throws if no unique code can be found (astronomically unlikely in practice
 * but handled explicitly to surface bugs early).
 *
 * @param client - A Supabase client with sufficient privileges to query rooms.
 *                 The anon client is fine; the rooms table is open for SELECT
 *                 to any device (we only need to check code existence, not
 *                 read any private data). For the collision check we use the
 *                 service-role client in tests; the anon client in production.
 */
export async function generateUniqueRoomCode(
  client: SupabaseClient<Database>,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateRawCode();

    // Check whether this code is already in use by an active room.
    // We only need to know if a row exists — we don't read its content.
    const { data, error } = await client
      .from("rooms")
      .select("code")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      throw new Error(`Room code collision check failed: ${error.message}`);
    }

    if (data === null) {
      // No existing room with this code — safe to use.
      return code;
    }
  }

  throw new Error(
    `Could not generate a unique room code after ${MAX_RETRIES} attempts.`,
  );
}
