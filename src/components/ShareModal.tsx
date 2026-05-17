import { useCallback, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";
import { QRCode } from "./QRCode";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  /** Room code, e.g. "ABCD" — displayed prominently. */
  code: string;
  /** Full join URL encoded in the QR code and shown in the URL row. */
  roomUrl: string;
}

/**
 * Share / lobby-code modal.
 *
 * Layout (matches the product sketch):
 *  1. Small "Share room" title + large room code left-aligned with copy icon
 *  2. Close (×) button in the top-right corner; tapping the backdrop also closes
 *  3. QR code centred
 *  4. URL row — truncated URL (no scheme) + OS share button (Web Share API,
 *     clipboard fallback)
 *  5. One-line hint
 */
export function ShareModal({ open, onClose, code, roomUrl }: ShareModalProps) {
  const { t } = useTranslation();
  const [codeCopied, setCodeCopied] = useState(false);

  // QR size: up to 256 px, but never wider than the viewport minus chrome.
  const qrSize = useMemo(
    () => Math.floor(Math.min(window.innerWidth - 80, 256)),
    [],
  );

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — silent fail
    }
  }, [code]);

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleShare = useCallback(async () => {
    if (canShare) {
      try {
        await navigator.share({
          title: t("room.shareTitle"),
          text: t("room.shareText", { code }),
          url: roomUrl,
        });
      } catch {
        // User cancelled or permission denied — silent
      }
    } else {
      try {
        await navigator.clipboard.writeText(roomUrl);
      } catch {
        // Clipboard API unavailable — silent fail
      }
    }
  }, [canShare, code, roomUrl, t]);

  // Display URL without the https:// scheme — saves space and is more readable.
  const displayUrl = roomUrl.replace(/^https?:\/\//, "");

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Panel — always narrower than the viewport */}
        <Dialog.Content
          className={[
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-bg-raised p-6 shadow-xl",
            "focus:outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          ].join(" ")}
        >
          {/* ── Modal title (visible) ────────────────────────────────── */}
          <Dialog.Title className="pr-10 text-xs font-semibold uppercase tracking-widest text-fg-muted">
            {t("room.shareModalTitle")}
          </Dialog.Title>

          {/* ── Room code + copy ────────────────────────────────────── */}
          {/* pr-12 avoids overlap with the close button */}
          <button
            type="button"
            onClick={() => void handleCopyCode()}
            aria-label={codeCopied ? t("room.codeCopied") : t("room.copyCode")}
            className={[
              "-mx-2 mt-0.5 flex items-center gap-2.5 rounded-xl px-2 py-1.5 pr-12",
              "transition-colors hover:bg-fg/5 active:bg-fg/10",
            ].join(" ")}
          >
            <span className="font-mono text-4xl font-bold leading-none tracking-widest text-accent">
              {code}
            </span>
            <Icon
              icon={codeCopied ? "lucide:check" : "lucide:copy"}
              className={[
                "h-5 w-5 shrink-0 transition-colors",
                codeCopied ? "text-success" : "text-fg-muted",
              ].join(" ")}
              aria-hidden="true"
            />
          </button>

          {/* ── Close (×) ───────────────────────────────────────────── */}
          <Dialog.Close asChild>
            <button
              aria-label={t("common.close")}
              className={[
                "absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center",
                "rounded-lg p-1 text-fg-muted",
                "hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              ].join(" ")}
            >
              <Icon aria-hidden="true" icon="lucide:x" className="h-5 w-5" />
            </button>
          </Dialog.Close>

          {/* ── QR code ─────────────────────────────────────────────── */}
          <div className="flex justify-center py-5">
            <QRCode
              value={roomUrl}
              size={qrSize}
              label={t("room.shareLabel")}
            />
          </div>

          {/* ── URL row with share / copy icon ──────────────────────── */}
          <div className="flex items-center gap-1 rounded-xl bg-bg-sunken px-3 py-1.5">
            <span className="flex-1 truncate font-mono text-sm text-fg-muted">
              {displayUrl}
            </span>
            <button
              type="button"
              onClick={() => void handleShare()}
              aria-label={t("room.shareLabel")}
              className={[
                "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center",
                "rounded-lg p-1 text-fg-muted",
                "hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              ].join(" ")}
            >
              <Icon
                icon="lucide:share-2"
                className="h-5 w-5"
                aria-hidden="true"
              />
            </button>
          </div>

          {/* ── Hint ────────────────────────────────────────────────── */}
          <p className="mt-3 text-center text-sm text-fg-muted">
            {t("room.shareModalHint")}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
