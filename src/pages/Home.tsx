import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useToast } from "@/components";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DisplayNamePrompt, useDeviceId } from "@/features/identity";
import { useDisplayName } from "@/features/identity";
import { useActiveRoom, useLeaveRoom } from "@/features/room";
import { supabaseWithDevice } from "@/lib/supabase";

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
  const deviceId = useDeviceId();
  const { displayName, hasDisplayName, setDisplayName } = useDisplayName();
  const {
    activeRoom,
    loading: activeRoomLoading,
    refetch: refetchActiveRoom,
  } = useActiveRoom(deviceId);
  const { leaveRoom, loading: leaveLoading } = useLeaveRoom();
  const { toast } = useToast();

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

      <div className="fixed right-4 top-4 z-10">
        <LanguageToggle />
      </div>

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

        {/* Active-room card — shown when the device already has a live players row. */}
        {!activeRoomLoading && activeRoom && (
          <div className="mt-4 w-full rounded-2xl bg-bg-raised px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t("home.activeRoomTitle")}
            </p>
            <p className="mt-1 text-xl font-bold tracking-[0.15em] text-accent">
              {activeRoom.code.toUpperCase()}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={() =>
                  void navigate(`/r/${activeRoom.code.toUpperCase()}`)
                }
              >
                {t("home.activeRoomResume", {
                  code: activeRoom.code.toUpperCase(),
                })}
              </Button>
              <Button
                variant="ghost"
                size="md"
                className="w-full text-danger"
                disabled={leaveLoading}
                onClick={async () => {
                  const ok = await leaveRoom({
                    deviceId: deviceId ?? "",
                    roomId: activeRoom.roomId,
                  });
                  if (ok) {
                    refetchActiveRoom();
                    toast({
                      title: t("home.activeRoomLeftToast"),
                      variant: "default",
                    });
                  }
                }}
              >
                {t("home.activeRoomLeave")}
              </Button>
            </div>
          </div>
        )}

        {/* CTAs — hidden while the device has an active room. */}
        {!activeRoomLoading && !activeRoom && (
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
            <p className="mt-2 text-center text-sm text-fg-muted">
              {t("home.noRoomMessage")}
            </p>
          </div>
        )}

        {/* Hint shown while loading to prevent layout shift flicker. */}
        {activeRoomLoading && (
          <div className="mt-4 h-[136px] w-full animate-pulse rounded-2xl bg-bg-raised" />
        )}

        {activeRoom && !activeRoomLoading && (
          <p className="mt-3 text-center text-xs text-fg-muted">
            {t("home.activeRoomHint")}
          </p>
        )}

        {/* Dev-only reset panel — Vite tree-shakes this entire branch in production */}
        {import.meta.env.DEV && (
          <div className="mt-8 w-full rounded-xl border border-dashed border-yellow-500/40 bg-yellow-500/5 px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-yellow-500/70">
              Dev
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="w-full border-yellow-500/30 text-yellow-500/80 hover:text-yellow-500"
              onClick={() => void navigate("/dev")}
            >
              UI Playground
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full border-yellow-500/30 text-yellow-500/80 hover:text-yellow-500"
              onClick={async () => {
                if (deviceId) {
                  await supabaseWithDevice(deviceId)
                    .from("players")
                    .delete()
                    .eq("id", deviceId);
                }
                for (const key of Object.keys(localStorage)) {
                  if (key.startsWith("quack_")) localStorage.removeItem(key);
                }
                location.reload();
              }}
            >
              Reset device
            </Button>
          </div>
        )}

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
