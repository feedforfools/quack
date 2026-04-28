import { useState, useCallback } from "react";
import { log } from "@/lib/log";

const STORAGE_KEY = "quack_display_name";
const MAX_LENGTH = 30;

export interface UseDisplayNameReturn {
  /** Persisted display name, or null if not yet set. */
  displayName: string | null;
  /** Whether the user has already supplied a display name. */
  hasDisplayName: boolean;
  /** Persist a new display name. Trims whitespace and enforces MAX_LENGTH. */
  setDisplayName: (name: string) => void;
  /** Clear the stored display name (e.g. on reset). */
  clearDisplayName: () => void;
}

/**
 * Manages the player's display name stored in localStorage under `quack_display_name`.
 * The name is intentionally ephemeral — there is no account; it persists only for the
 * convenience of repeat players on the same device.
 *
 * MAX_LENGTH is 30 characters. The setter trims whitespace and rejects empty strings
 * (a no-op rather than throwing, to keep call sites simple).
 */
export function useDisplayName(): UseDisplayNameReturn {
  const [displayName, setDisplayNameState] = useState<string | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ?? null;
  });

  const setDisplayName = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, MAX_LENGTH);
    if (!trimmed) {
      log.debug("useDisplayName: empty name ignored");
      return;
    }
    localStorage.setItem(STORAGE_KEY, trimmed);
    setDisplayNameState(trimmed);
    log.debug("useDisplayName: display name saved");
  }, []);

  const clearDisplayName = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setDisplayNameState(null);
    log.debug("useDisplayName: display name cleared");
  }, []);

  return {
    displayName,
    hasDisplayName: displayName !== null,
    setDisplayName,
    clearDisplayName,
  };
}

/** Exported constant so consumers can apply the same rule without a magic number. */
export const DISPLAY_NAME_MAX_LENGTH = MAX_LENGTH;
