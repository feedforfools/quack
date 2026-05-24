import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "@/lib/i18n/config";
import { GameSettingsModal } from "./GameSettingsModal";
import { DEFAULT_ROOM_CONFIG } from "./roomConfig";

function renderModal({
  onSave = vi.fn().mockResolvedValue(true),
  disabled = false,
}: {
  onSave?: (config: typeof DEFAULT_ROOM_CONFIG) => Promise<boolean>;
  disabled?: boolean;
} = {}) {
  render(
    <I18nextProvider i18n={i18n}>
      <GameSettingsModal
        open
        onClose={vi.fn()}
        config={DEFAULT_ROOM_CONFIG}
        onSave={onSave}
        saving={false}
        disabled={disabled}
        readOnlyReason={disabled ? "Read only" : undefined}
      />
    </I18nextProvider>,
  );

  return { onSave };
}

describe("GameSettingsModal", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows imposter settings in tabs and saves on Save click", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/game settings/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /words/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(/word categories/i)).toBeInTheDocument();

    // Change a setting — should NOT auto-save.
    await user.click(screen.getByRole("tab", { name: /roles/i }));
    await user.click(
      screen.getByRole("button", { name: /increase imposters/i }),
    );
    expect(onSave).not.toHaveBeenCalled();

    // Explicitly save — should call onSave exactly once with the new config.
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      ...DEFAULT_ROOM_CONFIG,
      imposter_count: 2,
    });
  });

  it("opens the game picker with future modes disabled", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: /change game mode/i }));

    expect(screen.getByText(/choose game/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /imposter/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /lupus/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /secret hitler/i }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("renders read-only tabs with summary values when disabled", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({ disabled: true });

    expect(screen.getByText("Read only")).toBeInTheDocument();

    // Tabs remain visible so viewers can browse the same sections.
    expect(screen.getByRole("tab", { name: /words/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /roles/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /vote/i })).toBeInTheDocument();

    // But no editable form controls or Save/Cancel footer.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /increase imposters/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^save$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^cancel$/i }),
    ).not.toBeInTheDocument();

    // Switching to the Roles tab reveals the read-only imposter count.
    await user.click(screen.getByRole("tab", { name: /roles/i }));
    expect(screen.getByText(/^imposters$/i)).toBeInTheDocument();

    expect(onSave).not.toHaveBeenCalled();
  });
});
