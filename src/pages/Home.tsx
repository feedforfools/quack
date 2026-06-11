import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@iconify/react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useToast, ThemeToggle } from "@/components";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTheme } from "@/lib/theme";
import { DisplayNamePrompt, useDeviceId } from "@/features/identity";
import { useDisplayName } from "@/features/identity";
import { useActiveRoom, useLeaveRoom } from "@/features/room";

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
  const { isDark } = useTheme();
  const navigate = useNavigate();

  // Preload both logos so the swap is instant.
  useEffect(() => {
    const imgs = ["/youquack_dark.png", "/youquack_light.png"].map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    return () => imgs.forEach((img) => (img.src = ""));
  }, []);
  const deviceId = useDeviceId();
  const { displayName, hasDisplayName, setDisplayName } = useDisplayName();
  const [nameInput, setNameInput] = useState(() => displayName ?? "");

  // Sync local input state when displayName changes externally (e.g. from DisplayNamePrompt).
  useEffect(() => {
    setNameInput(displayName ?? "");
  }, [displayName]);
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

      <div className="fixed left-4 top-4 z-10">
        <LanguageToggle />
      </div>

      <div className="fixed right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <div className="flex flex-1 flex-col items-center justify-center">
          {/* Brand — both images are in the DOM; only the active one is visible */}
          <div className="relative w-full max-w-[300px] motion-safe:animate-fade-up">
            {/* Dark logo — in normal flow to define container height */}
            <img
              src="/youquack_dark.png"
              alt="YouQuack"
              className={`block h-auto w-full select-none transition-opacity duration-150 ${
                isDark ? "opacity-100" : "opacity-0"
              }`}
              draggable={false}
            />
            {/* Light logo — absolute overlay */}
            <img
              src="/youquack_light.png"
              alt=""
              aria-hidden
              className={`absolute inset-0 block h-auto w-full select-none transition-opacity duration-150 ${
                isDark ? "opacity-0" : "opacity-100"
              }`}
              draggable={false}
            />
          </div>
          <p className="mt-1 text-center text-sm font-medium text-fg-muted motion-safe:animate-fade-up motion-safe:[animation-delay:60ms]">
            {t("home.tagline")}
          </p>

          {/* Name field */}
          <div className="mt-10 w-full motion-safe:animate-fade-up motion-safe:[animation-delay:120ms]">
            <Input
              label={t("home.nameLabel")}
              placeholder={t("home.namePlaceholder")}
              value={nameInput}
              onChange={(e) => {
                const val = e.target.value;
                setNameInput(val);
                if (val.trim()) setDisplayName(val);
              }}
              autoComplete="nickname"
              maxLength={30}
            />
          </div>

          {/* Active-room card — shown when the device already has a live players row. */}
          {!activeRoomLoading && activeRoom && (
            <div className="mt-4 w-full rounded-2xl bg-bg-raised px-5 py-4 shadow-sm ring-1 ring-border/60 motion-safe:animate-fade-up motion-safe:[animation-delay:180ms]">
              <p className="text-sm text-fg-muted">
                {t("home.activeRoomTitle")} ·{" "}
                <span className="font-bold tracking-[0.15em] text-accent">
                  {activeRoom.code.toUpperCase()}
                </span>
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="ghost"
                  size="md"
                  className="text-danger"
                  style={{ aspectRatio: "1 / 1", padding: 0, minWidth: "44px" }}
                  disabled={leaveLoading}
                  aria-label={t("home.activeRoomLeave")}
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
                  <Icon icon="lucide:log-out" className="h-5 w-5" aria-hidden />
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  className="flex-1"
                  onClick={() =>
                    void navigate(`/r/${activeRoom.code.toUpperCase()}`)
                  }
                >
                  {t("home.activeRoomResume")}
                </Button>
              </div>
            </div>
          )}

          {/* CTAs — hidden while the device has an active room. */}
          {!activeRoomLoading && !activeRoom && (
            <div className="mt-4 flex w-full gap-3 motion-safe:animate-fade-up motion-safe:[animation-delay:180ms]">
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                onClick={() => handleCta("/create")}
              >
                {t("home.createRoom")}
              </Button>
              <Button
                variant="ghost"
                size="md"
                className="flex-1"
                onClick={() => handleCta("/join")}
              >
                {t("home.joinRoom")}
              </Button>
            </div>
          )}

          {/* Hint shown while loading to prevent layout shift flicker. */}
          {activeRoomLoading && (
            <div className="mt-4 h-[100px] w-full animate-pulse rounded-2xl bg-bg-raised" />
          )}

          {/* Context hint — one-liner beneath the action area */}
          {!activeRoomLoading && (
            <p className="mt-3 text-center text-xs text-fg-subtle motion-safe:animate-fade-up motion-safe:[animation-delay:240ms]">
              {activeRoom ? t("home.activeRoomHint") : t("home.ctaHint")}
            </p>
          )}
        </div>

        {/* Dev-only reset panel — Vite tree-shakes this entire branch in production */}
        {/* {import.meta.env.DEV && (
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
        )} */}

        {/* Footer — pinned to page bottom */}
        <footer className="mt-8 text-center text-xs text-fg-subtle">
          <Link
            to="/privacy"
            className="rounded underline-offset-2 hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {t("home.privacyLink")}
          </Link>
        </footer>
      </main>
    </>
  );
}
