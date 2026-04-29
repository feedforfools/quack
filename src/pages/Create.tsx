import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDeviceId, useDisplayName, DisplayNamePrompt } from "@/features/identity";
import { useCreateRoom } from "@/features/room";
import { Button } from "@/components";

/**
 * Create page — `/create`
 *
 * Flow:
 *  1. If the player has no display name, show the full-screen DisplayNamePrompt.
 *  2. Once a name is set, show a "Create Room" button.
 *  3. On submit: call useCreateRoom, then navigate to `/r/:code`.
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

  async function handleCreate() {
    if (!deviceId || !displayName) return;
    const code = await createRoom({ deviceId, displayName });
    if (code) {
      void navigate(`/r/${code}`);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <h1 className="text-2xl font-semibold text-fg">{t("create.title")}</h1>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {t("create.errorCreate")}
        </p>
      )}

      <Button
        className="mt-8 w-full"
        size="lg"
        loading={loading}
        onClick={() => void handleCreate()}
      >
        {t("create.cta")}
      </Button>
    </main>
  );
}
