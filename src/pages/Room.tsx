import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Room page — `/r/:code`
 * Serves both the lobby and the active-round views for host and players.
 * Full implementation lands across E2-T6 (lobby) and E3-T5 (round reveal).
 * TODO(E2-T6): Replace with live lobby roster, QR code, share-sheet.
 * TODO(E3-T5): Conditional render for active round (reveal card, neutral screen).
 */
export default function Room() {
  const { code } = useParams<{ code: string }>();
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <h1 className="text-2xl font-semibold text-fg">{t("room.title")}</h1>
      <p className="mt-3 font-mono text-lg tracking-widest text-accent">
        {code?.toUpperCase()}
      </p>
      <p className="mt-3 text-fg-muted">{t("common.comingSoon")}</p>
    </main>
  );
}
