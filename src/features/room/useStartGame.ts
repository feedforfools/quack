import { useState, useCallback } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { fetchWordPools, pickWord } from "@/lib/words";
import type { WordPoolCategory, WordPoolLang } from "@/lib/words";
import { log } from "@/lib/log";

const HOST_SECRET_STORAGE_PREFIX = "quack_host_secret_";

/** Computes the SHA-256 hex digest of a UTF-8 string using the Web Crypto API. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type StartGameError =
  | "room.startErrorNotHost"
  | "room.startErrorGeneric";

export interface UseStartGameReturn {
  startGame: (params: {
    deviceId: string;
    roomId: string;
    language: WordPoolLang;
    categories: WordPoolCategory[];
  }) => Promise<boolean>;
  loading: boolean;
  error: StartGameError | null;
}

/**
 * Hook for host-initiated game start (E3-T4, renamed E3-T12).
 *
 * Flow:
 *  1. Query the games table to determine the expected next game index.
 *  2. Fetch word pools for the room's language + categories and pick a word
 *     (word is never logged — privacy constraint §10).
 *  3. Read the raw host secret from localStorage and compute its SHA-256 hash.
 *  4. Call the `start_round` RPC, which server-side validates the host,
 *     randomly assigns imposters, inserts role_assignments, and flips room
 *     state to 'round_active'.
 *
 * The word is chosen client-side from static word-pool JSON files because the
 * Supabase RPC (a Postgres function) cannot fetch external resources.  Imposter
 * assignment is server-side to prevent any client from learning the assignment
 * before their reveal.
 */
export function useStartGame(): UseStartGameReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<StartGameError | null>(null);

  const startGame = useCallback(
    async ({
      deviceId,
      roomId,
      language,
      categories,
    }: {
      deviceId: string;
      roomId: string;
      language: WordPoolLang;
      categories: WordPoolCategory[];
    }): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const client = supabaseWithDevice(deviceId);

        // 1. Determine the next expected game index.
        const { data: lastGame } = await client
          .from("games")
          .select("index")
          .eq("room_id", roomId)
          .order("index", { ascending: false })
          .limit(1)
          .maybeSingle();

        const nextIndex = (lastGame?.index ?? 0) + 1;

        // 2. Pick a word from the word pool (never logged).
        const pools = await fetchWordPools(language, categories);
        const word = pickWord(pools);

        // 3. Read raw host secret and hash it.
        const rawSecret = localStorage.getItem(
          `${HOST_SECRET_STORAGE_PREFIX}${roomId}`,
        );
        if (!rawSecret) {
          log.warn("useStartGame: no host secret in localStorage");
          setError("room.startErrorNotHost");
          return false;
        }
        const secretHash = await sha256Hex(rawSecret);

        // 4. Call the RPC.
        const { error: rpcError } = await client.rpc("start_game", {
          p_room_id: roomId,
          p_host_secret_hash: secretHash,
          p_intended_index: nextIndex,
          p_word: word,
        });

        if (rpcError) {
          log.error("useStartGame: RPC error", rpcError.code);
          setError("room.startErrorGeneric");
          return false;
        }

        return true;
      } catch (err) {
        log.error("useStartGame: unexpected error", err);
        setError("room.startErrorGeneric");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { startGame, loading, error };
}
