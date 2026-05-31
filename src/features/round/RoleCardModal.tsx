import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import type { RoleAssignment } from "./useRoleAssignment";

/**
 * Minimum pointer displacement (px) before the lid is considered "held away"
 * and the role card underneath is treated as visible.
 */
const PEEK_THRESHOLD = 64;

export interface RoleCardModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Called when the modal is dismissed (close button, backdrop, Escape). */
  onClose: () => void;
  /** The device's own role assignment. */
  assignment: RoleAssignment;
  /**
   * Called exactly once the first time the player holds the lid past the peek
   * threshold (their first genuine peek). Wired to `mark_role_seen`.
   */
  onFirstPeek?: () => void;
  /** Called whenever peek visibility toggles (drives the "looking" indicator). */
  onPeekChange?: (isPeeking: boolean) => void;
  /** Whether the player has already peeked this game (suppresses first-peek). */
  initialHasPeeked?: boolean;
}

/**
 * Card-reveal modal (in-game redesign).
 *
 * A playing-card-shaped panel whose face shows the player's secret role. The
 * face is concealed by a slightly larger, springy "lid" the player drags out
 * of the way — it elastically snaps back to re-cover the card on release, so
 * the role is only ever visible while actively held. The lid carries the app
 * logo and a short instruction. A close (✕) button sits over the lid's
 * top-right corner; tapping the backdrop or pressing Escape also closes.
 *
 * Auto-opening on game entry is the caller's responsibility (DiscussionScreen
 * opens it on mount when the player hasn't yet seen their role).
 *
 * Built on Radix Dialog for portal rendering, focus trap, scroll lock and
 * backdrop/Escape dismissal.
 */
export function RoleCardModal({
  open,
  onClose,
  assignment,
  onFirstPeek,
  onPeekChange,
  initialHasPeeked = false,
}: RoleCardModalProps) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [keyHeld, setKeyHeld] = useState(false);
  const [hasPeeked, setHasPeeked] = useState(initialHasPeeked);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const prevVisibleRef = useRef(false);

  // Reset transient drag state every time the modal (re)opens so the lid
  // always starts fully covering the card.
  useEffect(() => {
    if (open) {
      setDrag({ x: 0, y: 0 });
      setIsDragging(false);
      setKeyHeld(false);
      setHasPeeked(initialHasPeeked);
      prevVisibleRef.current = false;
      if ("vibrate" in navigator) navigator.vibrate(60);
    }
  }, [open, initialHasPeeked]);

  const dist = Math.hypot(drag.x, drag.y);
  const pointerPeeking = isDragging && dist >= PEEK_THRESHOLD;
  const isVisible = pointerPeeking || keyHeld;
  const isCivilian = assignment.role === "civilian";

  // First-peek haptic + callback (fires at most once per open lifetime).
  useEffect(() => {
    if (isVisible && !hasPeeked) {
      setHasPeeked(true);
      if ("vibrate" in navigator) navigator.vibrate(25);
      onFirstPeek?.();
    }
    if (isVisible !== prevVisibleRef.current) {
      prevVisibleRef.current = isVisible;
      onPeekChange?.(isVisible);
    }
  }, [isVisible, hasPeeked, onFirstPeek, onPeekChange]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      originRef.current = { x: e.clientX, y: e.clientY };
      setIsDragging(true);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !originRef.current) return;
      setDrag({
        x: e.clientX - originRef.current.x,
        y: e.clientY - originRef.current.y,
      });
    },
    [isDragging],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setDrag({ x: 0, y: 0 });
    originRef.current = null;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        setKeyHeld(true);
      }
    },
    [],
  );

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setKeyHeld(false);
    }
  }, []);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <Dialog.Content
          aria-describedby={undefined}
          // Keep autofocus off the lid so the spring/drag affordance reads as
          // the primary action without an immediate focus ring flash.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={[
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 focus:outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          ].join(" ")}
        >
          <Dialog.Title className="sr-only">
            {t("round.peekAgainModalTitle")}
          </Dialog.Title>

          {/* Card frame — fixed playing-card proportions. */}
          <div className="relative h-[24rem] w-[17rem] max-w-[80vw]">
            {/* ── Card face (role) — bottom of the stack ─────────────────── */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-bg-raised px-5 text-center shadow-inner"
              aria-hidden={!isVisible}
            >
              <span className="text-7xl" aria-hidden="true">
                {isCivilian ? "🦆" : "🕵️"}
              </span>
              <p
                className={[
                  "mt-4 text-2xl font-bold",
                  isCivilian ? "text-success" : "text-danger",
                ].join(" ")}
              >
                {isCivilian ? t("round.roleCivilian") : t("round.roleImposter")}
              </p>

              {isCivilian && assignment.word && (
                <p className="mt-5 text-3xl font-bold tracking-wide text-fg">
                  {assignment.word}
                </p>
              )}

              {!isCivilian && (
                <>
                  <p className="mt-4 text-sm text-fg-muted">
                    {t("round.imposterHint")}
                  </p>
                  {isVisible && assignment.hints.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {assignment.hints.map((hint, i) => (
                        <li key={i} className="text-sm font-medium text-fg">
                          {hint}
                        </li>
                      ))}
                    </ul>
                  )}
                  {isVisible && assignment.coImposters.length > 0 && (
                    <p className="mt-2 text-xs font-medium text-danger">
                      {t("round.coImposters", {
                        names: assignment.coImposters
                          .map((c) => c.displayName)
                          .join(", "),
                      })}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── Lid (top) — slightly larger so it always over-covers ───── */}
            <div
              className={[
                "absolute -inset-2 flex flex-col items-center justify-center gap-5 rounded-[1.75rem]",
                "bg-bg-raised shadow-2xl ring-1 ring-border",
                "select-none touch-none",
                isDragging ? "cursor-grabbing" : "cursor-grab",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              ].join(" ")}
              style={{
                transform: `translate(${drag.x}px, ${drag.y}px)`,
                transition: isDragging
                  ? "none"
                  : "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
                userSelect: "none",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              tabIndex={0}
              role="button"
              aria-label={t("round.dragToReveal")}
              aria-pressed={isVisible}
            >
              <img
                src="/quack_150.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none h-20 w-20 select-none"
                draggable={false}
              />
              <p className="pointer-events-none max-w-[12rem] px-2 text-center text-sm font-medium text-fg-muted">
                {t("round.lidInstruction")}
              </p>

              {/* Close button — anchored to the lid so it moves with it. */}
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={t("round.cardModalCloseLabel")}
                  // Stop the pointer-down from starting a lid drag.
                  onPointerDown={(e) => e.stopPropagation()}
                  className={[
                    "absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center",
                    "text-fg-muted transition-colors hover:text-fg",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  ].join(" ")}
                >
                  <Icon
                    icon="lucide:x"
                    className="h-5 w-5"
                    aria-hidden="true"
                  />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Polite announcement for screen readers when role becomes visible. */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {isVisible &&
              (isCivilian
                ? `${t("round.roleCivilian")}: ${assignment.word ?? ""}`
                : t("round.roleImposter"))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
