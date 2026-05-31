import {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { Icon } from "@iconify/react";
import { useParams, useNavigate, Link } from "react-router-dom";
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
  GameSettingsModal,
  getGameModeOption,
} from "@/features/room";
import type { RoomConfig } from "@/features/room";
import {
  useRoleAssignment,
  DiscussionScreen,
  VotingScreen,
  useMarkRoleSeen,
  useStartGameTimer,
  useGameTimerControls,
  useAllPlayersSeen,
  useSeenPlayers,
  useVoteRequesters,
  useVoteState,
  useRequestVote,
  useCastVote,
  useRetractVote,
  useRetractVoteRequest,
  useResolveVote,
  useGameResult,
  ResultScreen,
} from "@/features/round";
import {
  Button,
  Modal,
  ShareModal,
  useToast,
  PlayerList,
  GameScaffold,
} from "@/components";
import type { PlayerModifiers } from "@/components";

/** Minimum total players needed to start: imposter_count + 2 civilians. */
const MIN_CIVILIAN_BUFFER = 2;

/** Fixed top banner shown when the Realtime channel is not SUBSCRIBED (E4-T6). */
function ReconnectingBanner({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-accent/90 px-4 py-2 text-sm font-medium text-accent-ink backdrop-blur-sm"
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
  const [showQR, setShowQR] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Local flag: true once the discussion timer fires, driving auto-transition
  // to the voting screen even before voteState becomes 'active' on the server.
  const [discussionTimerExpired, setDiscussionTimerExpired] = useState(false);

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
  // Refs for the per-player roster indicator refetchers (seen-card and
  // called-to-vote), wired below once those hooks are declared.
  const refetchSeenPlayersRef = useRef<(() => void) | null>(null);
  const refetchVoteRequestersRef = useRef<(() => void) | null>(null);
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
    onPeekUpdate: () => {
      // Every device refreshes the per-player "seen card" roster set; the
      // host additionally refreshes the aggregate Start-Timer gate.
      refetchSeenPlayersRef.current?.();
      if (isHost) refetchAllSeen();
    },
    onVoteStateChanged: () => {
      refetchVoteStateRef.current?.();
      refetchVoteRequestersRef.current?.();
    },
    onKicked: () => {
      navigate("/");
      toast({ title: t("room.kickedToast"), variant: "danger" });
    },
    onConfigChanged: refetchRoom,
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
  const {
    pauseTimer,
    resumeTimer,
    loading: timerControlLoading,
  } = useGameTimerControls();
  // Parse room config with full defaults via parseRoomConfig (E5-T1).
  // Memoized so settings editors only sync local state when roomConfig changes
  // from the DB, not on every render caused by saving-state toggles.
  const parsedConfig = useMemo(() => parseRoomConfig(roomConfig), [roomConfig]);
  const selectedGame = getGameModeOption(parsedConfig.game_type);
  const selectedGameSupported = selectedGame.available;
  const imposterCount = parsedConfig.imposter_count;
  const imposterHintCount = parsedConfig.imposter_hint_count;
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

  // Per-player roster indicators for the Discussion screen (E5.5-T9):
  //   * seenIds — who has peeked at their card (refreshed on peek_update).
  //   * requesterIds — who has called to vote (refreshed on vote_state_changed);
  //     only meaningful when call-to-vote is enabled, so gate the query on it.
  const activeGameId =
    roomState === "round_active" ? (assignment?.gameId ?? null) : null;
  const { seenIds: seenPlayerIds, refetch: refetchSeenPlayers } =
    useSeenPlayers(deviceId, activeGameId);
  const { requesterIds: voteRequesterIds, refetch: refetchVoteRequesters } =
    useVoteRequesters(
      deviceId,
      parsedConfig.call_to_vote ? activeGameId : null,
    );
  useEffect(() => {
    refetchSeenPlayersRef.current = refetchSeenPlayers;
  }, [refetchSeenPlayers]);
  useEffect(() => {
    refetchVoteRequestersRef.current = refetchVoteRequesters;
  }, [refetchVoteRequesters]);

  const { requestVote, loading: requestVoteLoading } = useRequestVote();
  const { castVote, loading: castVoteLoading } = useCastVote();
  const { retractVote, loading: retractVoteLoading } = useRetractVote();
  const { retractVoteRequest, loading: retractVoteRequestLoading } =
    useRetractVoteRequest();
  const { resolveVote } = useResolveVote();

  // Fetch full game result once vote is resolved (E5-T9).
  const isResolved = voteState?.state === "resolved";
  const { result: gameResult, loading: resultLoading } = useGameResult(
    isResolved ? deviceId : null,
    isResolved ? (assignment?.gameId ?? null) : null,
  );

  // Reset timer-expired flag when a new game starts (gameId changes).
  useEffect(() => {
    setDiscussionTimerExpired(false);
  }, [assignment?.gameId]);

  // Called by DiscussionScreen's TimerStrip when discussion time runs out.
  const handleDiscussionTimerComplete = useCallback(() => {
    setDiscussionTimerExpired(true);
  }, []);

  const { updateConfig, saving: configSaving } = useUpdateRoomConfig(
    deviceId,
    roomId,
  );
  // Wrapper used by the host settings modal: persist + refetch the room row
  // locally (Supabase broadcast does not echo to the sender by default), so
  // reopening the modal shows the freshly saved config.
  const saveRoomConfig = useCallback(
    async (next: RoomConfig) => {
      const ok = await updateConfig(next);
      if (ok) await refetchRoom();
      return ok;
    },
    [updateConfig, refetchRoom],
  );
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);
  const [selectedSuccessor, setSelectedSuccessor] = useState<string | null>(
    null,
  );

  // Player list container ref — used by the ResizeObserver that picks the
  // optimal column count so the roster fits the available height without
  // scroll. We also derive `listRows`: the max rows-per-column at the chosen
  // size, so PlayerList can fill column-major (col 1 packed to the brim, then
  // col 2, then col 3) instead of redistributing evenly.
  const playerListRef = useRef<HTMLDivElement>(null);
  const [listCols, setListCols] = useState<1 | 2 | 3>(1);
  const [listRows, setListRows] = useState<number>(1);

  // Recompute column count whenever the available height or player count changes.
  useLayoutEffect(() => {
    const el = playerListRef.current;
    if (!el) return;

    // Approximate row heights in px including the per-layout vertical gap.
    // 1-col and 2-col share the SAME (non-compact) row sizing on purpose:
    // the user requirement is that 2 columns must NOT shrink the font.
    // Only the 3-column (compact) layout uses a smaller row height.
    const NORMAL_ROW = 48; // py-3 + text-md content
    const COMPACT_ROW = 36; // py-2 + text-sm content
    const GAP_1 = 8; // gap-2 — 1-col
    const GAP_2 = 6; // gap-1.5 — 2-col
    const GAP_3 = 4; // gap-1 — 3-col

    const fitRows = (h: number, rowH: number, gap: number) =>
      Math.max(1, Math.floor((h + gap) / (rowH + gap)));

    const compute = () => {
      const h = el.clientHeight;
      const n = players.length;
      if (n === 0 || h <= 0) {
        setListCols(1);
        setListRows(Math.max(1, n));
        return;
      }

      // 1 column — roomy rows.
      const maxRows1 = fitRows(h, NORMAL_ROW, GAP_1);
      if (n <= maxRows1) {
        setListCols(1);
        setListRows(n);
        return;
      }

      // 2 columns — SAME row sizing as 1 column (no font shrink).
      const maxRows2 = fitRows(h, NORMAL_ROW, GAP_2);
      if (n <= 2 * maxRows2) {
        setListCols(2);
        setListRows(maxRows2);
        return;
      }

      // 3 columns — compact rows. Ensure rowsPerColumn is at least ceil(n/3)
      // so every player has a slot even if the height estimate is tight.
      const maxRows3 = fitRows(h, COMPACT_ROW, GAP_3);
      setListCols(3);
      setListRows(Math.max(maxRows3, Math.ceil(n / 3)));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [players.length]);

  // Start validation — only non-host, non-spectator players need to be ready.
  const nonHostPlayers = players.filter((p) => p.id !== hostPlayerId);
  const activePlayers = players.filter((p) => !p.is_spectator);
  const allReady =
    nonHostPlayers.length > 0 &&
    nonHostPlayers.filter((p) => !p.is_spectator).every((p) => p.is_ready);
  const enoughPlayers = activePlayers.length >= minPlayers;
  const canStart = selectedGameSupported && allReady && enoughPlayers;

  // True while the Realtime channel is not SUBSCRIBED — drives the reconnecting banner (E4-T6).
  const isReconnecting =
    channelStatus !== null && channelStatus !== "SUBSCRIBED";

  // Friendly reason why Start is disabled.
  const startDisabledReason = !selectedGameSupported
    ? t("room.startDisabledGameUnavailable")
    : !enoughPlayers
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
  // After a successful join we immediately re-fetch the player list and
  // broadcast a roster_update to all connected clients. This is critical for
  // the "join via link" flow: a brand-new player spends several seconds on
  // the name-prompt screen, during which the Realtime channel has already
  // subscribed and done its initial player-list fetch (finding the new player
  // absent). Without the explicit refresh here, the joining player would see
  // 0 players and existing players would not see them until someone else
  // triggered a presence sync.
  useEffect(() => {
    if (!code || !deviceId || !hasDisplayName || joined) return;

    void joinRoom({ deviceId, displayName: displayName!, code }).then(
      (result) => {
        if (result) {
          setJoined(true);
          void broadcastRefetch();
        } else {
          setJoinFailed(true);
        }
      },
    );
  }, [
    code,
    deviceId,
    hasDisplayName,
    displayName,
    joinRoom,
    joined,
    broadcastRefetch,
  ]);

  // Room URL used by the QR code / share modal.
  const roomUrl = `${window.location.origin}/r/${code?.toUpperCase()}`;

  // Derive language + categories from parsed room config (E5-T1).
  const configLanguage = parsedConfig.language;
  const configCategories = parsedConfig.categories;

  // Start Game handler — calls start_round RPC then re-fetches room state.
  const handleStart = useCallback(async () => {
    if (!roomId || !deviceId) return;
    if (parsedConfig.game_type !== "imposter") {
      toast({
        title: t("room.startErrorGameUnavailable"),
        variant: "danger",
      });
      return;
    }
    const ok = await startGame({
      deviceId,
      roomId,
      language: configLanguage,
      categories: configCategories,
      imposterCount,
      hintCount: imposterHintCount,
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
    imposterCount,
    imposterHintCount,
    refetchRoom,
    broadcastRoundStart,
    toast,
    t,
    startError,
    parsedConfig.game_type,
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
      // Refresh this device's own seen-card roster set immediately.
      refetchSeenPlayers();
      // Notify the other clients that another player peeked.
      void broadcastPeekUpdate();
    });
  }, [
    deviceId,
    assignment,
    markRoleSeen,
    isHost,
    refetchAllSeen,
    refetchSeenPlayers,
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

  // Host pause / resume of the discussion timer — synced to every device via
  // the timer_started broadcast (same channel the start uses).
  const handlePauseTimer = useCallback(async (): Promise<boolean> => {
    if (!deviceId || !roomId) return false;
    const ok = await pauseTimer({ deviceId, roomId });
    if (ok) {
      refetchAssignment();
      void broadcastTimerStart();
    } else {
      toast({ title: t("round.timerControlError"), variant: "danger" });
    }
    return ok;
  }, [
    deviceId,
    roomId,
    pauseTimer,
    refetchAssignment,
    broadcastTimerStart,
    toast,
    t,
  ]);

  const handleResumeTimer = useCallback(async (): Promise<boolean> => {
    if (!deviceId || !roomId) return false;
    const ok = await resumeTimer({ deviceId, roomId });
    if (ok) {
      refetchAssignment();
      void broadcastTimerStart();
    } else {
      toast({ title: t("round.timerControlError"), variant: "danger" });
    }
    return ok;
  }, [
    deviceId,
    roomId,
    resumeTimer,
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
      if (ok) {
        refetchVoteState();
        refetchVoteRequesters();
        void broadcastVoteStateChanged();
      } else toast({ title: t("vote.requestError"), variant: "danger" });
      return ok;
    },
    [
      requestVote,
      refetchVoteState,
      refetchVoteRequesters,
      broadcastVoteStateChanged,
      toast,
      t,
    ],
  );

  // Retract a pending "skip to vote" request (item 3).
  const handleRetractVoteRequest = useCallback(
    async (params: { deviceId: string; gameId: string }): Promise<boolean> => {
      const ok = await retractVoteRequest(params);
      if (ok) {
        refetchVoteState();
        refetchVoteRequesters();
        void broadcastVoteStateChanged();
      } else toast({ title: t("vote.retractRequestError"), variant: "danger" });
      return ok;
    },
    [
      retractVoteRequest,
      refetchVoteState,
      refetchVoteRequesters,
      broadcastVoteStateChanged,
      toast,
      t,
    ],
  );

  const handleCastVote = useCallback(
    async (params: {
      deviceId: string;
      gameId: string;
      targetPlayerId: string;
    }): Promise<boolean> => {
      const ok = await castVote(params);
      if (ok) {
        refetchVoteState();
        void broadcastVoteStateChanged();
        // Attempt auto-resolve in case this was the last vote — the RPC is a
        // no-op (raises P0001) if not all players have voted yet.
        void resolveVote({
          deviceId: params.deviceId,
          gameId: params.gameId,
        }).then((resolved) => {
          if (resolved) {
            refetchVoteState();
            void broadcastVoteStateChanged();
          }
        });
      }
      // Typed errors are surfaced via useCastVote.error; swallow here.
      return ok;
    },
    [castVote, resolveVote, refetchVoteState, broadcastVoteStateChanged],
  );

  const handleRetractVote = useCallback(
    async (params: { deviceId: string; gameId: string }): Promise<boolean> => {
      const ok = await retractVote(params);
      if (ok) {
        refetchVoteState();
        void broadcastVoteStateChanged();
      } else toast({ title: t("vote.retractError"), variant: "danger" });
      return ok;
    },
    [retractVote, refetchVoteState, broadcastVoteStateChanged, toast, t],
  );

  // Called when the voting timer expires — triggers resolution and broadcasts
  // so all clients transition to the result screen (E5-T9).
  const handleVoteTimerComplete = useCallback(() => {
    if (!deviceId || !assignment) return;
    void resolveVote({ deviceId, gameId: assignment.gameId }).then((ok) => {
      if (ok) {
        refetchVoteState();
        void broadcastVoteStateChanged();
      }
    });
  }, [
    deviceId,
    assignment,
    resolveVote,
    refetchVoteState,
    broadcastVoteStateChanged,
  ]);

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

    // Derive the current game phase from server state + local flag.
    // Phase order: discussion → voting → result.
    //  - discussion: default — DiscussionScreen auto-opens the role-peek modal
    //                when seenAt is null, so there is no separate reveal phase.
    //  - voting:     vote is active, OR discussion timer has fired, OR the
    //                assignment's endsAt is already in the past.
    //  - result:     vote is resolved (show result screen)
    const timerExpiredNow =
      assignment.endsAt != null && new Date(assignment.endsAt) <= new Date();
    const gamePhase = isResolved
      ? "result"
      : voteState?.state === "active" ||
          discussionTimerExpired ||
          timerExpiredNow
        ? "voting"
        : "discussion";

    // Result screen — shown when voting is resolved (E5-T9).
    if (gamePhase === "result") {
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

    // Voting screen — dedicated active-voting phase (E5.5-T5).
    if (gamePhase === "voting" && voteState) {
      return (
        <>
          {isReconnecting && (
            <ReconnectingBanner label={t("room.reconnecting")} />
          )}
          <VotingScreen
            assignment={assignment}
            players={players}
            deviceId={deviceId}
            voteState={voteState}
            onRequestVote={
              parsedConfig.call_to_vote ? handleRequestVote : undefined
            }
            requestVoteLoading={requestVoteLoading}
            voteThreshold={voteThreshold}
            onCastVote={handleCastVote}
            castVoteLoading={castVoteLoading}
            onRetractVote={handleRetractVote}
            retractVoteLoading={retractVoteLoading}
            onVoteTimerComplete={handleVoteTimerComplete}
            votingTotalSeconds={parsedConfig.voting_duration_seconds}
          />
        </>
      );
    }

    // Discussion screen — post-reveal phase (E5.5-T5).
    if (gamePhase === "discussion") {
      return (
        <>
          {isReconnecting && (
            <ReconnectingBanner label={t("room.reconnecting")} />
          )}
          <DiscussionScreen
            assignment={assignment}
            players={players}
            connectedIds={connectedIds}
            hostPlayerId={hostPlayerId}
            deviceId={deviceId}
            isHost={isHost}
            onEndRound={isHost ? handleEndRound : undefined}
            endRoundLoading={endRoundLoading}
            onStartTimer={isHost ? handleStartTimer : undefined}
            startTimerLoading={startTimerLoading}
            onPauseTimer={isHost ? handlePauseTimer : undefined}
            onResumeTimer={isHost ? handleResumeTimer : undefined}
            timerControlLoading={timerControlLoading}
            allPlayersSeen={allPlayersSeen}
            configTimerSeconds={parsedConfig.timer_seconds}
            voteState={voteState}
            voteThreshold={voteThreshold}
            onRequestVote={
              parsedConfig.call_to_vote ? handleRequestVote : undefined
            }
            requestVoteLoading={requestVoteLoading}
            onRetractVoteRequest={
              parsedConfig.call_to_vote ? handleRetractVoteRequest : undefined
            }
            retractVoteRequestLoading={retractVoteRequestLoading}
            onFirstPeek={handleFirstPeek}
            onTimerComplete={handleDiscussionTimerComplete}
            // Per-player roster indicators, sourced live from the
            // get_seen_player_ids / get_vote_requesters RPCs (E5.5-T9). The
            // own device's seen state is merged in from its own assignment so
            // its eye-check shows immediately, without waiting for a refetch.
            seenIds={
              assignment.seenAt && deviceId
                ? new Set([...seenPlayerIds, deviceId])
                : seenPlayerIds
            }
            skipRequestedIds={voteRequesterIds}
          />
        </>
      );
    }
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

  // Own player row for ready state.
  const ownPlayer = players.find((p) => p.id === deviceId);

  // Lobby modifiers: ready checkmark for non-host non-spectator players;
  // spectator label for late joiners.
  const lobbyModifiers: Record<string, PlayerModifiers> = Object.fromEntries(
    players.map((p) => [
      p.id,
      {
        firstModifier: p.is_spectator ? (
          <span className="rounded-full bg-fg/10 px-1.5 py-0.5 text-[10px] text-fg-muted">
            {t("room.spectatorBadge")}
          </span>
        ) : null,
        mainModifier:
          !p.is_spectator && p.id !== hostPlayerId && p.is_ready ? (
            <Icon
              icon="lucide:check"
              className="h-4 w-4 text-success"
              aria-label={t("room.readyCta")}
            />
          ) : null,
      },
    ]),
  );

  return (
    <>
      {/* Reconnecting banner */}
      {isReconnecting && <ReconnectingBanner label={t("room.reconnecting")} />}

      <GameScaffold
        listRef={playerListRef}
        listLabel={t("room.shareLabel")}
        header={
          /* Header: logo · code + share · player capacity */
          <div className="grid grid-cols-[1fr,auto,1fr] items-center px-4 py-3">
            {/* Left: logo → home */}
            <Link
              to="/"
              aria-label={t("common.backToHome")}
              className="justify-self-start transition-opacity active:opacity-60"
            >
              <img
                src="/quack_150.png"
                alt="Quack"
                className="h-10 w-auto select-none"
                draggable={false}
              />
            </Link>

            {/* Center: room code + ROOM label + share icon */}
            <div className="relative flex flex-col items-center gap-0 justify-self-center">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setShowQR(true)}
                  aria-label={t("room.shareLabel")}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-fg-muted transition-colors hover:bg-fg/10 active:opacity-60"
                >
                  <span className="font-mono text-3xl font-bold tracking-widest text-accent">
                    {code?.toUpperCase()}
                  </span>
                  <Icon
                    icon="lucide:share-2"
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <span className="absolute top-full text-[10px] font-semibold uppercase tracking-[0.2em] text-fg-muted">
                {t("room.lobby")}
              </span>
            </div>

            {/* Right: player capacity badge */}
            <div className="flex flex-col items-end gap-0 justify-self-end">
              <div className="flex items-center gap-0.5 rounded-xl bg-bg-raised px-2 py-1.5">
                <Icon
                  icon="lucide:users"
                  className="h-3.5 w-3.5 text-fg-muted"
                  aria-hidden="true"
                />
                <span className="flex items-baseline gap-0">
                  <span className="text-sm font-bold tabular-nums leading-none text-fg">
                    {players.length}
                  </span>
                  <span className="text-sm tabular-nums leading-none text-fg-muted">
                    /{parsedConfig.max_players}
                  </span>
                </span>
              </div>
            </div>
          </div>
        }
        belowHeader={t("room.lobbyDescription")}
        list={
          playersLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-xl bg-bg-raised"
                />
              ))}
            </div>
          ) : (
            <PlayerList
              players={players}
              connectedIds={connectedIds}
              hostPlayerId={hostPlayerId}
              deviceId={deviceId}
              isHost={isHost && roomState === "lobby"}
              onKick={isHost && roomState === "lobby" ? handleKick : undefined}
              kickLoading={kickLoading}
              modifiers={lobbyModifiers}
              columns={listCols}
              rowsPerColumn={listRows}
            />
          )
        }
        extra={
          /* Next Game Card */
          <div className="rounded-xl bg-bg-raised px-3 py-3">
            <div className="flex items-center gap-3">
              {/* Game icon */}
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${selectedGame.iconBg}`}
              >
                <Icon
                  icon={selectedGame.icon}
                  className={`h-6 w-6 ${selectedGame.iconColor}`}
                  aria-hidden="true"
                />
              </div>

              {/* Game info */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-subtle">
                  {t("room.nextGame")}
                </span>
                <span className="text-sm font-bold leading-none text-fg">
                  {t(selectedGame.titleKey)}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {parsedConfig.game_type === "imposter" ? (
                    <>
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-fg/8 px-2 py-0.5 text-[11px] text-fg-muted">
                        <Icon
                          icon="lucide:user-x"
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        {imposterCount}
                      </span>
                      <span className="rounded-full bg-fg/8 px-2 py-0.5 text-[11px] font-medium uppercase text-fg-muted">
                        {configLanguage}
                      </span>
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-fg/8 px-2 py-0.5 text-[11px] text-fg-muted">
                        <Icon
                          icon="lucide:timer"
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        {parsedConfig.timer_seconds === 0
                          ? t("settings.timerOff")
                          : parsedConfig.timer_seconds <= 180
                            ? t("settings.timer_3min")
                            : parsedConfig.timer_seconds <= 300
                              ? t("settings.timer_5min")
                              : parsedConfig.timer_seconds <= 420
                                ? t("settings.timer_7min")
                                : t("settings.timer_10min")}
                      </span>
                    </>
                  ) : (
                    <span className="rounded-full bg-fg/8 px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                      {t("common.comingSoon")}
                    </span>
                  )}
                </div>
              </div>

              {/* Settings button */}
              <button
                type="button"
                aria-label={
                  isHost
                    ? t("room.nextGameEditSettings")
                    : t("room.nextGameViewSettings")
                }
                onClick={() =>
                  isHost ? setShowSettings(true) : setShowPlayerSettings(true)
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/8 transition-colors hover:bg-fg/12 active:opacity-60"
              >
                <Icon
                  icon={
                    isHost ? "carbon:settings-edit" : "carbon:settings-view"
                  }
                  className="h-5 w-5 text-fg-muted"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        }
        aboveFooter={
          isHost ? t("room.lobbyHintHost") : t("room.lobbyHintPlayer")
        }
        footer={
          <>
            {/* Host: exit · start · settings */}
            {joined && isHost && !roomLoading && (
              <div className="flex items-center gap-3">
                {/* Exit — square, red */}
                <Button
                  variant="danger"
                  size="md"
                  aria-label={t("room.hostLeaveCta")}
                  disabled={hostLeaveLoading}
                  onClick={() => {
                    setSelectedSuccessor(null);
                    setShowLeaveModal(true);
                  }}
                  style={{ aspectRatio: "1 / 1", padding: 0, minWidth: "44px" }}
                >
                  <Icon
                    icon="lucide:log-out"
                    className="h-5 w-5"
                    aria-hidden="true"
                  />
                </Button>

                {/* Start — rectangular, yellow */}
                <Button
                  variant="primary"
                  size="md"
                  className="flex-1"
                  onClick={() => void handleStart()}
                  disabled={!canStart || startLoading}
                  loading={startLoading}
                  aria-describedby={!canStart ? "start-hint" : undefined}
                >
                  {t("room.startGame")}
                </Button>
              </div>
            )}

            {/* Disabled-start hint */}
            {joined && isHost && !roomLoading && !canStart && (
              <p
                id="start-hint"
                className="mt-2 text-center text-xs text-fg-muted"
              >
                {startDisabledReason}
              </p>
            )}

            {/* All-ready hint */}
            {joined && isHost && !roomLoading && canStart && (
              <p className="mt-2 text-center text-xs text-fg-muted">
                {t("room.lobbyAllReady")}
              </p>
            )}

            {/* Non-host: exit · ready · view-settings */}
            {joined && !isHost && !roomLoading && (
              <div className="flex items-center gap-3">
                {/* Exit — square, red */}
                <Button
                  variant="danger"
                  size="md"
                  aria-label={t("room.leaveCta")}
                  disabled={leaveLoading}
                  onClick={() => void handleLeave()}
                  style={{ aspectRatio: "1 / 1", padding: 0, minWidth: "44px" }}
                >
                  <Icon
                    icon="lucide:log-out"
                    className="h-5 w-5"
                    aria-hidden="true"
                  />
                </Button>

                {/* Ready — rectangular, fills remaining space */}
                <Button
                  variant={ownPlayer?.is_ready ? "ghost" : "primary"}
                  size="md"
                  className="flex-1"
                  onClick={() => void toggleReady(ownPlayer?.is_ready ?? false)}
                  disabled={readyLoading}
                >
                  {ownPlayer?.is_ready
                    ? t("room.notReadyCta")
                    : t("room.readyCta")}
                </Button>
              </div>
            )}

            {/* Player ready hint */}
            {joined && !isHost && !roomLoading && (
              <p className="mt-2 text-center text-xs text-fg-muted">
                {ownPlayer?.is_ready
                  ? t("room.lobbyHintPlayerReady")
                  : t("room.lobbyHintPlayerCta")}
              </p>
            )}
          </>
        }
      />

      {/* Share modal — room code copy, QR code, and URL share */}
      <ShareModal
        open={showQR}
        onClose={() => setShowQR(false)}
        code={code?.toUpperCase() ?? ""}
        roomUrl={roomUrl}
      />

      {/* Player settings modal — read-only view for non-host players */}
      {!isHost && (
        <GameSettingsModal
          open={showPlayerSettings}
          onClose={() => setShowPlayerSettings(false)}
          config={parsedConfig}
          onSave={async () => false}
          saving={false}
          disabled
          readOnlyReason={t("settings.playerReadOnlyNote")}
        />
      )}

      {/* Host settings modal — editable by the host */}
      {isHost && (
        <GameSettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          config={parsedConfig}
          onSave={saveRoomConfig}
          saving={configSaving}
          disabled={roomState !== "lobby"}
          readOnlyReason={
            roomState !== "lobby" ? t("settings.frozenNote") : undefined
          }
        />
      )}

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
    </>
  );
}
