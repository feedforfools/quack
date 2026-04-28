import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { DisplayNamePrompt } from "@/features/identity";
import { useDisplayName } from "@/features/identity";

/**
 * Home page — `/`
 *
 * Presents the brand, an inline name field, and two CTAs.
 *
 * Flow:
 * - If the player already has a saved name: CTA navigates immediately.
 * - If not: `DisplayNamePrompt` overlay collects the name first, then navigates.
 *
 * The name field is also shown inline so repeat players can edit their name
 * before jumping in. Changes are persisted on every keystroke via setDisplayName.
 */
export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { displayName, hasDisplayName, setDisplayName } = useDisplayName();

  // Tracks which route to send the player to after the name prompt resolves.
  const [pendingDestination, setPendingDestination] = useState<
    "/create" | "/join" | null
  >(null);

  function handleCta(destination: "/create" | "/join") {
    if (hasDisplayName) {
      void navigate(destination);
    } else {
      setPendingDestination(destination);
    }
  }

  function handlePromptConfirm(name: string) {
    setDisplayName(name);
    setPendingDestination(null);
    if (pendingDestination) void navigate(pendingDestination);
  }

  return (
    <>
      {/* Name-prompt overlay fires when CTA is tapped without a saved name */}
      {pendingDestination !== null && (
        <DisplayNamePrompt
          onConfirm={handlePromptConfirm}
          initialName={displayName ?? ""}
        />
      )}

      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
        {/* Brand */}
        <h1 className="text-5xl font-bold tracking-tight text-accent">Quack</h1>
        <p className="mt-2 text-fg-muted">{t("home.tagline")}</p>

        {/* Name field */}
        <div className="mt-10 w-full">
          <Input
            label={t("home.nameLabel")}
            placeholder={t("home.namePlaceholder")}
            value={displayName ?? ""}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            maxLength={30}
          />
        </div>

        {/* CTAs */}
        <div className="mt-4 flex w-full flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => handleCta("/create")}
          >
            {t("home.createRoom")}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full"
            onClick={() => handleCta("/join")}
          >
            {t("home.joinRoom")}
          </Button>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-xs text-fg-subtle">
          <Link
            to="/privacy"
            className="underline-offset-2 hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded"
          >
            {t("home.privacyLink")}
          </Link>
        </footer>
      </main>
    </>
  );
}

