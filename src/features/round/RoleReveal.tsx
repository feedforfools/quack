import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoleAssignment } from "./useRoleAssignment";

/**
 * Minimum pointer displacement (px) before the lid is considered "held away"
 * and the role tile underneath is treated as visible.
 */
const PEEK_THRESHOLD = 72;

export interface RoleRevealProps {
  assignment: RoleAssignment;
  /**
   * Called exactly once the first time the player holds the lid past the
   * peek threshold. Wired to `mark_role_seen` in E3-T11.
   */
  onFirstPeek?: () => void;
  /**
   * Called whenever the peek visibility state changes.
   * Useful for DiscussionScreen to react to peek state (e.g., hide timer).
   */
  onPeekChange?: (isPeeking: boolean) => void;
}

/**
 * Drag-lid role reveal sub-component (E3-T5 / E3-T6).
 *
 * Returns a Fragment so DiscussionScreen can compose it inline without
 * introducing an extra DOM wrapper. A solid "lid" card sits on top of the
 * role tile. The player drags the lid away; the role is visible only while
 * the lid is displaced past PEEK_THRESHOLD. Releasing causes an elastic
 * spring animation back to the covering position.
 *
 * Keyboard users can hold Space / Enter to enter peek mode.
 *
 * Haptics:
 *  - 60 ms on round arrival (component mount).
 *  - 25 ms on first peek (lid held past threshold for the first time).
 */
export function RoleReveal({ assignment, onFirstPeek, onPeekChange }: RoleRevealProps) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [keyHeld, setKeyHeld] = useState(false);
  const [hasPeeked, setHasPeeked] = useState(false);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  // Haptic on round arrival.
  useEffect(() => {
    if ("vibrate" in navigator) navigator.vibrate(60);
  }, []);

  const dist = Math.hypot(drag.x, drag.y);
  const pointerPeeking = isDragging && dist >= PEEK_THRESHOLD;
  const isVisible = pointerPeeking || keyHeld;
  const isCivilian = assignment.role === "civilian";

  // First-peek haptic + callback (fires at most once per component lifetime).
  const prevVisibleRef = useRef(false);
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

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    originRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
  }, []);

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

  // Keyboard: hold Space / Enter to enter peek mode; release to cover.
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      setKeyHeld(true);
    }
  }, []);

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setKeyHeld(false);
    }
  }, []);

  return (
    <>
      {/* Instruction text — updates when peeking */}
      <p className="mb-8 text-center text-sm text-fg-muted">
        {isVisible ? t("round.peekingNow") : t("round.dragToReveal")}
      </p>

      {/*
       * Card stack: role tile rendered first (bottom of stacking context),
       * then the lid on top.
       */}
      <div className="relative h-72 w-56">
        {/* ── Role tile (bottom) ──────────────────────────────────────────── */}
        <div
          className={[
            "absolute inset-0 flex flex-col items-center justify-center rounded-2xl px-4 shadow-inner",
            "bg-bg-raised",
          ].join(" ")}
          aria-hidden={!isVisible}
        >
          <span className="text-6xl" aria-hidden="true">
            {isCivilian ? "🦆" : "🕵️"}
          </span>
          <p
            className={[
              "mt-4 text-xl font-bold",
              isCivilian ? "text-success" : "text-danger",
            ].join(" ")}
          >
            {isCivilian ? t("round.roleCivilian") : t("round.roleImposter")}
          </p>
          {isCivilian && assignment.word && (
            <p className="mt-5 text-center text-2xl font-bold tracking-wide text-fg">
              {assignment.word}
            </p>
          )}
          {!isCivilian && (
            <p className="mt-4 text-center text-sm text-fg-muted">
              {t("round.imposterHint")}
            </p>
          )}
        </div>

        {/* ── Draggable lid (top) ─────────────────────────────────────────── */}
        <div
          className={[
            "absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-bg-raised shadow-xl",
            "select-none touch-none",
            isDragging ? "cursor-grabbing" : "cursor-grab",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
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
          <span className="pointer-events-none text-7xl" aria-hidden="true">
            🃏
          </span>
          <p className="pointer-events-none mt-4 text-sm font-medium text-fg-muted">
            {t("round.dragToReveal")}
          </p>
        </div>
      </div>

      {/* Polite announcement for screen readers when role becomes visible. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {isVisible &&
          (isCivilian
            ? `${t("round.roleCivilian")}: ${assignment.word ?? ""}`
            : t("round.roleImposter"))}
      </div>
    </>
  );
}
