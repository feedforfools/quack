import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@iconify/react";
import { Button, Modal, PlayerList, GameScaffold } from "@/components";
import type { PlayerModifiers } from "@/components";
import { EliminatedIndicator } from "./PlayerIndicators";
import type { RoundResult } from "./useRoundResults";
import type { PlayerRow } from "@/features/room";

interface RoundResultScreenProps {
  /** The just-resolved round (latest entry from useRoundResults). */
  result: RoundResult;
  /** Round cap from the game config — renders "Round N of M". */
  maxRounds: number;
  /** All players currently in the room. Spectators are filtered out. */
  players: PlayerRow[];
  /** Set of player IDs currently visible on the Realtime presence channel. */
  connectedIds?: Set<string>;
  /** Player ID of the room host — renders a crown icon. */
  hostPlayerId?: string | null;
  /** This device's player ID. */
  deviceId: string | null;
  /** Players eliminated in this or any earlier round (greyed out). */
  eliminatedIds: Set<string>;
  /** When true, every roster row shows the votes it received this round. */
  showVoteCounts: boolean;
  /** Configured imposter count — drives the "imposters remaining" card. */
  imposterCount: number;
  /** How many imposters have been eliminated so far (all rounds). */
  impostersEliminated: number;
  /** Whether the current player is the host. */
  isHost?: boolean;
  /** Host: open the next round (advance_round RPC). */
  onNextRound?: () => void;
  nextRoundLoading?: boolean;
  /** Host: kill the game back to the lobby. */
  onEndRound?: () => void;
  endRoundLoading?: boolean;
}

/**
 * Intermediate round-result screen (multi-round mode, E6).
 *
 * Shown between two vote rounds, when the server has resolved the current
 * round (`vote_state = 'resolved'`) but the game has no final outcome yet.
 *
 *   1. Banner — who was voted out (role revealed) or "nobody" on a tie.
 *   2. Roster — eliminated players disabled, per-player vote counts of this
 *      round as chips (when `show_vote_counts` is on).
 *   3. "Imposters remaining" card — keeps the tension visible.
 *   4. Footer — host: kill game + Next round; everyone else waits.
 */
