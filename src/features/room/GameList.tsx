import { useTranslation } from "react-i18next";
import { Icon } from "@iconify/react";
import { GAME_MODE_OPTIONS } from "./gameModes";
import type { GameType } from "./roomConfig";

export interface GameListProps {
  /** Called when the user selects an available game. */
  onSelect: (gameId: GameType) => void;
  /**
   * Show an accent ring on this game (picker/modal context).
   * If omitted, no selection indicator is rendered.
   */
  selectedId?: GameType;
  /**
   * Show a loading spinner over this game's icon (room-creation context).
   * Typically `loading ? "imposter" : undefined`.
   */
  loadingId?: GameType;
  /**
   * Prevent selection of all games — applied on top of per-game availability.
   * Useful when the picker is opened in a read-only context.
   */
  disabled?: boolean;
  /**
   * Visual variant:
   * - `"page"` — full-page list style (bordered cards on bg-bg-raised)
   * - `"modal"` — compact inline style (sunken surface, rounder corners)
   *
   * Defaults to `"page"`.
   */
  variant?: "page" | "modal";
}

/**
 * Renders the full list of game-mode options.
 * Used on the Create page and inside the GameSettingsModal game picker.
 */
export function GameList({
  onSelect,
  selectedId,
  loadingId,
  disabled = false,
  variant = "page",
}: GameListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      {GAME_MODE_OPTIONS.map((game) => {
        const isSelected = selectedId === game.id;
        const isLoading = loadingId === game.id;
        const isSelectable = game.available && !disabled;

        const iconRoundedCls =
          variant === "modal" ? "rounded-2xl" : "rounded-xl";

        const itemCls =
          variant === "modal"
            ? [
                "flex items-center gap-3 rounded-2xl bg-bg-sunken px-4 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                isSelectable
                  ? "cursor-pointer hover:bg-fg/10 active:opacity-70"
                  : "cursor-not-allowed opacity-60",
                isSelected ? "ring-2 ring-accent" : "",
              ].join(" ")
            : [
                "flex items-center gap-3 rounded-xl border px-4 py-4 transition-colors",
                isSelectable
                  ? "cursor-pointer border-border bg-bg-raised hover:bg-bg-raised/80 active:opacity-70"
                  : "border-border/50 bg-bg-raised/40 opacity-60",
              ].join(" ");

        return (
          <div
            key={game.id}
            role="button"
            tabIndex={isSelectable ? 0 : -1}
            aria-disabled={!isSelectable}
            aria-pressed={isSelected || undefined}
            className={itemCls}
            onClick={() => {
              if (isSelectable) onSelect(game.id);
            }}
            onKeyDown={(e) => {
              if (isSelectable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelect(game.id);
              }
            }}
          >
            {/* Icon tile */}
            <div
              className={`relative flex h-12 w-12 shrink-0 items-center justify-center ${iconRoundedCls} ${game.iconBg}`}
            >
              {isLoading ? (
                <span
                  className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"
                  aria-hidden="true"
                />
              ) : (
                <Icon
                  icon={game.icon}
                  className={`h-7 w-7 ${game.iconColor}`}
                  aria-hidden="true"
                />
              )}
              {!game.available && (
                <div
                  className={`absolute inset-0 flex items-center justify-center ${iconRoundedCls} bg-bg/80`}
                >
                  <span className="text-center text-[8px] font-bold leading-tight tracking-widest text-fg-muted">
                    COMING
                    <br />
                    SOON
                  </span>
                </div>
              )}
            </div>

            {/* Title + description */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={`text-sm font-semibold leading-snug ${game.available ? "text-fg" : "text-fg-muted"}`}
              >
                {t(game.titleKey)}
              </span>
              <p className="line-clamp-2 text-xs leading-relaxed text-fg-muted">
                {t(game.descriptionKey)}
              </p>
            </div>

            {/* Info button — stopPropagation prevents triggering the outer click */}
            <button
              type="button"
              aria-label={t("create.gameInfoLabel")}
              onClick={(e) => {
                e.stopPropagation();
                // Game info modal — coming in a later stage
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fg/8 text-fg-muted transition-colors hover:bg-fg/12 active:opacity-60"
            >
              <Icon
                icon="ph:info-bold"
                className="h-[17px] w-[17px]"
                aria-hidden="true"
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
