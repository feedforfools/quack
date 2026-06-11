/**
 * Unit tests for the redesigned ResultScreen (E5.5 UI/UX finalisation).
 *
 * Observable behaviour from the player's point of view:
 *  - Outcome banner heading per outcome (caught / win / tie).
 *  - Role-reveal roster: imposter vs civilian icons, "Voted out" pill.
 *  - Secret word card and imposters summary line.
 *  - Host sees End Game (calls onEndGame); non-hosts see the waiting hint.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/lib/i18n";
import { ResultScreen } from "./ResultScreen";
import type { GameResult } from "./useGameResult";
import type { PlayerRow } from "@/features/room";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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
];

const caughtResult: GameResult = {
  outcome: "imposters_caught",
  votedOutPlayerId: "device-2",
  votedOutPlayerName: "Teal",
  secretWord: "pizza",
  imposters: [{ player_id: "device-2", display_name: "Teal" }],
};

function renderScreen(
  props: Partial<React.ComponentProps<typeof ResultScreen>> = {},
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ResultScreen
        result={caughtResult}
        players={players}
        deviceId="device-1"
        {...props}
      />
    </I18nextProvider>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ResultScreen", () => {
  it("shows the outcome banner, secret word and imposters summary", () => {
    renderScreen();

    expect(
      screen.getByRole("heading", { name: "Imposters caught!" }),
    ).toBeInTheDocument();
    expect(screen.getByText("The secret word was")).toBeInTheDocument();
    expect(screen.getByText("pizza")).toBeInTheDocument();
    expect(screen.getByText("The imposters: Teal")).toBeInTheDocument();
  });

  it("reveals roles on the roster and marks the voted-out player", () => {
    renderScreen();

    // One imposter icon (Teal), two civilian icons (Mallard, Wigeon).
    expect(screen.getAllByRole("img", { name: "Imposter" })).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: "Civilian" })).toHaveLength(2);
    expect(screen.getByText("Voted out")).toBeInTheDocument();
  });

  it("renders the tie outcome without a voted-out pill", () => {
    renderScreen({
      result: {
        ...caughtResult,
        outcome: "tie",
        votedOutPlayerId: null,
        votedOutPlayerName: null,
      },
    });

    expect(
      screen.getByRole("heading", { name: "It’s a tie!" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Voted out")).not.toBeInTheDocument();
  });

  it("lets the host end the game", async () => {
    const user = userEvent.setup();
    const onEndGame = vi.fn();
    renderScreen({ isHost: true, onEndGame });

    await user.click(screen.getByRole("button", { name: "End Game" }));
    expect(onEndGame).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/waiting for the host/i)).not.toBeInTheDocument();
  });

  it("shows the waiting hint to non-hosts instead of End Game", () => {
    renderScreen();

    expect(screen.getByText(/waiting for the host/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "End Game" }),
    ).not.toBeInTheDocument();
  });
});
