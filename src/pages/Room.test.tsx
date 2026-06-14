import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n/config";
import Room from "./Room";

const mocks = vi.hoisted(() => ({
  joinRoom: vi.fn().mockResolvedValue("ABC123"),
  toast: vi.fn(),
  requestVote: vi.fn().mockResolvedValue(true),
  castVote: vi.fn().mockResolvedValue(true),
  retractVote: vi.fn().mockResolvedValue(true),
  resolveVote: vi.fn().mockResolvedValue(true),
  refetchVoteState: vi.fn(),
  broadcastVoteStateChanged: vi.fn().mockResolvedValue(undefined),
  setDisplayName: vi.fn(),
  // Configurable per-test so the vote-phase routing can be exercised.
  voteStateForMock: vi.fn(),
}));

vi.mock("@/features/identity", () => ({
  useDeviceId: () => "device-1",
  useDisplayName: () => ({
    displayName: "Mallard",
    hasDisplayName: true,
    setDisplayName: mocks.setDisplayName,
  }),
  DisplayNamePrompt: () => <div>display-name-prompt</div>,
}));

vi.mock("@/features/room", () => ({
  useJoinRoom: () => ({ joinRoom: mocks.joinRoom }),
  useRoom: () => ({
    roomId: "room-1",
    hostPlayerId: "device-1",
    isHost: true,
    roomConfig: {},
    roomState: "round_active",
    loading: false,
    refetch: vi.fn(),
  }),
  useRoomPlayers: () => ({
    players: [
      {
        id: "device-1",
        display_name: "Mallard",
        is_ready: true,
        is_spectator: false,
      },
      {
        id: "device-2",
        display_name: "Teal",
        is_ready: true,
        is_spectator: false,
      },
    ],
    connectedIds: new Set(["device-1", "device-2"]),
    loading: false,
    roomEnded: false,
    channelStatus: "SUBSCRIBED",
    refetch: vi.fn(),
    broadcastRefetch: vi.fn(),
    broadcastRoundEnd: vi.fn(),
    broadcastRoundStart: vi.fn(),
    broadcastTimerStart: vi.fn(),
    broadcastPeekUpdate: vi.fn(),
    broadcastVoteStateChanged: mocks.broadcastVoteStateChanged,
    broadcastRoundAdvanced: vi.fn().mockResolvedValue(undefined),
  }),
  useReadyToggle: () => ({ toggleReady: vi.fn(), loading: false }),
  useLeaveRoom: () => ({ leaveRoom: vi.fn(), loading: false }),
  useHostLeave: () => ({ handOver: vi.fn(), endRoom: vi.fn(), loading: false }),
  useStartGame: () => ({ startGame: vi.fn(), loading: false, error: null }),
  useEndGame: () => ({ endGame: vi.fn(), loading: false }),
  useKickPlayer: () => ({ kickPlayer: vi.fn(), loading: false }),
  parseRoomConfig: () => ({
    game_type: "imposter",
    language: "en",
    categories: ["food"],
    imposter_count: 1,
    imposters_see_each_other: false,
    imposter_hint_count: 0,
    round_mode: "single",
    max_rounds: 5,
    timer_seconds: 0,
    vote_threshold_fraction: 0.5,
    voting_duration_seconds: 60,
    live_vote_tally: false,
    show_vote_counts: true,
    call_to_vote: true,
    max_players: 20,
  }),
  useUpdateRoomConfig: () => ({ updateConfig: vi.fn(), saving: false }),
  getGameModeOption: () => ({
    id: "imposter",
    icon: "mdi:incognito",
    iconColor: "text-accent",
    iconBg: "bg-accent/10",
    titleKey: "create.imposterTitle",
    descriptionKey: "create.imposterDescription",
    available: true,
  }),
  GameSettingsModal: () => null,
}));

