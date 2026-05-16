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
/** Switch to two-column layout when player count exceeds this. */
const TWO_COL_THRESHOLD = 10;

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
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CrownIcon({ className }: { className?: string }) {
  return <Icon icon="lucide:crown" className={className} aria-hidden="true" />;
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <Icon icon="lucide:trash-2" className={className} aria-hidden="true" />
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
  /** Compact mode used when rendering two columns (> 10 players). */
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

  return (
    <li
      className={[
        "relative flex items-center rounded-xl bg-bg-raised transition-colors",
        compact ? "gap-1.5 px-2.5 py-2" : "gap-2.5 px-3 py-3",
        showKick && "ring-1 ring-inset ring-danger/50",
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
      {/* ① Presence dot — green = connected, grey = disconnected */}
      <span
        role="status"
        aria-label={isConnected ? "online" : "offline"}
        className={[
          "shrink-0 rounded-full",
          compact ? "h-1.5 w-1.5" : "h-2 w-2",
          isConnected ? "bg-success" : "bg-fg-subtle",
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
            compact ? "text-sm" : "text-md",
            isOwnPlayer ? "text-accent" : "text-fg",
          ].join(" ")}
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
              compact ? "text-[10px] leading-none" : "text-md",
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
              compact ? "text-[10px] leading-none" : "text-md",
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
            className={[
              "flex items-center justify-center rounded-full bg-danger text-danger-ink",
              "transition-transform active:scale-95 disabled:opacity-40",
              compact ? "h-5 w-5" : "h-6 w-6",
            ].join(" ")}
          >
            <TrashIcon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
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
 * - 1–10 players → single column
 * - 11–20 players → two columns (compact sizing)
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
}: PlayerListProps) {
  const twoCol = players.length > TWO_COL_THRESHOLD;

  return (
    <ul className={twoCol ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-2"}>
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
          compact={twoCol}
        />
      ))}
    </ul>
  );
}
