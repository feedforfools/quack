import type { ReactNode, Ref } from "react";

export interface GameScaffoldProps {
  /**
   * Top region of the page — a room header (lobby) or a TimerStrip (in-game).
   * Rendered flush at the top, never scrolls.
   */
  header: ReactNode;
  /** Short hint shown directly below the header, above the list. */
  belowHeader?: ReactNode;
  /**
   * Main content — typically a `PlayerList`. Grows to fill the available
   * height between the header and the footer.
   */
  list: ReactNode;
  /**
   * Optional ref forwarded to the list region wrapper — used by pages that
   * measure the available space (e.g. the lobby's column ResizeObserver).
   */
  listRef?: Ref<HTMLDivElement>;
  /** Accessible label for the list region. When set, the region gets a role. */
  listLabel?: string;
  /**
   * Optional component slotted between the list and the footer hints, e.g.
   * the lobby's "next game" card. Never scrolls.
   */
  extra?: ReactNode;
  /** Short hint shown directly above the footer button row. */
  aboveFooter?: ReactNode;
  /** Footer button row — page-specific actions. */
  footer: ReactNode;
  /** Short hint shown directly below the footer button row. */
  belowFooter?: ReactNode;
  /**
   * Whether the list region scrolls when it overflows (`true`, in-game roster)
   * or clips for a fixed column layout (`false`, lobby). Defaults to `false`.
   */
  scrollList?: boolean;
}

/**
 * Shared full-height page scaffold for the room/lobby and in-game screens.
 *
 * Every one of these pages shares the same vertical anatomy:
 *
 *   1. header          — room header or timer strip          (fixed)
 *   2. belowHeader     — short context hint                  (fixed)
 *   3. list            — player roster with per-page slots   (flex, grows)
 *   4. extra           — optional component (e.g. game card) (fixed)
 *   5. aboveFooter     — short hint above the buttons        (fixed)
 *   6. footer          — page-specific action buttons        (fixed)
 *   7. belowFooter     — short hint below the buttons        (fixed)
 *
 * Centralising it here keeps spacing and — crucially — the hint typography
 * (`text-xs text-fg-muted`) identical across pages, so the lobby and the
 * in-game screens read as one consistent app.
 */
export function GameScaffold({
  header,
  belowHeader,
  list,
  listRef,
  listLabel,
  extra,
  aboveFooter,
  footer,
  belowFooter,
  scrollList = false,
}: GameScaffoldProps) {
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col">
      {/* 1. Header — fixed, edge-to-edge (its own component owns any padding) */}
      <div className="flex-none">{header}</div>

      {/* 2. Hint below header */}
      {belowHeader != null && <Hint className="px-4 pt-2">{belowHeader}</Hint>}

      {/* 3. List — grows to fill, scrolls or clips per page */}
      <div
        ref={listRef}
        role={listLabel ? "region" : undefined}
        aria-label={listLabel}
        className={`mt-2 min-h-0 flex-1 px-4 ${
          scrollList ? "overflow-y-auto" : "overflow-hidden"
        }`}
      >
        {list}
      </div>

      {/* 4. Optional extra component */}
      {extra != null && <div className="mt-2 flex-none px-4">{extra}</div>}

      {/* 5. Hint above footer */}
      {aboveFooter != null && <Hint className="px-4 pt-2">{aboveFooter}</Hint>}

      {/* 6 + 7. Footer buttons and the hint below them */}
      <div className="flex-none px-4 pb-6 pt-3">
        {footer}
        {belowFooter != null && <Hint className="mt-2">{belowFooter}</Hint>}
      </div>
    </main>
  );
}

/** Canonical hint typography shared by every scaffold text slot. */
function Hint({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex-none text-center text-xs text-fg-muted ${className}`}>
      {children}
    </div>
  );
}
