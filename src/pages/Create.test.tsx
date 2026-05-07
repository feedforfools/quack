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

  it("renders basic settings and passes the selected config to createRoom", async () => {
    const user = userEvent.setup();

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Create />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByText(/set the basics now/i)).toBeInTheDocument();
    expect(
      screen.getByText(/more rules wait in the lobby/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "IT" }));
    await user.click(screen.getByRole("button", { name: /animals/i }));
    await user.click(screen.getByRole("button", { name: "+" }));
    await user.selectOptions(screen.getByLabelText(/discussion timer/i), "120");
    await user.click(screen.getByRole("button", { name: /create room/i }));

    await waitFor(() => expect(mocks.createRoom).toHaveBeenCalledTimes(1));
    expect(mocks.createRoom).toHaveBeenCalledWith({
      deviceId: "device-1",
      displayName: "Mallard",
      config: {
        language: "it",
        categories: ["food", "animals"],
        imposter_count: 2,
        imposters_see_each_other: false,
        imposter_hint_count: 0,
        timer_seconds: 120,
        vote_threshold_fraction: 0.5,
        voting_duration_seconds: 60,
        live_vote_tally: false,
      },
    });
  });
});
