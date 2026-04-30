import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDeviceId, useDisplayName, DisplayNamePrompt } from "@/features/identity";
import { useJoinRoom, useRoom, useRoomPlayers, useReadyToggle, useLeaveRoom, useHostLeave } from "@/features/room";
import { Button, Modal, QRCode, useToast } from "@/components";
import { log } from "@/lib/log";

/** Minimum total players needed to start: imposter_count + 2 civilians. */
const MIN_CIVILIAN_BUFFER = 2;
/** Default if not yet set in room config. */
const DEFAULT_IMPOSTER_COUNT = 1;

/**
 * Room page — `/r/:code`
 *
 * Entry paths:
 *  A. Created via Create page → device is already in the players table.
 *  B. Deep-link / shared URL → gate on display name then join idempotently.
 *
 * Lobby features:
 *  - Room code display (monospace, large)
 *  - QR code for the room URL
 *  - Share-sheet (Web Share API) with copy-link fallback
 *  - Player roster with ready / connection indicators
 *  - Ready toggle per player (E2-T8)
 *  - Host Start button, enabled when all ready + enough players (E2-T8)
 *
 * TODO(E3-T4): Wire Start button to start_round RPC.
 * TODO(E3-T5): Conditional render for active round.
 */
export default function Room() {
  const { code } = useParams<{ code: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const { displayName, hasDisplayName, setDisplayName } = useDisplayName();
  const { joinRoom } = useJoinRoom();

  const [joined, setJoined] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const { roomId, hostPlayerId, isHost, roomConfig, loading: roomLoading, refetch: refetchRoom } = useRoom(deviceId, code);
  const { players, connectedIds, loading: playersLoading, roomEnded, broadcastRefetch } = useRoomPlayers(
    deviceId,
    roomId,
  );
  const { toggleReady, loading: readyLoading } = useReadyToggle(deviceId, roomId, broadcastRefetch);
  const { leaveRoom, loading: leaveLoading } = useLeaveRoom();
  const { handOver, endRoom, loading: hostLeaveLoading } = useHostLeave();
  const { toast } = useToast();

  // Host-leave modal state.
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [selectedSuccessor, setSelectedSuccessor] = useState<string | null>(null);

  // Derive imposter count from room config (defaults to 1 until E5-T1 settings).
  const cfgObj =
    typeof roomConfig === "object" && roomConfig !== null && !Array.isArray(roomConfig)
      ? (roomConfig as Record<string, unknown>)
      : null;
  const imposterCount =
    typeof cfgObj?.imposter_count === "number" ? cfgObj.imposter_count : DEFAULT_IMPOSTER_COUNT;
  const minPlayers = imposterCount + MIN_CIVILIAN_BUFFER;

  // Start validation — only non-host players need to be ready.
  const nonHostPlayers = players.filter((p) => p.id !== hostPlayerId);
  const allReady = nonHostPlayers.length > 0 && nonHostPlayers.every((p) => p.is_ready);
  const enoughPlayers = players.length >= minPlayers;
  const canStart = allReady && enoughPlayers;

  // Friendly reason why Start is disabled.
  const startDisabledReason = !enoughPlayers
    ? t("room.startDisabledTooFew", { count: minPlayers })
    : !allReady
      ? t("room.startDisabledNotAllReady")
      : undefined;

  // When the roster changes length, re-fetch room data to pick up host changes
  // (e.g., after a host handover the successor's isHost becomes true).
  const prevPlayerCountRef = useRef(players.length);
  useEffect(() => {
    if (players.length !== prevPlayerCountRef.current) {
      prevPlayerCountRef.current = players.length;
      void refetchRoom();
    }
  }, [players.length, refetchRoom]);

  // Join on mount (idempotent — host's row already exists, no-op upsert).
  useEffect(() => {
    if (!code || !deviceId || !hasDisplayName || joined) return;

    void joinRoom({ deviceId, displayName: displayName!, code }).then((result) => {
      if (result) {
        setJoined(true);
      } else {
        setJoinFailed(true);
      }
    });
  }, [code, deviceId, hasDisplayName, displayName, joinRoom, joined]);

  // Share / copy-link handler.
  const roomUrl = `${window.location.origin}/r/${code?.toUpperCase()}`;

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t("room.shareTitle"),
          text: t("room.shareText", { code: code?.toUpperCase() }),
          url: roomUrl,
        });
      } catch {
        // User dismissed share sheet — not an error.
      }
    } else {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code, roomUrl, t]);

  // TODO(E3-T4): Replace with start_round RPC call.
  const handleStart = useCallback(() => {
    log.debug("Room: Start pressed — round start RPC wired in E3-T4");
  }, []);

  // Host handover handler.
  const handleHandOver = useCallback(async () => {
    if (!roomId || !selectedSuccessor) return;
    const ok = await handOver({ deviceId, roomId, successorId: selectedSuccessor });
    setShowLeaveModal(false);
    if (ok) {
      toast({ title: t("room.hostHandedOver"), variant: "success" });
      void navigate("/");
    } else {
      toast({ title: t("room.hostLeaveError"), variant: "danger" });
    }
  }, [roomId, selectedSuccessor, handOver, deviceId, toast, t, navigate]);

  // Host end-room handler.
  const handleEndRoom = useCallback(async () => {
    if (!roomId) return;
    const ok = await endRoom({ deviceId, roomId });
    setShowLeaveModal(false);
    if (ok) {
      toast({ title: t("room.hostEndedRoom"), variant: "default" });
      void navigate("/");
    } else {
      toast({ title: t("room.hostLeaveError"), variant: "danger" });
    }
  }, [roomId, endRoom, deviceId, toast, t, navigate]);

  // Leave room handler — non-host only.
  const handleLeave = useCallback(async () => {
    if (!roomId) return;
    const ok = await leaveRoom({ deviceId, roomId });
    if (ok) {
      toast({ title: t("room.leftRoom"), variant: "default" });
      void navigate("/");
    } else {
      toast({ title: t("room.leaveError"), variant: "danger" });
    }
  }, [leaveRoom, deviceId, roomId, navigate, toast, t]);

  // Gate: display name required before joining.
  if (!hasDisplayName) {
    return (
      <DisplayNamePrompt onConfirm={setDisplayName} initialName={displayName ?? ""} />
    );
  }

  // Room ended by host while this device was in the lobby.
  if (roomEnded && !isHost) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
        <span className="text-6xl" aria-hidden="true">
          🦆
        </span>
        <h1 className="mt-6 text-center text-2xl font-semibold text-fg">
          {t("room.roomEndedTitle")}
        </h1>
        <p className="mt-3 text-center text-sm text-fg-muted">
          {t("room.roomEndedSubtitle")}
        </p>
        <div className="mt-8 flex w-full flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={() => void navigate("/create")}
            className="w-full"
          >
            {t("room.createNewRoom")}
          </Button>
          <button
            onClick={() => void navigate("/")}
            className="text-center text-sm text-fg-muted underline underline-offset-4"
          >
            {t("common.backToHome")}
          </button>
        </div>
      </main>
    );
  }

  // Room not found / expired — dedicated stale-room screen with Create CTA.
  if (joinFailed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
        {/* Duck emoji as a lightweight visual anchor — no external asset needed. */}
        <span className="text-6xl" aria-hidden="true">
          🦆
        </span>
        <h1 className="mt-6 text-center text-2xl font-semibold text-fg">
          {t("room.errorNotFound")}
        </h1>
        <p className="mt-3 text-center text-sm text-fg-muted">
          {t("room.errorNotFoundSubtitle")}
        </p>
        <div className="mt-8 flex w-full flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={() => void navigate("/create")}
            className="w-full"
          >
            {t("room.createNewRoom")}
          </Button>
          <button
            onClick={() => void navigate("/")}
            className="text-center text-sm text-fg-muted underline underline-offset-4"
          >
            {t("common.backToHome")}
          </button>
        </div>
      </main>
    );
  }

  const isLoading = !joined || roomLoading;

  // Own player row for ready state.
  const ownPlayer = players.find((p) => p.id === deviceId);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-fg">{t("room.title")}</h1>
        {!isLoading && (
          <span className="text-sm text-fg-muted">
            {t("room.playerCount", { count: players.length })}
          </span>
        )}
      </div>

      {/* Room code */}
      <p className="mt-4 font-mono text-4xl font-bold tracking-[0.2em] text-accent">
        {code?.toUpperCase()}
      </p>

      {/* QR + share */}
      {!isLoading && (
        <div className="mt-6 flex flex-col items-center gap-4">
          <QRCode value={roomUrl} size={192} label={t("room.shareLabel")} />
          <Button
            variant="ghost"
            size="md"
            onClick={() => void handleShare()}
            className="w-full"
          >
            {copied ? t("room.linkCopied") : t("room.copyLink")}
          </Button>
        </div>
      )}

      {/* Roster */}
      <section aria-label={t("room.shareLabel")} className="mt-8 flex-1">
        {playersLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-bg-raised" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-bg-raised px-4 py-3"
              >
                <span className="truncate font-medium text-fg">{p.display_name}</span>
                <div className="flex shrink-0 items-center gap-2 pl-2">
                  {p.id === deviceId && (
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                      {t("room.you")}
                    </span>
                  )}
                  {roomId && p.id === hostPlayerId && (
                    <span className="rounded-full bg-fg/10 px-2 py-0.5 text-xs text-fg-muted">
                      {t("room.host")}
                    </span>
                  )}
                  {/* Ready indicator — hidden for the host who has no ready button */}
                  {p.id !== hostPlayerId && (
                    <span
                      aria-label={p.is_ready ? t("room.readyCta") : t("room.notReadyCta")}
                      className={[
                        "h-2.5 w-2.5 rounded-full border-2",
                        p.is_ready
                          ? "border-green-400 bg-green-400"
                          : "border-fg-muted bg-transparent",
                      ].join(" ")}
                    />
                  )}
                  {/* Connection dot — derived from live Realtime presence */}
                  <span
                    aria-label={
                      connectedIds.has(p.id) ? t("room.connected") : t("room.disconnected")
                    }
                    className={[
                      "h-2 w-2 rounded-full",
                      connectedIds.has(p.id) ? "bg-green-400" : "bg-fg-subtle",
                    ].join(" ")}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bottom action area */}
      <div className="mt-6 space-y-3">
        {/* Non-host: Ready toggle */}
        {joined && !isHost && !roomLoading && (
          <Button
            variant={ownPlayer?.is_ready ? "ghost" : "primary"}
            size="lg"
            onClick={() => void toggleReady(ownPlayer?.is_ready ?? false)}
            disabled={readyLoading}
            className="w-full"
          >
            {ownPlayer?.is_ready ? t("room.notReadyCta") : t("room.readyCta")}
          </Button>
        )}

        {/* Host: Start button */}
        {joined && isHost && !roomLoading && (
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={handleStart}
              disabled={!canStart}
              aria-describedby={!canStart ? "start-hint" : undefined}
              className="w-full"
            >
              {t("room.startGame")}
            </Button>
            {!canStart && (
              <p id="start-hint" className="text-center text-sm text-fg-muted">
                {startDisabledReason}
              </p>
            )}
          </div>
        )}

        {/* Non-host: context message based on own ready state */}
        {joined && !isHost && !roomLoading && (
          <p className="text-center text-sm text-fg-muted">
            {ownPlayer?.is_ready ? t("room.waitingForHost") : t("room.waitingToReady")}
          </p>
        )}

        {/* Non-host: Leave Room */}
        {joined && !isHost && !roomLoading && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => void handleLeave()}
            disabled={leaveLoading}
            className="w-full text-danger"
          >
            {t("room.leaveCta")}
          </Button>
        )}

        {/* Host: Leave Room */}
        {joined && isHost && !roomLoading && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setSelectedSuccessor(null);
              setShowLeaveModal(true);
            }}
            disabled={hostLeaveLoading}
            className="w-full text-danger"
          >
            {t("room.hostLeaveCta")}
          </Button>
        )}
      </div>

      {/* Host leave modal */}
      <Modal
        open={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        title={t("room.hostLeaveTitle")}
        description={
          players.length <= 1
            ? t("room.hostLeaveAloneSubtitle")
            : t("room.hostLeaveSubtitle")
        }
        dismissible={!hostLeaveLoading}
      >
        {/* Successor picker — shown only when there are other players. */}
        {players.length > 1 && (
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-medium text-fg">
              {t("room.chooseSuccessor")}
            </legend>
            <ul className="space-y-2">
              {players
                .filter((p) => p.id !== deviceId)
                .map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-bg p-3 has-[:checked]:ring-2 has-[:checked]:ring-accent">
                      <input
                        type="radio"
                        name="successor"
                        value={p.id}
                        checked={selectedSuccessor === p.id}
                        onChange={() => setSelectedSuccessor(p.id)}
                        className="accent-accent"
                      />
                      <span className="font-medium text-fg">{p.display_name}</span>
                    </label>
                  </li>
                ))}
            </ul>
          </fieldset>
        )}

        <div className="flex flex-col gap-2">
          {players.length > 1 && (
            <Button
              variant="primary"
              size="md"
              onClick={() => void handleHandOver()}
              disabled={!selectedSuccessor || hostLeaveLoading}
              loading={hostLeaveLoading}
              className="w-full"
            >
              {t("room.handoverCta")}
            </Button>
          )}
          <Button
            variant="danger"
            size="md"
            onClick={() => void handleEndRoom()}
            disabled={hostLeaveLoading}
            loading={hostLeaveLoading}
            className="w-full"
          >
            {t("room.hostEndRoomCta")}
          </Button>
        </div>
      </Modal>
    </main>
  );
}

