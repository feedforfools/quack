/**
 * Unit tests for the redesigned VotingScreen (E5.5 UI/UX finalisation).
 *
 * Observable behaviour from the player's point of view:
 *  - Active voting: ballot lists every other active player (self and
 *    spectators excluded); tapping a row casts a vote with the right params.
 *  - "Your vote" badge and an enabled Retract button once a vote is cast.
 *  - Retract is disabled before any vote is cast.
 *  - Tally badges only render when the live tally provides counts.
 *  - Pre-vote lobby: request-count progress + "Call to Vote" CTA.
 *  - Host: kill button opens the confirm modal; confirming calls onEndRound.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/lib/i18n";
import { VotingScreen } from "./VotingScreen";
import type { RoleAssignment } from "./useRoleAssignment";
import type { VoteState } from "./useVoteState";
import type { PlayerRow } from "@/features/room";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const assignment: RoleAssignment = {
  gameId: "game-1",
  roundIndex: 1,
  role: "civilian",
  word: "pizza",
  endsAt: null,
  timerSeconds: null,
  pausedSeconds: null,
  starterPlayerId: null,
  discussionDirection: null,
  seenAt: "2026-06-10T10:00:00.000Z",
  coImposters: [],
  hints: [],
};

function makePlayer(id: string, name: string, spectator = false): PlayerRow {
  return {
    id,
    room_id: "room-1",
    display_name: name,
    is_connected: true,
    is_ready: true,
    is_spectator: spectator,
    joined_at: "2026-06-10T09:00:00.000Z",
    last_seen_at: "2026-06-10T09:00:00.000Z",
  };
}

const players: PlayerRow[] = [
  makePlayer("device-1", "Mallard"),
  makePlayer("device-2", "Teal"),
  makePlayer("device-3", "Wigeon"),
  makePlayer("device-4", "Latecomer", true),
];

function makeVoteState(overrides: Partial<VoteState> = {}): VoteState {
  return {
    state: "active",
    requestCount: 2,
    voteEndsAt: null,
    myVoteTargetId: null,
    tally: [],
    ...overrides,
  };
}

function renderScreen(
  props: Partial<React.ComponentProps<typeof VotingScreen>> = {},
) {
  const onCastVote = vi.fn().mockResolvedValue(true);
  const onRetractVote = vi.fn().mockResolvedValue(true);
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <VotingScreen
        assignment={assignment}
        players={players}
        deviceId="device-1"
        voteState={makeVoteState()}
        onCastVote={onCastVote}
        castVoteLoading={false}
        onRetractVote={onRetractVote}
        retractVoteLoading={false}
        votingTotalSeconds={60}
        {...props}
      />
    </I18nextProvider>,
  );
  return { ...utils, onCastVote, onRetractVote };
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

// ─── Active voting ────────────────────────────────────────────────────────────

describe("VotingScreen — active voting", () => {
  it("lists every other active player as a ballot row and casts on tap", async () => {
    const user = userEvent.setup();
    const { onCastVote } = renderScreen();

    const ballot = screen.getByRole("list", { name: "Players" });
    // Self (Mallard) and the spectator (Latecomer) are excluded.
    expect(ballot).toHaveTextContent("Teal");
    expect(ballot).toHaveTextContent("Wigeon");
    expect(ballot).not.toHaveTextContent("Mallard");
    expect(ballot).not.toHaveTextContent("Latecomer");

    await user.click(screen.getByRole("button", { name: /teal/i }));
    expect(onCastVote).toHaveBeenCalledWith({
      deviceId: "device-1",
      gameId: "game-1",
      targetPlayerId: "device-2",
    });
  });

  it("marks the voted row and enables Retract once a vote is cast", async () => {
    const user = userEvent.setup();
    const { onRetractVote } = renderScreen({
      voteState: makeVoteState({ myVoteTargetId: "device-2" }),
    });

    expect(screen.getByText("Your vote")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /teal/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const retract = screen.getByRole("button", { name: "Retract vote" });
    expect(retract).toBeEnabled();
    await user.click(retract);
    expect(onRetractVote).toHaveBeenCalledWith({
      deviceId: "device-1",
      gameId: "game-1",
    });
  });

  it("disables Retract before any vote is cast", () => {
    renderScreen();
    expect(screen.getByRole("button", { name: "Retract vote" })).toBeDisabled();
  });

  it("renders tally badges only when the live tally provides counts", () => {
    const { rerender } = renderScreen();
    expect(screen.queryByText("2")).not.toBeInTheDocument();

    rerender(
      <I18nextProvider i18n={i18n}>
        <VotingScreen
          assignment={assignment}
          players={players}
          deviceId="device-1"
          voteState={makeVoteState({
            tally: [{ targetPlayerId: "device-2", voteCount: 2 }],
          })}
          onCastVote={vi.fn()}
          castVoteLoading={false}
          onRetractVote={vi.fn()}
          retractVoteLoading={false}
          votingTotalSeconds={60}
        />
      </I18nextProvider>,
    );
    const row = screen.getByRole("button", { name: /teal/i });
    expect(row).toHaveTextContent("2");
  });

  it("shows the voting-in-progress status card", () => {
    renderScreen();
    expect(screen.getByText("Voting in progress")).toBeInTheDocument();
  });
});

// ─── Pre-vote lobby ───────────────────────────────────────────────────────────

describe("VotingScreen — pre-vote lobby", () => {
  it("shows request progress and calls onRequestVote from the CTA", async () => {
    const user = userEvent.setup();
    const onRequestVote = vi.fn().mockResolvedValue(true);
    renderScreen({
      voteState: makeVoteState({ state: "requested", requestCount: 1 }),
      voteThreshold: 2,
      onRequestVote,
    });

    expect(screen.getByText("1 of 2 votes to start")).toBeInTheDocument();
    expect(screen.queryByText("Voting in progress")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Call to Vote" }));
    expect(onRequestVote).toHaveBeenCalledWith({
      deviceId: "device-1",
      gameId: "game-1",
    });
  });

  it("offers to take back a pending request when this device already called", async () => {
    const user = userEvent.setup();
    const onRetractVoteRequest = vi.fn().mockResolvedValue(true);
    renderScreen({
      voteState: makeVoteState({ state: "requested", requestCount: 1 }),
      onRequestVote: vi.fn().mockResolvedValue(true),
      onRetractVoteRequest,
      skipRequestedIds: new Set(["device-1"]),
    });

    await user.click(screen.getByRole("button", { name: "Take it back" }));
    expect(onRetractVoteRequest).toHaveBeenCalledWith({
      deviceId: "device-1",
      gameId: "game-1",
    });
  });
});

// ─── Host controls ────────────────────────────────────────────────────────────

describe("VotingScreen — host controls", () => {
  it("confirms before killing the game", async () => {
    const user = userEvent.setup();
    const onEndRound = vi.fn();
    renderScreen({ isHost: true, onEndRound });

    await user.click(screen.getByRole("button", { name: "Kill game" }));
    expect(onEndRound).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Kill game" }));
    expect(onEndRound).toHaveBeenCalledTimes(1);
  });

  it("hides the kill button for non-hosts", () => {
    renderScreen();
    expect(
      screen.queryByRole("button", { name: "Kill game" }),
    ).not.toBeInTheDocument();
  });
});
