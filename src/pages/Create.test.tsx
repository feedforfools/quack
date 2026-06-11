import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "@/lib/i18n/config";
import Create from "./Create";

const mocks = vi.hoisted(() => ({
  createRoom: vi.fn().mockResolvedValue("ABC123"),
  setDisplayName: vi.fn(),
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

vi.mock("@/features/room", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/room")>();
  return {
    ...actual,
    useCreateRoom: () => ({
      createRoom: mocks.createRoom,
      loading: false,
      error: null,
    }),
  };
});

describe("Create", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("creates an imposter room with the selected game type", async () => {
    const user = userEvent.setup();

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Create />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByText(/choose a game/i)).toBeInTheDocument();
    expect(screen.getByText(/pick the type of game/i)).toBeInTheDocument();

    await user.click(screen.getByText(/^imposter$/i));

    await waitFor(() => expect(mocks.createRoom).toHaveBeenCalledTimes(1));
    expect(mocks.createRoom).toHaveBeenCalledWith({
      deviceId: "device-1",
      displayName: "Mallard",
      config: {
        game_type: "imposter",
        language: "en",
        categories: ["food"],
        imposter_count: 1,
        imposters_see_each_other: false,
        imposter_hint_count: 0,
        timer_seconds: 300,
        vote_threshold_fraction: 0.5,
        voting_duration_seconds: 60,
        live_vote_tally: false,
        call_to_vote: true,
        max_players: 20,
      },
    });
  });
});
