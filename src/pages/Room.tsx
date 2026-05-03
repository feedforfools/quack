import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useDeviceId,
  useDisplayName,
  DisplayNamePrompt,
} from "@/features/identity";
import {
  useJoinRoom,
  useRoom,
  useRoomPlayers,
  useReadyToggle,
  useLeaveRoom,
  useHostLeave,
  useStartGame,
  useEndGame,
  useKickPlayer,
  parseRoomConfig,
  useUpdateRoomConfig,
  SettingsPanel,
} from "@/features/room";
import {
  useRoleAssignment,
  DiscussionScreen,
  useMarkRoleSeen,
  useStartGameTimer,
  useAllPlayersSeen,
  useVoteState,
  useRequestVote,
  useCastVote,
  useRetractVote,
  useResolveVote,
  useGameResult,
  ResultScreen,
} from "@/features/round";
import { Button, Modal, QRCode, useToast } from "@/components";

/** Minimum total players needed to start: imposter_count + 2 civilians. */
const MIN_CIVILIAN_BUFFER = 2;

/** Fixed top banner shown when the Realtime channel is not SUBSCRIBED (E4-T6). */
function ReconnectingBanner({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-yellow-400/90 px-4 py-2 text-sm font-medium text-yellow-950 backdrop-blur-sm"
    >
      <span
        className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden="true"
      />
      {label}
    </div>
  );
}

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

  const {
    roomId,
    hostPlayerId,
    isHost,
    roomConfig,
    roomState,
    loading: roomLoading,
    refetch: refetchRoom,
  } = useRoom(deviceId, code);
  const {
    assignment,
    loading: assignmentLoading,
    refetch: refetchAssignment,
  } = useRoleAssignment(deviceId, roomId, roomState);
  const { allSeen: allPlayersSeen, refetch: refetchAllSeen } =
    useAllPlayersSeen(isHost ? deviceId : null, assignment?.gameId ?? null);
  const { toast } = useToast();
  // Ref so the useRoomPlayers option callback can call refetchVoteState
  // without creating a circular hook dependency (voteState is added below).
  const refetchVoteStateRef = useRef<(() => void) | null>(null);
  const {
    players,
    connectedIds,
    loading: playersLoading,
    roomEnded,
    channelStatus,
    refetch: refetchPlayers,
    broadcastRefetch,
    broadcastRoundEnd,
    broadcastRoundStart,
    broadcastTimerStart,
    broadcastPeekUpdate,
    broadcastVoteStateChanged,
  } = useRoomPlayers(deviceId, roomId, {
    onRoundEnd: refetchRoom,
    onRoundStart: refetchRoom,
    onTimerStart: refetchAssignment,
    onPeekUpdate: isHost ? refetchAllSeen : undefined,
    onVoteStateChanged: () => refetchVoteStateRef.current?.(),
    onKicked: () => {
      navigate("/");
      toast({ title: t("room.kickedToast"), variant: "danger" });
    },
  });
  const { toggleReady, loading: readyLoading } = useReadyToggle(
    deviceId,
    roomId,
    broadcastRefetch,
  );
  const { leaveRoom, loading: leaveLoading } = useLeaveRoom();
  const { handOver, endRoom, loading: hostLeaveLoading } = useHostLeave();
  const {
    startGame,
    loading: startLoading,
    error: startError,
  } = useStartGame();
  const { endGame, loading: endRoundLoading } = useEndGame();
  const { kickPlayer, loading: kickLoading } = useKickPlayer();
  const { markRoleSeen } = useMarkRoleSeen();
  const { startTimer, loading: startTimerLoading } = useStartGameTimer();
  // Parse room config with full defaults via parseRoomConfig (E5-T1).
  // Memoized so the reference is stable across renders — SettingsPanel's
  // useEffect([config]) only fires when roomConfig actually changes from the DB,
  // not on every re-render caused by saving-state toggles in useUpdateRoomConfig.
  const parsedConfig = useMemo(() => parseRoomConfig(roomConfig), [roomConfig]);
  const imposterCount = parsedConfig.imposter_count;
  const minPlayers = imposterCount + MIN_CIVILIAN_BUFFER;

  // Voting state (E5-T8) — only fetched during an active game.
  const { voteState, refetch: refetchVoteState } = useVoteState(
    deviceId,
    roomState === "round_active" ? (assignment?.gameId ?? null) : null,
    parsedConfig.live_vote_tally,
  );
  // Wire the ref so useRoomPlayers.onVoteStateChanged can call refetchVoteState.
  useEffect(() => {
    refetchVoteStateRef.current = refetchVoteState;
  }, [refetchVoteState]);

  const { requestVote, loading: requestVoteLoading } = useRequestVote();
  const { castVote, loading: castVoteLoading } = useCastVote();
  const { retractVote, loading: retractVoteLoading } = useRetractVote();
  const { resolveVote } = useResolveVote();

  // Fetch full game result once vote is resolved (E5-T9).
  const isResolved = voteState?.state === "resolved";
  const { result: gameResult, loading: resultLoading } = useGameResult(
    isResolved ? deviceId : null,
    isResolved ? (assignment?.gameId ?? null) : null,
  );

  const { updateConfig, saving: configSaving } = useUpdateRoomConfig(
    deviceId,
    roomId,
  );
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [selectedSuccessor, setSelectedSuccessor] = useState<string | null>(
    null,
  );

  // Start validation — only non-host, non-spectator players need to be ready.
  const nonHostPlayers = players.filter((p) => p.id !== hostPlayerId);
  const activePlayers = players.filter((p) => !p.is_spectator);
  const allReady =
    nonHostPlayers.length > 0 &&
    nonHostPlayers.filter((p) => !p.is_spectator).every((p) => p.is_ready);
  const enoughPlayers = activePlayers.length >= minPlayers;
  const canStart = allReady && enoughPlayers;

  // True while the Realtime channel is not SUBSCRIBED — drives the reconnecting banner (E4-T6).
  const isReconnecting =
    channelStatus !== null && channelStatus !== "SUBSCRIBED";

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

    void joinRoom({ deviceId, displayName: displayName!, code }).then(
      (result) => {
        if (result) {
          setJoined(true);
        } else {
          setJoinFailed(true);
        }
      },
    );
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

  // Derive language + categories from parsed room config (E5-T1).
  const configLanguage = parsedConfig.language;
  const configCategories = parsedConfig.categories;

  // Start Game handler — calls start_round RPC then re-fetches room state.
  const handleStart = useCallback(async () => {
    if (!roomId || !deviceId) return;
    const ok = await startGame({
      deviceId,
      roomId,
      language: configLanguage,
      categories: configCategories,
      imposterCount: parsedConfig.imposter_count,
      hintCount: parsedConfig.imposter_hint_count,
    });
    if (ok) {
      void refetchRoom();
      // Tell other connected clients to refetch their room state so they
      // transition to the active-round screen immediately (E3-T10).
      void broadcastRoundStart();
    } else {
      toast({
        title: t(startError ?? "room.startErrorGeneric"),
        variant: "danger",
      });
    }
  }, [
    roomId,
    deviceId,
    startGame,
    configLanguage,
    configCategories,
    refetchRoom,
    broadcastRoundStart,
    toast,
    t,
    startError,
  ]);

  // Kick player handler (host only).
  const handleKick = useCallback(
    async (playerId: string) => {
      if (!roomId || !deviceId) return;
      await kickPlayer({ deviceId, roomId, playerId });
    },
    [kickPlayer, deviceId, roomId],
  );

  // Host handover handler.
  const handleHandOver = useCallback(async () => {
    if (!roomId || !selectedSuccessor) return;
    const ok = await handOver({
      deviceId,
      roomId,
      successorId: selectedSuccessor,
    });
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

  // Host end-round handler — returns the room to lobby state.
  const handleEndRound = useCallback(async () => {
    if (!roomId || !deviceId) return;
    const ok = await endGame({ deviceId, roomId });
    if (ok) {
      void broadcastRoundEnd();
      void refetchPlayers();
      void refetchRoom();
      toast({ title: t("round.gameEndedToast"), variant: "success" });
    } else {
      toast({ title: t("round.endGameError"), variant: "danger" });
    }
  }, [
    roomId,
    deviceId,
    endGame,
    broadcastRoundEnd,
    refetchPlayers,
    refetchRoom,
    toast,
    t,
  ]);

  const handleFirstPeek = useCallback(() => {
    if (!deviceId || !assignment) return;
    void markRoleSeen({ deviceId, gameId: assignment.gameId }).then(() => {
      // Re-check all_players_seen so the host's Start Timer button unlocks.
      if (isHost) refetchAllSeen();
      // Notify the host's screen that another player peeked.
      void broadcastPeekUpdate();
    });
  }, [
    deviceId,
    assignment,
    markRoleSeen,
    isHost,
    refetchAllSeen,
    broadcastPeekUpdate,
  ]);

  const handleStartTimer = useCallback(async (): Promise<boolean> => {
    if (!deviceId || !roomId) return false;
    const result = await startTimer({ deviceId, roomId });
    if (result) {
      refetchAssignment();
      void broadcastTimerStart();
      return true;
    }
    toast({
      title: t("round.startTimerError", "Couldn't start the timer."),
      variant: "danger",
    });
    return false;
  }, [
    deviceId,
    roomId,
    startTimer,
    refetchAssignment,
    broadcastTimerStart,
    toast,
    t,
  ]);

  // Vote action handlers — broadcast vote_state_changed after each RPC
  // so all connected clients refetch their vote state.
  const handleRequestVote = useCallback(
    async (params: { deviceId: string; gameId: string }): Promise<boolean> => {
      const ok = await requestVote(params);
      if (ok) void broadcastVoteStateChanged();
      else toast({ title: t("vote.requestError"), variant: "danger" });
      return ok;
    },
    [requestVote, broadcastVoteStateChanged, toast, t],
  );

  const handleCastVote = useCallback(
    async (params: {
      deviceId: string;
      gameId: string;
      targetPlayerId: string;
    }): Promise<boolean> => {
      const ok = await castVote(params);
      if (ok) void broadcastVoteStateChanged();
      // Typed errors are surfaced via useCastVote.error; swallow here.
      return ok;
    },
    [castVote, broadcastVoteStateChanged],
  );

  const handleRetractVote = useCallback(
    async (params: { deviceId: string; gameId: string }): Promise<boolean> => {
      const ok = await retractVote(params);
      if (ok) void broadcastVoteStateChanged();
      else toast({ title: t("vote.retractError"), variant: "danger" });
      return ok;
    },
    [retractVote, broadcastVoteStateChanged, toast, t],
  );

  // Called when the voting timer expires — triggers resolution and broadcasts
  // so all clients transition to the result screen (E5-T9).
  const handleVoteTimerComplete = useCallback(() => {
    if (!deviceId || !assignment) return;
    void resolveVote({ deviceId, gameId: assignment.gameId }).then((ok) => {
      if (ok) void broadcastVoteStateChanged();
    });
  }, [deviceId, assignment, resolveVote, broadcastVoteStateChanged]);

  // Compute vote threshold to display in VotingPanel.
  const activePlayerCount = players.filter((p) => !p.is_spectator).length;
  const voteThreshold = Math.ceil(
    activePlayerCount * parsedConfig.vote_threshold_fraction,
  );

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
      <DisplayNamePrompt
        onConfirm={setDisplayName}
        initialName={displayName ?? ""}
      />
    );
  }

  // Round active — reveal flow.
  // Gate on `roomId` (server-confirmed membership, not the local `joined` flag)
  // so a reload mid-round shows the correct screen immediately without waiting
  // for the idempotent join re-upsert to complete (E4-T1).
  if (roomState === "round_active" && roomId !== null) {
    // Spectators who joined mid-game see a neutral waiting screen (E4-T3).
    const ownPlayer = players.find((p) => p.id === deviceId);
    if (ownPlayer?.is_spectator) {
      return (
        <>
          {isReconnecting && (
            <ReconnectingBanner label={t("room.reconnecting")} />
          )}
          <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
            <span className="text-6xl" aria-hidden="true">
              🦆
            </span>
            <h1 className="mt-6 text-center text-2xl font-semibold text-fg">
              {t("room.spectatorTitle")}
            </h1>
            <p className="mt-3 text-center text-sm text-fg-muted">
              {t("room.spectatorSubtitle")}
            </p>
            <p className="mt-6 animate-pulse text-center text-xs text-fg-subtle">
              {t("room.spectatorWaiting")}
            </p>
          </main>
        </>
      );
    }

    // Spinner while the role assignment is being fetched.
    if (assignmentLoading || !assignment) {
      return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
          <div
            className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent"
            role="status"
            aria-label={t("round.loading")}
          />
        </main>
      );
    }
    // Result screen — shown when voting is resolved (E5-T9).
    if (isResolved) {
      // Show a spinner while the result is still being fetched.
      if (resultLoading || !gameResult) {
        return (
          <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
            <div
              className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent"
              role="status"
              aria-label={t("round.loading")}
            />
          </main>
        );
      }
      return (
        <>
          {isReconnecting && (
            <ReconnectingBanner label={t("room.reconnecting")} />
          )}
          <ResultScreen
            result={gameResult}
            isHost={isHost}
            onEndGame={isHost ? handleEndRound : undefined}
            endGameLoading={endRoundLoading}
          />
        </>
      );
    }

    // Merged discussion + reveal screen (E3-T6).
    return (
      <>
        {isReconnecting && (
          <ReconnectingBanner label={t("room.reconnecting")} />
        )}
        <DiscussionScreen
          assignment={assignment}
          roomCode={code}
          players={players}
          deviceId={deviceId}
          isHost={isHost}
          onEndRound={isHost ? handleEndRound : undefined}
          endRoundLoading={endRoundLoading}
          onFirstPeek={handleFirstPeek}
          onStartTimer={isHost ? handleStartTimer : undefined}
          startTimerLoading={startTimerLoading}
          allPlayersSeen={allPlayersSeen}
          voteState={voteState}
          voteThreshold={voteThreshold}
          onRequestVote={handleRequestVote}
          requestVoteLoading={requestVoteLoading}
          onCastVote={handleCastVote}
          castVoteLoading={castVoteLoading}
          onRetractVote={handleRetractVote}
          retractVoteLoading={retractVoteLoading}
          onVoteTimerComplete={handleVoteTimerComplete}
        />
      </>
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
      {/* Reconnecting banner — shown when the Realtime channel is not SUBSCRIBED (E4-T6). */}
      {isReconnecting && <ReconnectingBanner label={t("room.reconnecting")} />}
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

      {/* Host settings panel — only in lobby, only for host (E5-T1) */}
      {isHost && !isLoading && (
        <SettingsPanel
          config={parsedConfig}
          onSave={updateConfig}
          saving={configSaving}
          disabled={roomState !== "lobby"}
        />
      )}

      {/* Roster */}
      <section aria-label={t("room.shareLabel")} className="mt-8 flex-1">
        {playersLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl bg-bg-raised"
              />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-bg-raised px-4 py-3"
              >
                <span className="truncate font-medium text-fg">
                  {p.display_name}
                </span>
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
                  {/* Spectator badge — shown instead of ready/connection dots */}
                  {p.is_spectator ? (
                    <span className="rounded-full bg-fg/10 px-2 py-0.5 text-xs text-fg-muted">
                      {t("room.spectatorBadge")}
                    </span>
                  ) : (
                    <>
                      {/* Ready indicator — hidden for the host who has no ready button */}
                      {p.id !== hostPlayerId && (
                        <span
                          aria-label={
                            p.is_ready
                              ? t("room.readyCta")
                              : t("room.notReadyCta")
                          }
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
                          connectedIds.has(p.id)
                            ? t("room.connected")
                            : t("room.disconnected")
                        }
                        className={[
                          "h-2 w-2 rounded-full",
                          connectedIds.has(p.id)
                            ? "bg-green-400"
                            : "bg-fg-subtle",
                        ].join(" ")}
                      />
                    </>
                  )}
                  {/* Kick button — host only, not for self, only in lobby */}
                  {isHost && p.id !== deviceId && roomState === "lobby" && (
                    <button
                      type="button"
                      aria-label={t("room.kickCta")}
                      disabled={kickLoading}
                      onClick={() => void handleKick(p.id)}
                      className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-fg/10 hover:text-fg disabled:opacity-40"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="h-3 w-3"
                        aria-hidden="true"
                      >
                        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                      </svg>
                    </button>
                  )}
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
              onClick={() => void handleStart()}
              disabled={!canStart || startLoading}
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
            {ownPlayer?.is_ready
              ? t("room.waitingForHost")
              : t("room.waitingToReady")}
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
                      <span className="font-medium text-fg">
                        {p.display_name}
                      </span>
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
