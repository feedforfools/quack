import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { Icon } from "@iconify/react";
import type { PlayerRow } from "@/features/room";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Delay in ms before a pressed row triggers the kick overlay. */
const LONG_PRESS_MS = 600;
/** Max pointer movement in px before the long-press is cancelled (allows scrolling). */
const LONG_PRESS_MOVE_THRESHOLD = 10;
/**
 * Fallback thresholds used only when the parent does not provide an explicit
 * `columns` value (i.e. no height-aware container). The Room page overrides
 * these via a ResizeObserver that computes the optimal split dynamically.
 */
const TWO_COL_THRESHOLD = 8;
const THREE_COL_THRESHOLD = 14;

// ─── Public types ─────────────────────────────────────────────────────────────

/** Per-player contextual slot content, injected by the parent page. */
export interface PlayerModifiers {
  /**
   * Slot A — rendered left of the host crown.
   * Pass a number node for vote tallies or any ReactNode for a custom icon.
   */
  firstModifier?: ReactNode;
  /**
   * Slot B — rendered rightmost in the indicator group.
   * Swap based on game phase: e.g. a checkmark for "ready", a skip icon for
   * "voted to end discussion", a skull for "eliminated", etc.
   */
  mainModifier?: ReactNode;
  /**
   * Visually disables the row — dimmed surface, struck-through name — without
   * removing the player from the roster. Used for players eliminated during
   * a multi-round game; reusable by any mode that knocks players out.
   */
  disabled?: boolean;
}

export interface PlayerListProps {
  players: PlayerRow[];
  /** Player IDs currently visible on the Realtime presence channel. */
  connectedIds: Set<string>;
  /** Player ID of the room host — renders a crown icon. */
  hostPlayerId: string | null;
  /** This device's player ID — name is rendered in accent colour. */
  deviceId: string | null;
  /** Per-player modifier slots, keyed by player ID. */
  modifiers?: Record<string, PlayerModifiers>;
  /**
   * If provided, the host can long-press any non-own row to kick that player.
   * Must also set `isHost={true}`.
   */
  onKick?: (playerId: string) => void;
  /** Disables the confirm kick button while a kick RPC is in flight. */
  kickLoading?: boolean;
  /** Enables the long-press kick gesture. Should match the actual host state. */
  isHost?: boolean;
  /**
   * Override the automatic column-count. When omitted, the component picks
   * 1 / 2 / 3 columns based on player count thresholds.
   */
  columns?: 1 | 2 | 3;
  /**
   * When `columns` > 1, the maximum number of rows that fit in a single
   * column. The list is then filled column-major: the first column is filled
   * to `rowsPerColumn` before any player spills into the next column (so a
   * 7-player roster with rowsPerColumn=6 renders as 6 + 1, not 4 + 3).
   * If omitted, the layout falls back to a balanced row-major grid.
   */
  rowsPerColumn?: number;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CrownIcon({ className }: { className?: string }) {
  return <Icon icon="mdi:crown" className={className} aria-hidden="true" />;
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <Icon icon="ic:round-cancel" className={className} aria-hidden="true" />
  );
}

// ─── PlayerItem ───────────────────────────────────────────────────────────────

interface PlayerItemProps {
  player: PlayerRow;
  isConnected: boolean;
  isHostPlayer: boolean;
  isOwnPlayer: boolean;
  modifiers?: PlayerModifiers;
  /** Whether this item should show the long-press kick affordance. */
  canKick: boolean;
  kickLoading: boolean;
  onKick: () => void;
  /** Compact mode — only applied at 3 columns to keep rows readable. */
  compact: boolean;
}

