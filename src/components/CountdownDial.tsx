import { useEffect, useRef, useState } from "react";

interface CountdownDialProps {
  /**
   * Server-issued ISO timestamp when the countdown ends.
   * All maths is relative to this so clock skew between devices is irrelevant.
   */
  endsAt: string;
  /**
   * Total duration of the countdown in seconds — used to compute the arc fill.
   * Derive from the server `config_snapshot` so all clients agree.
   */
  totalSeconds: number;
  /** Diameter of the dial in CSS px. Default: 160. */
  size?: number;
  /** Called once when the countdown reaches zero (client-side). */
  onComplete?: () => void;
}

/**
 * SVG circular countdown dial.
 *
 * Rendering strategy:
 * - A `requestAnimationFrame` loop recomputes elapsed time against `endsAt`
 *   every frame so the display stays smooth without drift.
 * - The remaining time is displayed in the centre (MM:SS).
 * - The arc fill is proportional to remaining / total.
 * - When the timer reaches zero the arc disappears, the centre shows "00:00",
 *   and `onComplete` is called once.
 *
 * Accessibility: the dial is `role="timer"` with `aria-label` updated each
 * second; the numeric readout is `aria-live="off"` (the role handles SR).
 */
export function CountdownDial({
  endsAt,
  totalSeconds,
  size = 160,
  onComplete,
}: CountdownDialProps) {
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, (new Date(endsAt).getTime() - Date.now()) / 1000),
  );
  const completedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    completedRef.current = false;
    const endMs = new Date(endsAt).getTime();

    function tick() {
      const rem = Math.max(0, (endMs - Date.now()) / 1000);
      setRemaining(rem);

      if (rem <= 0) {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
        return; // stop the loop
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [endsAt, onComplete]);

  // SVG geometry
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const dashOffset = circumference * (1 - Math.min(progress, 1));

  // Colour: green → yellow → red as time runs out
  const arcColour =
    progress > 0.5
      ? "var(--color-success)" // success
      : progress > 0.2
        ? "var(--color-accent)" // accent/warning
        : "var(--color-danger)"; // danger

  // Label for screen readers (update every second)
  const displaySeconds = Math.ceil(remaining);
  const mm = String(Math.floor(displaySeconds / 60)).padStart(2, "0");
  const ss = String(displaySeconds % 60).padStart(2, "0");
  const ariaLabel = `${mm}:${ss} remaining`;

  return (
    <div
      role="timer"
      aria-label={ariaLabel}
      style={{ width: size, height: size }}
      className="relative inline-flex items-center justify-center"
    >
      <svg
        width={size}
        height={size}
        aria-hidden="true"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          style={{ stroke: "rgb(var(--color-border))" }}
          strokeWidth={stroke}
        />
        {/* Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ stroke: arcColour, transition: "stroke 0.5s" }}
        />
      </svg>

      {/* Centre readout */}
      <span
        aria-hidden="true"
        className="absolute text-4xl font-bold tabular-nums text-fg"
      >
        {mm}:{ss}
      </span>
    </div>
  );
}
