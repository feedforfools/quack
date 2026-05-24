import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@iconify/react";
import {
  useDeviceId,
  useDisplayName,
  DisplayNamePrompt,
} from "@/features/identity";
import {
  DEFAULT_ROOM_CONFIG,
  GameList,
  type GameType,
  useCreateRoom,
} from "@/features/room";

/**
 * Create page — `/create`
 *
 * Flow:
 *  1. If the player has no display name, show the full-screen DisplayNamePrompt.
 *  2. Show the game-type selection list.
 *  3. Tapping an available game immediately creates a room and navigates to it.
 *     Coming-soon games are shown but not interactive.
 */

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

  async function handleSelectGame(gameId: GameType) {
    if (gameId !== "imposter" || loading) return;
    if (!deviceId || !displayName) return;
    const code = await createRoom({
      deviceId,
      displayName,
      config: { ...DEFAULT_ROOM_CONFIG, game_type: gameId },
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

        <div className="mt-6">
          <GameList
            onSelect={handleSelectGame}
            loadingId={loading ? "imposter" : undefined}
          />
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