function PlayerItem({
  player,
  isConnected,
  isHostPlayer,
  isOwnPlayer,
  modifiers,
  canKick,
  kickLoading,
  onKick,
  compact,
}: PlayerItemProps) {
  const [showKick, setShowKick] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef({ x: 0, y: 0 });

  const startLongPress = useCallback(
    (e: React.PointerEvent) => {
      if (!canKick) return;
      pressOrigin.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => setShowKick(true), LONG_PRESS_MS);
    },
    [canKick],
  );

  const cancelLongPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cancel the long-press if the pointer moves enough (user is scrolling).
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const dx = e.clientX - pressOrigin.current.x;
      const dy = e.clientY - pressOrigin.current.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD) cancelLongPress();
    },
    [cancelLongPress],
  );

  // Dismiss the kick overlay on the next pointer-down anywhere outside.
  useEffect(() => {
    if (!showKick) return;
    const dismiss = () => setShowKick(false);
    document.addEventListener("pointerdown", dismiss, { once: true });
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [showKick]);

  const handleKickClick = useCallback(
    (e: React.MouseEvent) => {
      // Prevent the document "dismiss" listener from eating this event first.
      e.stopPropagation();
      setShowKick(false);
      onKick();
    },
    [onKick],
  );

  const isDisabled = modifiers?.disabled === true;

  return (
    <li
      data-disabled={isDisabled || undefined}
      className={[
        "relative flex items-center rounded-2xl shadow-sm ring-1 ring-inset transition-colors",
        compact ? "gap-1.5 px-2.5 py-2" : "gap-2.5 px-3 py-3",
        isOwnPlayer
          ? "bg-accent/[0.09] ring-accent/25"
          : "bg-bg-raised ring-border/50",
        isDisabled && "opacity-45 saturate-50 shadow-none",
        showKick && "ring-danger/50",
        canKick && "select-none",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerMove={handlePointerMove}
    >
      {/* ① Presence dot — green = connected (soft glow), grey = disconnected */}
      <span
        role="status"
        aria-label={isConnected ? "online" : "offline"}
        className={[
          "shrink-0 rounded-full",
          compact ? "h-1.5 w-1.5" : "h-2 w-2",
          isConnected
            ? "bg-success shadow-[0_0_8px_1px_rgba(34,197,94,0.5)]"
            : "bg-fg-subtle/60",
        ].join(" ")}
      />

      {/* ② Player name + host crown — accent colour for own player */}
      <span
        className={[
          "flex min-w-0 flex-1 items-center",
          compact ? "gap-1" : "gap-1.5",
        ].join(" ")}
      >
        <span
          className={[
            "truncate font-medium leading-none",
            compact ? "text-sm" : "text-base",
            isOwnPlayer ? "text-accent" : "text-fg",
            isDisabled && "line-through decoration-fg-subtle/70",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {player.display_name}
        </span>
        {/* ③ Host crown — sits right after the name */}
        {isHostPlayer && (
          <CrownIcon
            className={[
              "shrink-0 text-accent",
              compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5",
            ].join(" ")}
          />
        )}
      </span>

      {/* ── Right-side indicators ── */}
      <div
        className={[
          "flex shrink-0 items-center",
          compact ? "gap-1" : "gap-1.5",
        ].join(" ")}
      >
        {/* ④ First modifier — vote count or custom icon */}
        {modifiers?.firstModifier != null && (
          <span
            className={[
              "flex items-center text-fg-muted",
              compact ? "text-[10px] leading-none" : "text-base",
            ].join(" ")}
          >
            {modifiers.firstModifier}
          </span>
        )}

        {/* ⑤ Main modifier — phase-specific icon */}
        {modifiers?.mainModifier != null && (
          <span
            className={[
              "flex items-center text-fg-muted",
              compact ? "text-[10px] leading-none" : "text-base",
            ].join(" ")}
          >
            {modifiers.mainModifier}
          </span>
        )}

        {/* Long-press kick confirm button */}
        {showKick && (
          <button
            type="button"
            aria-label="Kick player"
            disabled={kickLoading}
            // Stop propagation so the document "dismiss" pointerdown listener
            // doesn't swallow this before the click fires.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleKickClick}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger/15 transition-transform active:scale-90 disabled:opacity-40"
          >
            <TrashIcon className="h-4 w-4 text-danger" />
          </button>
        )}
      </div>
    </li>
  );
}

// ─── PlayerList ───────────────────────────────────────────────────────────────

/**
 * Reusable player roster component used across in-game screens.
 *
 * Layout:
 * - 1 column → roomy rows (default).
 * - 2 columns → SAME row sizing as 1 column (font is NOT shrunk).
 * - 3 columns → compact sizing (smaller font / padding) so dense rosters fit.
 *
 * When the parent supplies `rowsPerColumn`, the list is filled column-major:
 * column 1 is filled to capacity before column 2 receives any player. This
 * keeps a 7-player roster as 6 + 1 instead of a balanced 4 + 3.
 *
 * Each row shows, left-to-right:
 *   [presence dot] [name]  ···  [host crown] [firstModifier] [mainModifier]
 *
 * The host can long-press any other player's row to reveal a kick button.
 * The long-press is cancelled automatically if the finger moves > 10 px
 * (so normal list scrolling is unaffected).
 *
 * @example
 * // Lobby: ready-state checkmarks
 * <PlayerList
 *   players={players}
 *   connectedIds={connectedIds}
 *   hostPlayerId={hostPlayerId}
 *   deviceId={deviceId}
 *   isHost={isHost}
 *   onKick={handleKick}
 *   kickLoading={kickLoading}
 *   modifiers={Object.fromEntries(
 *     players.map(p => [p.id, { mainModifier: p.is_ready ? <CheckIcon /> : null }])
 *   )}
 * />
 */
export function PlayerList({
  players,
  connectedIds,
  hostPlayerId,
  deviceId,
  modifiers,
  onKick,
  kickLoading = false,
  isHost = false,
  columns,
  rowsPerColumn,
}: PlayerListProps) {
  const autoCols: 1 | 2 | 3 =
    players.length > THREE_COL_THRESHOLD
      ? 3
      : players.length > TWO_COL_THRESHOLD
        ? 2
        : 1;
  const cols = columns ?? autoCols;
  // Only the 3-column layout shrinks the row to keep the roster legible at 1
  // and 2 columns (requirement: do not decrease font size at 2 columns).
  const compact = cols === 3;

  // For multi-column layouts, force column-major fill via an explicit
  // grid-template-rows. Column 1 fills to `rowsPerColumn` before column 2
  // receives anything. Without an explicit rowsPerColumn we fall back to a
  // balanced row-major grid (legacy behaviour for callers that don't measure).
  const useColumnMajor = cols > 1 && rowsPerColumn != null && rowsPerColumn > 0;
  const listStyle: React.CSSProperties | undefined = useColumnMajor
    ? {
        display: "grid",
        gridAutoFlow: "column",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rowsPerColumn}, auto)`,
      }
    : undefined;

  const listClassName = useColumnMajor
    ? cols === 3
      ? "gap-1"
      : "gap-1.5"
    : cols === 3
      ? "grid grid-cols-3 gap-1"
      : cols === 2
        ? "grid grid-cols-2 gap-1.5"
        : "flex flex-col gap-2";

  return (
    <ul className={listClassName} style={listStyle}>
      {players.map((p) => (
        <PlayerItem
          key={p.id}
          player={p}
          isConnected={connectedIds.has(p.id)}
          isHostPlayer={p.id === hostPlayerId}
          isOwnPlayer={p.id === deviceId}
          modifiers={modifiers?.[p.id]}
          canKick={isHost && p.id !== deviceId && !!onKick}
          kickLoading={kickLoading}
          onKick={() => onKick?.(p.id)}
          compact={compact}
        />
      ))}
    </ul>
  );
}
