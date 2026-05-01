import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, CountdownDial } from "@/components";
import type { RoleAssignment } from "./useRoleAssignment";

/**
 * Plays a short audible "ding" using the Web Audio API.
 * Silently no-ops if AudioContext is unavailable or blocked by browser policy.
 */
function playTimerPing() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 — clear, pleasant
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => void ctx.close();
  } catch {
    // AudioContext may be blocked before a user gesture — fail silently.
  }
}

interface NeutralRoundScreenProps {
  /** Room code shown as a subtle anchor — players can confirm they're in the right room. */
  roomCode: string | undefined;
  /** The device's own role assignment — used to power the private "peek" feature. */
  assignment: RoleAssignment | null;
  /**
   * All players currently in the room (names only — no role information is
   * passed here; the component never renders role data in the default view).
   */
  players: { id: string; display_name: string }[];
  /** The calling device's UUID — used to render the "You" badge on the roster. */
  deviceId: string | null;
  /** Whether the current player is the host. When true, the End Round button is shown. */
  isHost?: boolean;
  /** Called when the host taps the End Round button. */
  onEndRound?: () => void;
  /** Whether the end-round action is in-flight. Disables the button during loading. */
  endRoundLoading?: boolean;
}

/**
 * Neutral mid-round screen (E3-T6).
 *
 * Design goals:
 *  1. A casual glance from a neighbour reveals nothing about this player's
 *     role — no role label, no word, no role-keyed colour on the base screen.
 *  2. The player can privately peek at their own role via a "Peek" button that
 *     opens a full-screen overlay. All role content is hidden until explicitly
 *     requested; the overlay must be dismissed before handing the device on.
 *  3. The player list (names only) gives context for the discussion without
 *     leaking any assignment information.
 */
export function NeutralRoundScreen({
  roomCode,
  assignment,
  players,
  deviceId,
  isHost = false,
  onEndRound,
  endRoundLoading = false,
}: NeutralRoundScreenProps) {
  const { t } = useTranslation();
  const [peeking, setPeeking] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const peekBtnRef = useRef<HTMLButtonElement>(null);
  const doneBtnRef = useRef<HTMLButtonElement>(null);

  const handleTimerComplete = useCallback(() => {
    setTimerDone(true);
    if ("vibrate" in navigator) navigator.vibrate(200);
    playTimerPing();
  }, []);

  const handlePeekOpen = useCallback(() => {
    if ("vibrate" in navigator) navigator.vibrate(25);
    setPeeking(true);
  }, []);

  const handlePeekClose = useCallback(() => {
    setPeeking(false);
    // Return focus to the peek button so keyboard/screen-reader flow is intact.
    peekBtnRef.current?.focus();
  }, []);

  // Move focus into the overlay immediately when it opens.
  useEffect(() => {
    if (peeking) {
      doneBtnRef.current?.focus();
    }
  }, [peeking]);

  // Allow Escape to close the overlay (ARIA dialog keyboard contract).
  useEffect(() => {
    if (!peeking) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handlePeekClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [peeking, handlePeekClose]);

  const isCivilian = assignment?.role === "civilian";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      {/* Round number — contextual, does not encode role info. */}
      {assignment && (
        <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          {t("round.roundLabel", { index: assignment.roundIndex + 1 })}
        </p>
      )}

      <span className="mt-4 text-6xl" aria-hidden="true">
        🦆
      </span>

      <h1 className="mt-6 text-center text-2xl font-semibold text-fg">
        {t("round.neutralTitle")}
      </h1>
      <p className="mt-3 text-center text-sm text-fg-muted">
        {t("round.neutralSubtitle")}
      </p>

      {/* Player roster — names only, deliberately no role labels or colours. */}
      {players.length > 0 && (
        <ul
          className="mt-8 w-full space-y-2"
          aria-label={t("round.neutralPlayers")}
        >
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center rounded-xl bg-bg-raised px-4 py-3"
            >
              <span className="flex-1 truncate font-medium text-fg">
                {p.display_name}
              </span>
              {p.id === deviceId && (
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                  {t("room.you")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Room code — subtle anchor so players can confirm they're in the right room. */}
      {roomCode && (
        <p className="mt-6 font-mono text-xs text-fg-subtle">
          {roomCode.toUpperCase()}
        </p>
      )}

      {/* Discussion timer — only rendered when ends_at is set for this round. */}
      {assignment?.endsAt && assignment.timerSeconds !== null && (
        <div className="mt-8 flex flex-col items-center gap-3">
          {timerDone ? (
            <p className="text-center text-sm font-semibold text-danger">
              {t("round.timerDone")}
            </p>
          ) : (
            <CountdownDial
              endsAt={assignment.endsAt}
              totalSeconds={assignment.timerSeconds}
              size={160}
              onComplete={handleTimerComplete}
            />
          )}
        </div>
      )}

      {/* Peek button — only rendered when an assignment is available. */}
      {assignment && (
        <Button
          ref={peekBtnRef}
          variant="ghost"
          size="sm"
          onClick={handlePeekOpen}
          className="mt-8"
        >
          {t("round.peekCta")}
        </Button>
      )}

      {/* End Round — host-only action; returns all players to the lobby. */}
      {isHost && onEndRound && (
        <Button
          variant="danger"
          size="lg"
          onClick={onEndRound}
          disabled={endRoundLoading}
          className="mt-4 w-full max-w-xs"
        >
          {endRoundLoading ? "…" : t("round.endRoundCta")}
        </Button>
      )}

      {/* ── Peek overlay ──────────────────────────────────────────────────────── */}
      {/* Full-screen overlay that shows the player's own role. Rendered only on  */}
      {/* explicit request; must be dismissed before the screen is neutral again. */}
      {peeking && assignment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6"
          role="dialog"
          aria-modal="true"
          aria-label={t("round.cardRevealedHint")}
        >
          <div
            className={[
              "w-full max-w-xs rounded-2xl px-6 py-8 shadow-2xl",
              isCivilian
                ? "bg-success/10 ring-1 ring-success/30"
                : "bg-danger/10 ring-1 ring-danger/30",
            ].join(" ")}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="text-5xl" aria-hidden="true">
                {isCivilian ? "🦆" : "🕵️"}
              </span>
              <p
                className={[
                  "text-lg font-bold",
                  isCivilian ? "text-success" : "text-danger",
                ].join(" ")}
              >
                {isCivilian ? t("round.roleCivilian") : t("round.roleImposter")}
              </p>
              {isCivilian && assignment.word && (
                <p className="text-3xl font-bold tracking-tight text-fg">
                  {assignment.word}
                </p>
              )}
              {!isCivilian && (
                <p className="text-sm text-fg-muted">{t("round.imposterHint")}</p>
              )}
            </div>
            <Button
              ref={doneBtnRef}
              variant="primary"
              size="lg"
              onClick={handlePeekClose}
              className="mt-8 w-full"
            >
              {t("round.peekDone")}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