export function RoundResultScreen({
  result,
  maxRounds,
  players,
  connectedIds = new Set(),
  hostPlayerId = null,
  deviceId,
  eliminatedIds,
  showVoteCounts,
  imposterCount,
  impostersEliminated,
  isHost = false,
  onNextRound,
  nextRoundLoading = false,
  onEndRound,
  endRoundLoading = false,
}: RoundResultScreenProps) {
  const { t } = useTranslation();
  const [showKillConfirm, setShowKillConfirm] = useState(false);

  const activePlayers = players.filter((p) => !p.is_spectator);
  const tallyMap = new Map(
    result.tally.map((e) => [e.targetPlayerId, e.voteCount]),
  );

  const eliminatedNow = result.eliminatedPlayerId;
  const eliminatedWasImposter = result.eliminatedRole === "imposter";
  // Prefer the roster name (live), falling back to the RPC snapshot in case
  // the eliminated player already left the room.
  const eliminatedName =
    activePlayers.find((p) => p.id === eliminatedNow)?.display_name ??
    result.eliminatedPlayerName ??
    "";

  const impostersRemaining = Math.max(0, imposterCount - impostersEliminated);

  // Roster modifiers: vote-count chip (slot A) + elimination markers (slot B).
  const modifiers: Record<string, PlayerModifiers> = Object.fromEntries(
    activePlayers.map((p) => {
      const count = tallyMap.get(p.id);
      const isOut = eliminatedIds.has(p.id);
      const outThisRound = p.id === eliminatedNow;
      return [
        p.id,
        {
          firstModifier:
            showVoteCounts && count !== undefined && count > 0 ? (
              <span
                className="rounded-full bg-fg/10 px-2 py-0.5 text-xs tabular-nums text-fg-muted"
                aria-label={t("roundResult.votesReceived", { count })}
              >
                {count}
              </span>
            ) : null,
          mainModifier: outThisRound ? (
            /* Role reveal for the freshly eliminated player. */
            <span
              role="img"
              aria-label={
                eliminatedWasImposter
                  ? t("round.roleImposter")
                  : t("round.roleCivilian")
              }
            >
              <Icon
                icon={eliminatedWasImposter ? "mdi:incognito" : "mdi:duck"}
                className={`h-4 w-4 ${eliminatedWasImposter ? "text-danger" : "text-success"}`}
                aria-hidden="true"
              />
            </span>
          ) : isOut ? (
            <EliminatedIndicator label={t("roundResult.eliminatedLabel")} />
          ) : null,
          disabled: isOut,
        },
      ];
    }),
  );

  return (
    <>
      <GameScaffold
        scrollList
        header={
          /* Round banner — same slot the TimerStrip / outcome banner uses. */
          <div
            className="flex w-full items-center justify-center gap-3 bg-accent px-4"
            style={{ height: "clamp(4.25rem, 12vh, 7rem)" }}
          >
            <span
              aria-hidden="true"
              style={{ fontSize: "clamp(1.9rem, 5vh, 3rem)" }}
            >
              {eliminatedNow ? (eliminatedWasImposter ? "🎯" : "😱") : "🤝"}
            </span>
            <h1
              className="font-black leading-none tracking-tight text-accent-ink"
              style={{ fontSize: "clamp(1.5rem, 4.5vh, 2.5rem)" }}
              aria-live="polite"
            >
              {t("roundResult.title", { round: result.round, max: maxRounds })}
            </h1>
          </div>
        }
        belowHeader={
          eliminatedNow
            ? t("roundResult.eliminatedSubtitle", {
                name: eliminatedName,
                role: eliminatedWasImposter
                  ? t("round.roleImposter")
                  : t("round.roleCivilian"),
              })
            : t("roundResult.tieSubtitle")
        }
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
          /* Imposters-remaining card — same card idiom as the lobby. */
          <div className="rounded-2xl bg-bg-raised px-3 py-3 shadow-sm ring-1 ring-border/60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/15">
                <Icon
                  icon="mdi:incognito"
                  className="h-6 w-6 text-danger"
                  aria-hidden="true"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-subtle">
                  {t("roundResult.impostersRemainingLabel")}
                </span>
                <span className="truncate text-sm font-bold leading-none text-fg">
                  {t("roundResult.impostersRemainingValue", {
                    count: impostersRemaining,
                    total: imposterCount,
                  })}
                </span>
              </div>
            </div>
          </div>
        }
        footer={
          isHost && onNextRound ? (
            <div className="flex items-center gap-3">
              {onEndRound && (
                <Button
                  variant="danger"
                  size="md"
                  aria-label={t("round.killGameCta")}
                  disabled={endRoundLoading}
                  onClick={() => setShowKillConfirm(true)}
                  style={{ aspectRatio: "1 / 1", padding: 0, minWidth: "44px" }}
                >
                  <Icon
                    icon="lucide:x"
                    className="h-5 w-5"
                    aria-hidden="true"
                  />
                </Button>
              )}
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                onClick={onNextRound}
                disabled={nextRoundLoading}
                loading={nextRoundLoading}
              >
                {t("roundResult.nextRoundCta")}
              </Button>
            </div>
          ) : (
            <p className="flex min-h-[44px] items-center justify-center text-center text-sm text-fg-muted">
              {t("roundResult.waitingForHost")}
            </p>
          )
        }
        belowFooter={
          isHost && onNextRound ? t("roundResult.nextRoundHint") : undefined
        }
      />

      {/* ── Host kill-game confirmation ─────────────────────────────────── */}
      {isHost && onEndRound && (
        <Modal
          open={showKillConfirm}
          onClose={() => setShowKillConfirm(false)}
          title={t("round.killGameConfirmTitle")}
          description={t("round.killGameConfirmBody")}
        >
          <div className="mt-2 flex gap-3">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setShowKillConfirm(false)}
              className="flex-1"
            >
              {t("round.cancelCta")}
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={onEndRound}
              disabled={endRoundLoading}
              className="flex-1"
            >
              {endRoundLoading ? "…" : t("round.killGameConfirmCta")}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
