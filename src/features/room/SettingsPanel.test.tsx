import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "@/lib/i18n/config";
import { DEFAULT_ROOM_CONFIG } from "./roomConfig";
import { SettingsPanel } from "./SettingsPanel";

describe("SettingsPanel", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("keeps basic settings visible and hides advanced controls until expanded", async () => {
    const user = userEvent.setup();

    render(
      <I18nextProvider i18n={i18n}>
        <SettingsPanel
          config={DEFAULT_ROOM_CONFIG}
          onSave={vi.fn().mockResolvedValue(true)}
          saving={false}
          disabled={false}
        />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole("button", { name: /game settings/i }));

    expect(screen.getByText(/basic settings/i)).toBeInTheDocument();
    expect(screen.getByText(/language/i)).toBeInTheDocument();
    expect(screen.getByText(/word categories/i)).toBeInTheDocument();
    expect(screen.getByText(/^imposters$/i)).toBeInTheDocument();
    expect(screen.getByText(/discussion timer/i)).toBeInTheDocument();

    expect(
      screen.queryByText(/imposters see each other/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/imposter hints/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/call-to-vote threshold/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/voting timer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/show live vote count/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /advanced settings/i }),
    );

    expect(screen.getByText(/imposters see each other/i)).toBeInTheDocument();
    expect(screen.getByText(/imposter hints/i)).toBeInTheDocument();
    expect(screen.getByText(/^voting$/i)).toBeInTheDocument();
    expect(screen.getByText(/call-to-vote threshold/i)).toBeInTheDocument();
    expect(screen.getByText(/voting timer/i)).toBeInTheDocument();
    expect(screen.getByText(/show live vote count/i)).toBeInTheDocument();
  });
});
