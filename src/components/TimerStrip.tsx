import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";

function PlayIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Icon
      icon="mdi:play"
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
}

function PauseIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Icon
      icon="mdi:pause"
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
}

interface TimerStripProps {
  /**
   * Server-issued ISO timestamp when the countdown ends.
   * Null = timer not yet started; standalone mode counts down from totalSeconds.
   * All maths is relative to this so clock skew between devices is irrelevant.
   */
  endsAt: string | null;
  /**
   * Total duration in seconds — used to compute the fill width and to
   * initialise the standalone (no endsAt) countdown.
   */
  totalSeconds: number;
  /**
   * Whether the countdown is actively running.
   * When false the strip freezes at the current remaining time (pause state).
   */
  running?: boolean;
  /**
   * Frozen remaining seconds when the timer is paused (server-driven). Used to
   * restore the bar to the paused position on reload — otherwise a refreshing
   * client would reset to the full `totalSeconds`. Ignored while running.
   */
  pausedSeconds?: number | null;
  /**
   * Called when the strip is pressed (play/pause toggle).
   * When omitted the strip renders as a display-only element (no button).
   */
  onToggle?: () => void;
  /** Called once when the countdown reaches zero (client-side). */
  onComplete?: () => void;
}

/**
 * Horizontal countdown timer strip.
 *
 * Layout:
 *   • Full-width bar, no border radius (edge-to-edge).
 *   • Coloured fill shrinks left → right as time passes (reverse progress).
 *   • Two stacked content layers (icon + MM:SS), clipped to opposite halves:
 *       - Dark text/icon over the filled portion  → always readable on colour.
 *       - Light text/icon over the depleted portion → always readable on dark bg.
 *     The split boundary follows the fill in real-time, so every character
 *     is always fully visible and switches colour exactly as the bar crosses it.
 *   • Play/pause icon shown only when `onToggle` is provided.
 *
 * Pause/resume: an internal ref preserves remaining time so toggling resumes
 * from the paused position rather than resetting to totalSeconds.
 *
 * When `onToggle` is provided the strip is a tappable <button>.
 * Otherwise it renders as a display-only <div role="timer">.
 */
export function TimerStrip({
  endsAt,
  totalSeconds,
  running = false,
  pausedSeconds,
  onToggle,
  onComplete,
}: TimerStripProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (running && endsAt) {
      return Math.max(0, (new Date(endsAt).getTime() - Date.now()) / 1000);
    }
    if (!running && pausedSeconds != null) {
      return Math.max(0, pausedSeconds);
    }
    return totalSeconds;
  });

  // Mutable ref so the RAF closure always has the latest remaining without
  // stale closure issues, and pause/resume can read the frozen value.
  const remainingRef = useRef(remaining);
  const completedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Stable ref for onComplete — avoids restarting the RAF loop if the caller
  // passes an un-memoised inline function.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // While paused (or freshly reloaded into a paused state), keep the frozen
  // remaining in sync with the server-provided value so the bar holds at the
  // exact spot the host paused it rather than snapping back to full.
  useEffect(() => {
    if (!running && pausedSeconds != null) {
      const frozen = Math.max(0, pausedSeconds);
      remainingRef.current = frozen;
      setRemaining(frozen);
    }
  }, [running, pausedSeconds]);

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!running) return; // paused — freeze at current remaining

    // Determine effective end time:
    //   • endsAt provided (server-driven): authoritative, sync from server.
    //   • No endsAt (standalone/playground): resume from paused remaining.
    let endMs: number;
    if (endsAt) {
      endMs = new Date(endsAt).getTime();
      const serverRem = Math.max(0, (endMs - Date.now()) / 1000);
      remainingRef.current = serverRem;
      setRemaining(serverRem);
    } else {
      endMs = Date.now() + remainingRef.current * 1000;
    }

    completedRef.current = false;

    function tick() {
      const rem = Math.max(0, (endMs - Date.now()) / 1000);
      remainingRef.current = rem;
      setRemaining(rem);
      if (rem <= 0) {
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [running, endsAt]); // onComplete intentionally omitted — accessed via ref

  const progress = totalSeconds > 0 ? Math.min(remaining / totalSeconds, 1) : 0;
  // CSS clip-path percentages — three decimal places avoids subpixel gaps.
  const fillPct = `${(progress * 100).toFixed(3)}%`;
  const emptyPct = `${((1 - progress) * 100).toFixed(3)}%`;

  // Display ceiling so "1:00" shows for the whole last second, not "0:60".
  const displaySeconds = Math.ceil(remaining);
  const mm = Math.floor(displaySeconds / 60);
  const ss = String(displaySeconds % 60).padStart(2, "0");
  const timeStr = `${mm}:${ss}`;

  // Colour ramp: static green before start; green → yellow → red when running.
  const fillColor =
    !running || progress > 0.5
      ? "var(--color-success)"
      : progress > 0.2
        ? "var(--color-accent)"
        : "var(--color-danger)";

  const ariaLabel = onToggle
    ? `${timeStr} remaining, tap to ${running ? "pause" : "start"}`
    : `${timeStr} remaining`;

  // Responsive sizing — the strip scales down on short viewports so it never
  // dominates a small screen, but is capped at the original (large-screen)
  // dimensions. Height drives the icon/font scale via shared clamp values.
  const iconStyle = {
    width: "clamp(2.25rem, 6.5vh, 4rem)",
    height: "clamp(2.25rem, 6.5vh, 4rem)",
  } as const;
  const timeFontStyle = { fontSize: "clamp(2.75rem, 9vh, 6.3rem)" } as const;

  const inner = (
    <>
      {/* Coloured fill bar — no CSS transition; RAF drives smooth updates */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0"
        style={{ width: fillPct, backgroundColor: fillColor }}
      />

      {/* Dark layer — clipped to the filled portion.
          Dark text/icon on the coloured fill — always readable. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-4"
        style={{ clipPath: `inset(0 ${emptyPct} 0 0)` }}
      >
        {onToggle &&
          (running ? (
            <PauseIcon className="shrink-0 text-accent-ink" style={iconStyle} />
          ) : (
            <PlayIcon className="shrink-0 text-accent-ink" style={iconStyle} />
          ))}
        <span
          className="font-black tabular-nums leading-none text-accent-ink"
          style={timeFontStyle}
        >
          {timeStr}
        </span>
      </div>

      {/* Light layer — clipped to the depleted (background) portion.
          Light text/icon on the dark background — always readable. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-4"
        style={{ clipPath: `inset(0 0 0 ${fillPct})` }}
      >
        {onToggle &&
          (running ? (
            <PauseIcon className="shrink-0 text-fg" style={iconStyle} />
          ) : (
            <PlayIcon className="shrink-0 text-fg" style={iconStyle} />
          ))}
        <span
          className="font-black tabular-nums leading-none text-fg"
          style={timeFontStyle}
        >
          {timeStr}
        </span>
      </div>
    </>
  );

  const sharedClass = "relative w-full overflow-hidden bg-bg-raised";
  const heightStyle = { height: "clamp(4.25rem, 12vh, 7rem)" } as const;

  if (onToggle) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onToggle}
        className={`${sharedClass} active:brightness-95`}
        style={heightStyle}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      role="timer"
      aria-label={ariaLabel}
      className={sharedClass}
      style={heightStyle}
    >
      {inner}
    </div>
  );
}