vi.mock("@/features/round", () => ({
  useRoleAssignment: () => ({
    assignment: {
      gameId: "game-1",
      roundIndex: 1,
      role: "civilian",
      word: "Pizza",
      hints: [],
      seenAt: "2026-05-03T10:00:00.000Z",
      endsAt: null,
      timerSeconds: null,
      pausedSeconds: null,
      starterPlayerId: null,
      discussionDirection: null,
      coImposters: [],
    },
    loading: false,
    refetch: vi.fn(),
  }),
  // Discussion screen — shown when seenAt is set AND voteState is none/requested.
  DiscussionScreen: (props: {
    onRequestVote?: (params: {
      deviceId: string;
      gameId: string;
    }) => Promise<boolean>;
    onTimerComplete?: () => void;
    onFirstPeek?: () => void;
  }) => (
    <div>
      <button
        onClick={() =>
          void props.onRequestVote?.({ deviceId: "device-1", gameId: "game-1" })
        }
      >
        request-vote
      </button>
      <button onClick={() => props.onTimerComplete?.()}>timer-complete</button>
    </div>
  ),
  // Voting screen — shown when voteState is active.
  VotingScreen: (props: {
    onRequestVote?: (params: {
      deviceId: string;
      gameId: string;
    }) => Promise<boolean>;
    onCastVote?: (params: {
      deviceId: string;
      gameId: string;
      targetPlayerId: string;
    }) => Promise<boolean>;
    onRetractVote?: (params: {
      deviceId: string;
      gameId: string;
    }) => Promise<boolean>;
    onVoteTimerComplete?: () => void;
  }) => (
    <div>
      <button
        onClick={() =>
          void props.onRequestVote?.({ deviceId: "device-1", gameId: "game-1" })
        }
      >
        request-vote-voting
      </button>
      <button
        onClick={() =>
          void props.onCastVote?.({
            deviceId: "device-1",
            gameId: "game-1",
            targetPlayerId: "device-2",
          })
        }
      >
        cast-vote
      </button>
      <button
        onClick={() =>
          void props.onRetractVote?.({ deviceId: "device-1", gameId: "game-1" })
        }
      >
        retract-vote
      </button>
      <button onClick={() => props.onVoteTimerComplete?.()}>
        resolve-vote
      </button>
    </div>
  ),
  useMarkRoleSeen: () => ({ markRoleSeen: vi.fn() }),
  useStartGameTimer: () => ({ startTimer: vi.fn(), loading: false }),
  useGameTimerControls: () => ({
    pauseTimer: vi.fn(),
    resumeTimer: vi.fn(),
    loading: false,
  }),
  useAllPlayersSeen: () => ({ allSeen: true, refetch: vi.fn() }),
  useSeenPlayers: () => ({ seenIds: new Set(), refetch: vi.fn() }),
  useVoteRequesters: () => ({ requesterIds: new Set(), refetch: vi.fn() }),
  useVoteState: () => mocks.voteStateForMock(),
  useRequestVote: () => ({ requestVote: mocks.requestVote, loading: false }),
  useCastVote: () => ({ castVote: mocks.castVote, loading: false }),
  useRetractVote: () => ({ retractVote: mocks.retractVote, loading: false }),
  useRetractVoteRequest: () => ({
    retractVoteRequest: vi.fn(),
    loading: false,
  }),
  useResolveVote: () => ({ resolveVote: mocks.resolveVote }),
  useGameResult: () => ({ result: null, loading: false }),
  useRoundResults: () => ({
    rounds: [],
    latest: null,
    eliminatedIds: new Set(),
    loading: false,
    refetch: vi.fn(),
  }),
  useAdvanceRound: () => ({ advanceRound: vi.fn(), loading: false }),
  useStartVote: () => ({ startVote: vi.fn(), loading: false }),
  useDeclareWordGuessed: () => ({
    declareWordGuessed: vi.fn(),
    loading: false,
  }),
  ResultScreen: () => null,
  RoundResultScreen: () => null,
}));

vi.mock("@/components", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  QRCode: () => null,
  useToast: () => ({ toast: mocks.toast }),
}));

function renderRoom() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/r/ABC123"]}>
        <Routes>
          <Route path="/r/:code" element={<Room />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.joinRoom.mockResolvedValue("ABC123");
  mocks.requestVote.mockResolvedValue(true);
  mocks.castVote.mockResolvedValue(true);
  mocks.retractVote.mockResolvedValue(true);
  mocks.resolveVote.mockResolvedValue(false);
  mocks.broadcastVoteStateChanged.mockResolvedValue(undefined);
  // Default: discussion phase (none state → DiscussionScreen rendered).
  mocks.voteStateForMock.mockReturnValue({
    voteState: {
      state: "none",
      requestCount: 0,
      voteEndsAt: null,
      myVoteTargetId: null,
      tally: [],
    },
    loading: false,
    refetch: mocks.refetchVoteState,
  });
});

describe("Room voting self-sync", () => {
  it("refetches local vote state immediately after request-vote succeeds", async () => {
    // voteState.state = 'none' → DiscussionScreen renders (see beforeEach default).
    const user = userEvent.setup();
    renderRoom();

    await user.click(screen.getByRole("button", { name: "request-vote" }));
    await waitFor(() => expect(mocks.requestVote).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.refetchVoteState).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(mocks.broadcastVoteStateChanged).toHaveBeenCalledTimes(1),
    );
  });

  it("refetches local vote state immediately after cast/retract-vote succeed", async () => {
    // voteState.state = 'active' → VotingScreen renders.
    mocks.voteStateForMock.mockReturnValue({
      voteState: {
        state: "active",
        requestCount: 1,
        voteEndsAt: null,
        myVoteTargetId: null,
        tally: [],
      },
      loading: false,
      refetch: mocks.refetchVoteState,
    });
    const user = userEvent.setup();
    renderRoom();

    await user.click(screen.getByRole("button", { name: "cast-vote" }));
    await waitFor(() => expect(mocks.castVote).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.refetchVoteState).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(mocks.broadcastVoteStateChanged).toHaveBeenCalledTimes(1),
    );

    await user.click(screen.getByRole("button", { name: "retract-vote" }));
    await waitFor(() => expect(mocks.retractVote).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.refetchVoteState).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(mocks.broadcastVoteStateChanged).toHaveBeenCalledTimes(2),
    );
  });

  it("refetches local vote state immediately after explicit resolve-vote succeeds", async () => {
    // Explicit resolve (timer expired) — resolveVote returns true.
    mocks.resolveVote.mockResolvedValue(true);
    mocks.voteStateForMock.mockReturnValue({
      voteState: {
        state: "active",
        requestCount: 1,
        voteEndsAt: null,
        myVoteTargetId: null,
        tally: [],
      },
      loading: false,
      refetch: mocks.refetchVoteState,
    });
    const user = userEvent.setup();
    renderRoom();

    await user.click(screen.getByRole("button", { name: "resolve-vote" }));
    await waitFor(() => expect(mocks.resolveVote).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.refetchVoteState).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(mocks.broadcastVoteStateChanged).toHaveBeenCalledTimes(1),
    );
  });
});
