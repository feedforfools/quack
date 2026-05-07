import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components";
import { RoleReveal } from "./RoleReveal";
import type { RoleAssignment } from "./useRoleAssignment";

interface RevealScreenProps {
  /** The player's role assignment — powers the drag-lid card. */
  assignment: RoleAssignment;
  /**
   * Called exactly once the first time the player holds the lid past the
   * peek threshold. Wired to `mark_role_seen` in Room.tsx.
   */
  onFirstPeek?: () => void;
  /**
   * Called when the player taps "Continue" after peeking.
   * Transitions to the discussion screen in Room.tsx.
   */
  onContinue: () => void;
}

/**
 * Reveal phase screen (E5.5-T5).
 *
 * Shown before the player has seen their role for the first time.
 * Displays the drag-lid card as the primary visual with no other
 * in-game UI (no timer, no roster, no voting) so the player
 * can focus on privately checking their role.
 *
 * Once the player peeks (lid held past the threshold), a "Continue"
 * button appears. Tapping it calls `onContinue` to transition
 * Room.tsx to the discussion phase.
 *
 * On reload: if `assignment.seenAt` is already set, Room.tsx skips
 * this screen and goes directly to the discussion phase — the
 * player should not be forced to re-reveal after a refresh.
 */
export function RevealScreen({
  assignment,
  onFirstPeek,
  onContinue,
}: RevealScreenProps) {
  const { t } = useTranslation();
  // Pre-set to true when seenAt is already stamped (e.g., brief reload that
  // somehow ended up here) so the Continue button is immediately visible.
  const [hasPeeked, setHasPeeked] = useState(assignment.seenAt !== null);

  const handleFirstPeek = () => {
    setHasPeeked(true);
    onFirstPeek?.();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-10">
      {/* Game label */}
      <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
        {t("round.gameLabel", { index: assignment.roundIndex })}
      </p>

      <h1 className="mt-8 text-center text-2xl font-semibold text-fg">
        {t("round.revealTitle")}
      </h1>
      <p className="mt-2 text-center text-sm text-fg-muted">
        {t("round.revealSubtitle")}
      </p>

      {/* Drag-lid card — the sole focus of this screen */}
      <div className="mt-8 flex flex-col items-center">
        <RoleReveal
          assignment={assignment}
          onFirstPeek={handleFirstPeek}
          initialHasPeeked={assignment.seenAt !== null}
        />
      </div>

      {/* Continue button — appears after the first lid-peek */}
      {hasPeeked && (
        <Button
          variant="primary"
          size="lg"
          onClick={onContinue}
          className="mt-8 w-full max-w-xs"
        >
          {t("round.revealContinueCta")}
        </Button>
      )}
    </main>
  );
}
