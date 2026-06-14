import { useCallback, useState } from "react";
import { supabaseWithDevice } from "@/lib/supabase";
import { log } from "@/lib/log";

const HOST_SECRET_STORAGE_PREFIX = "quack_host_secret_";

/** Computes the SHA-256 hex digest of a UTF-8 string. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface UseDeclareWordGuessedReturn {
  declareWordGuessed: (params: {
    deviceId: string;
    roomId: string;
    gameId: string;
  }) => Promise<boolean>;
  loading: boolean;
}

/**
 * Host-only: ends a multi-round game because an imposter said the secret word
 * out loud. The guess happens in the real-world conversation, so the app
 * cannot verify it — the host acts as referee and confirms it. The
 * `declare_word_guessed` RPC stamps outcome = 'word_guessed' (imposters win)
 * and resolves the game for every device.
 */
export function useDeclareWordGuessed(): UseDeclareWordGuessedReturn {
  const [loading, setLoading] = useState(false);

  const declareWordGuessed = useCallback(
    async ({
      deviceId,
      roomId,
      gameId,
    }: {
      deviceId: string;
      roomId: string;
      gameId: string;
    }): Promise<boolean> => {
      setLoading(true);
      try {
        const rawSecret = localStorage.getItem(
          `${HOST_SECRET_STORAGE_PREFIX}${roomId}`,
        );
        if (!rawSecret) {
          log.warn("useDeclareWordGuessed: no host secret found");
          return false;
        }
        const secretHash = await sha256Hex(rawSecret);
        const { error } = await supabaseWithDevice(deviceId).rpc(
          "declare_word_guessed",
          { p_game_id: gameId, p_host_secret_hash: secretHash },
        );
        if (error) {
          log.error("declare_word_guessed RPC error", error.code);
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { declareWordGuessed, loading };
}
