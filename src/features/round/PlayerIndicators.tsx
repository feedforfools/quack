import { Icon } from "@iconify/react";

/**
 * Per-player in-game status indicators, injected into `PlayerList` via its
 * `modifiers` slots. Kept tiny and presentational so they can be reused by
 * future game modes (the roster + indicator contract is game-agnostic).
 */

/**
 * Skip-to-vote indicator — a blue fast-forward glyph shown when a player has
 * called to vote (i.e. requested to skip the discussion). Only meaningful when
 * the room's `call_to_vote` setting is enabled.
 */
export function SkipIndicator({ label }: { label?: string }) {
  return (
    <Icon
      icon="lucide:chevrons-right"
      className="h-4 w-4 text-sky-400"
      aria-label={label}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}

/**
 * Seen-card indicator — an eye-with-check glyph shown when a player has peeked
 * at their role card at least once. Lets the host see who is ready before
 * starting the timer.
 */
export function SeenIndicator({ label }: { label?: string }) {
  return (
    <Icon
      icon="mdi:eye-check"
      className="h-4 w-4 text-success"
      aria-label={label}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}
