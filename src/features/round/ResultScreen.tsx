import { useTranslation } from "react-i18next";
import { Icon } from "@iconify/react";
import { Button, PlayerList, GameScaffold } from "@/components";
import type { PlayerModifiers } from "@/components";
import type { GameResult } from "./useGameResult";
import type { PlayerRow } from "@/features/room";

interface ResultScreenProps {
  /** Full game result returned by get_game_result RPC. */
  result: GameResult;
  /**
   * All players currently in the room — rendered as the role-reveal roster.
   * Spectators are excluded (they did not play this game).
   */
  players: PlayerRow[];
  /** Set of player IDs currently visible on the Realtime presence channel. */
  connectedIds?: Set<string>;
  /** Player ID of the room host — renders a crown icon. */
  hostPlayerId?: string | null;
  /** The calling device's UUID — own name renders in accent colour. */
  deviceId: string | null;
  /** Whether the current player is the host — shows End Game button. */
  isHost?: boolean;
  /** Called when the host taps End Game to return the room to lobby. */
  onEndGame?: () => void;
  /** Whether the end-game action is in-flight. */
  endGameLoading?: boolean;
}

/** Per-outcome presentation: banner colours, emoji, copy keys. */
const OUTCOME_PRESENTATION = {
  imposters_caught: {
    emoji: "🎉",
    bannerBg: "bg-success",
    bannerText: "text-success-ink",
    headingKey: "result.outcomeCaught",
    subtitleKey: "result.subtitleCaught",
  },
  imposters_win: {
    emoji: "🕵️",
    bannerBg: "bg-danger",
    bannerText: "text-danger-ink",
    headingKey: "result.outcomeWin",
    subtitleKey: "result.subtitleWin",
  },
  tie: {
    emoji: "🤝",
    bannerBg: "bg-accent",
    bannerText: "text-accent-ink",
    headingKey: "result.outcomeTie",
    subtitleKey: "result.subtitleTie",
  },
} as const;

/**
 * Post-vote result screen — in-game redesign (E5.5).
 *
 * Shares the GameScaffold anatomy with the lobby / Discussion / Voting
 * screens so the whole game flow reads as one app:
 *
 *   1. Outcome banner — full-width coloured strip (echoes the TimerStrip
 *      slot): green = imposters caught, red = imposters win, yellow = tie.
 *   2. Short outcome subtitle.
 *   3. Role-reveal roster — every player with their true role icon
 *      (duck = civilian, incognito = imposter) and a "Voted out" pill on
 *      whoever the room voted out.
 *   4. Secret word card.
 *   5. Imposters one-line summary (covers imposters who already left).
 *   6. Footer — host: End Game; everyone else: waiting hint.
 */
export function ResultScreen({
  result,
  players,
  connectedIds = new Set(),
  hostPlayerId = null,
  deviceId,
  isHost = false,
  onEndGame,
  endGameLoading = false,
}: ResultScreenProps) {
  const { t } = useTranslation();

  const { outcome, votedOutPlayerId, secretWord, imposters } = result;
  const view = OUTCOME_PRESENTATION[outcome];

  const activePlayers = players.filter((p) => !p.is_spectator);
  const imposterIds = new Set(imposters.map((imp) => imp.player_id));
  const imposterNames = imposters.map((imp) => imp.display_name).join(", ");

  // Role reveal per roster row: voted-out pill (slot A) + role icon (slot B).
  const modifiers: Record<string, PlayerModifiers> = Object.fromEntries(
    activePlayers.map((p) => [
      p.id,
      {
        firstModifier:
          p.id === votedOutPlayerId ? (
            <span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
              {t("result.votedOutLabel")}
            </span>
          ) : null,
        mainModifier: imposterIds.has(p.id) ? (
          <span role="img" aria-label={t("round.roleImposter")}>
            <Icon
              icon="mdi:incognito"
              className="h-4 w-4 text-danger"
              aria-hidden="true"
            />
          </span>
        ) : (
          <span role="img" aria-label={t("round.roleCivilian")}>
            <Icon
              icon="mdi:duck"
              className="h-4 w-4 text-success"
              aria-hidden="true"
            />
          </span>
        ),
      },
    ]),
  );

  return (
    <GameScaffold
      scrollList
      header={
        /* Outcome banner — fills the same slot the TimerStrip occupies
           in-game, so the phase change reads instantly. */
        <div
          className={`flex w-full items-center justify-center gap-3 px-4 ${view.bannerBg}`}
          style={{ height: "clamp(4.25rem, 12vh, 7rem)" }}
        >
          <span
            aria-hidden="true"
            style={{ fontSize: "clamp(1.9rem, 5vh, 3rem)" }}
          >
            {view.emoji}
          </span>
          <h1
            className={`font-black leading-none tracking-tight ${view.bannerText}`}
            style={{ fontSize: "clamp(1.5rem, 4.5vh, 2.5rem)" }}
            aria-live="polite"
          >
            {t(view.headingKey)}
          </h1>
        </div>
      }
      belowHeader={t(view.subtitleKey)}
      list={
        <PlayerList
          players={activePlayers}
          connectedIds={connectedIds}
          hostPlayerId={hostPlayerId}
          deviceId={deviceId}
          modifiers={modifiers}
        />
      }
      extra={
        /* Secret word card — same card idiom as the lobby's game card. */
        <div className="rounded-2xl bg-bg-raised px-3 py-3 shadow-sm ring-1 ring-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
              <Icon
                icon="lucide:key-round"
                className="h-6 w-6 text-accent"
                aria-hidden="true"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-subtle">
                {t("result.secretWordLabel")}
              </span>
              <span className="truncate text-lg font-bold leading-tight text-fg">
                {secretWord ?? "—"}
              </span>
            </div>
          </div>
        </div>
      }
      aboveFooter={
        /* Covers imposters who already left the room (not in the roster). */
        imposterNames
          ? t("result.impostersSummary", { names: imposterNames })
          : undefined
      }
      footer={
        isHost && onEndGame ? (
          <Button
            variant="primary"
            size="md"
            onClick={onEndGame}
            disabled={endGameLoading}
            loading={endGameLoading}
            className="w-full"
          >
            {t("result.endGameCta")}
          </Button>
        ) : (
          <p className="flex min-h-[44px] items-center justify-center text-center text-sm text-fg-muted">
            {t("result.waitingForHost")}
          </p>
        )
      }
      belowFooter={isHost ? t("result.endGameHint") : undefined}
    />
  );
}
