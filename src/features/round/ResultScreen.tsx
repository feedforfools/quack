import { useTranslation } from "react-i18next";
import { Button } from "@/components";
import type { GameResult } from "./useGameResult";

interface ResultScreenProps {
  /** Full game result returned by get_game_result RPC. */
  result: GameResult;
  /** Whether the current player is the host — shows End Game button. */
  isHost?: boolean;
  /** Called when the host taps End Game to return the room to lobby. */
  onEndGame?: () => void;
  /** Whether the end-game action is in-flight. */
  endGameLoading?: boolean;
}

/**
 * Post-vote result screen (E5-T9).
 *
 * Reveals to every player:
 *  1. The outcome (imposters caught / imposters win / tie).
 *  2. Who was voted out (or "Nobody" on a tie).
 *  3. The secret word.
 *  4. All imposters' names.
 *  5. "End Game" button (host only) that returns the room to lobby.
 */
export function ResultScreen({
  result,
  isHost = false,
  onEndGame,
  endGameLoading = false,
}: ResultScreenProps) {
  const { t } = useTranslation();

  const { outcome, votedOutPlayerName, secretWord, imposters } = result;

  // Outcome-specific display values.
  const outcomeEmoji =
    outcome === "imposters_caught"
      ? "🎉"
      : outcome === "imposters_win"
        ? "🕵️"
        : "🤝";

  const outcomeKey =
    outcome === "imposters_caught"
      ? "result.outcomeCaught"
      : outcome === "imposters_win"
        ? "result.outcomeWin"
        : "result.outcomeTie";

  const outcomeColour =
    outcome === "imposters_caught"
      ? "text-success"
      : outcome === "imposters_win"
        ? "text-danger"
        : "text-accent";

  const votedOutLabel = votedOutPlayerName ?? t("result.nobody");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-10">
      {/* Outcome banner */}
      <span className="text-6xl" aria-hidden="true">
        {outcomeEmoji}
      </span>
      <h1
        className={`mt-4 text-center text-3xl font-bold ${outcomeColour}`}
        aria-live="polite"
      >
        {t(outcomeKey)}
      </h1>

      {/* Voted-out player */}
      <section className="mt-8 w-full rounded-2xl bg-bg-raised px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          {t("result.votedOutLabel")}
        </p>
        <p className="mt-1 text-xl font-semibold text-fg">{votedOutLabel}</p>
      </section>

      {/* Secret word */}
      <section className="mt-4 w-full rounded-2xl bg-bg-raised px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          {t("result.secretWordLabel")}
        </p>
        <p className="mt-1 text-xl font-semibold text-success">
          {secretWord ?? "—"}
        </p>
      </section>

      {/* All imposters revealed */}
      <section className="mt-4 w-full rounded-2xl bg-bg-raised px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          {t("result.impostersLabel")}
        </p>
        {imposters.length === 0 ? (
          <p className="mt-1 text-sm text-fg-muted">—</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {imposters.map((imp) => (
              <li
                key={imp.player_id}
                className="flex items-center gap-2 text-sm font-medium text-fg"
              >
                <span className="text-danger" aria-hidden="true">
                  🕵️
                </span>
                {imp.display_name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* End Game — host-only, returns room to lobby */}
      {isHost && onEndGame && (
        <Button
          variant="primary"
          size="lg"
          onClick={onEndGame}
          disabled={endGameLoading}
          className="mt-10 w-full max-w-xs"
        >
          {endGameLoading ? "…" : t("result.endGameCta")}
        </Button>
      )}

      {/* Non-host hint */}
      {!isHost && (
        <p className="mt-10 text-center text-sm text-fg-muted">
          {t("result.waitingForHost")}
        </p>
      )}
    </main>
  );
}
