import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@iconify/react";
import {
  useDeviceId,
  useDisplayName,
  DisplayNamePrompt,
} from "@/features/identity";
import { DEFAULT_ROOM_CONFIG, useCreateRoom } from "@/features/room";

/**
 * Create page — `/create`
 *
 * Flow:
 *  1. If the player has no display name, show the full-screen DisplayNamePrompt.
 *  2. Show the game-type selection list.
 *  3. Tapping an available game immediately creates a room and navigates to it.
 *     Coming-soon games are shown but not interactive.
 */

interface GameTypeEntry {
  id: "imposter" | "lupus" | "secret-hitler";
  icon: string;
  iconColor: string;
  iconBg: string;
  titleKey:
    | "create.imposterTitle"
    | "create.lupusTitle"
    | "create.secretHitlerTitle";
  descriptionKey:
    | "create.imposterDescription"
    | "create.lupusDescription"
    | "create.secretHitlerDescription";
  available: boolean;
}

const GAME_TYPES: GameTypeEntry[] = [
  {
    id: "imposter",
    icon: "mdi:incognito",
    iconColor: "text-accent",
    iconBg: "bg-accent/10",
    titleKey: "create.imposterTitle",
    descriptionKey: "create.imposterDescription",
    available: true,
  },
  {
    id: "lupus",
    icon: "mdi:paw",
    iconColor: "text-fg-muted",
    iconBg: "bg-fg/8",
    titleKey: "create.lupusTitle",
    descriptionKey: "create.lupusDescription",
    available: false,
  },
  {
    id: "secret-hitler",
    icon: "mdi:gavel",
    iconColor: "text-fg-muted",
    iconBg: "bg-fg/8",
    titleKey: "create.secretHitlerTitle",
    descriptionKey: "create.secretHitlerDescription",
    available: false,
  },
];

export default function Create() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const { displayName, hasDisplayName, setDisplayName } = useDisplayName();
  const { createRoom, loading, error } = useCreateRoom();

  if (!hasDisplayName) {
    return (
      <DisplayNamePrompt
        onConfirm={setDisplayName}
        initialName={displayName ?? ""}
      />
    );
  }

  async function handleSelectGame(gameId: GameTypeEntry["id"]) {
    if (gameId !== "imposter" || loading) return;
    if (!deviceId || !displayName) return;
    const code = await createRoom({
      deviceId,
      displayName,
      config: DEFAULT_ROOM_CONFIG,
    });
    if (code) {
      void navigate(`/r/${code}`);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      {/* Back to home */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={t("common.backToHome")}
        className="flex w-fit items-center gap-1 text-fg-muted transition-colors hover:text-fg active:opacity-60"
      >
        <Icon
          icon="lucide:chevron-left"
          className="h-5 w-5"
          aria-hidden="true"
        />
        <span className="text-sm">{t("common.backToHome")}</span>
      </button>

      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-2xl font-semibold text-fg">
          {t("create.selectTitle")}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          {t("create.selectSubtitle")}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {GAME_TYPES.map((game) => (
            <div
              key={game.id}
              className={[
                "flex items-center gap-3 rounded-xl border px-4 py-4 transition-colors",
                game.available
                  ? "cursor-pointer border-border bg-bg-raised hover:bg-bg-raised/80 active:opacity-70"
                  : "border-border/50 bg-bg-raised/40 opacity-60",
              ].join(" ")}
              role={game.available ? "button" : undefined}
              tabIndex={game.available ? 0 : undefined}
              aria-disabled={!game.available}
              onClick={() => {
                if (game.available) void handleSelectGame(game.id);
              }}
              onKeyDown={(e) => {
                if (game.available && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  void handleSelectGame(game.id);
                }
              }}
            >
              {/* Game icon */}
              <div
                className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${game.iconBg}`}
              >
                {loading && game.id === "imposter" ? (
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
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-bg/80">
                    <span className="text-center text-[8px] font-bold leading-tight tracking-widest text-fg-muted">
                      COMING
                      <br />
                      SOON
                    </span>
                  </div>
                )}
              </div>

              {/* Game info */}
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

              {/* Info button */}
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
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {t(error)}
          </p>
        )}
      </div>
    </main>
  );
}
