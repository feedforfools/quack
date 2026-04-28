import * as Dialog from "@radix-ui/react-dialog";
import { type ReactNode } from "react";

interface ModalProps {
  /** Controlled open state. */
  open: boolean;
  /** Called when the user dismisses (Escape, overlay click). */
  onClose: () => void;
  /** Accessible title rendered as the dialog heading. Required by WCAG. */
  title: string;
  /** Optional subtitle rendered below the title. */
  description?: string;
  children: ReactNode;
  /**
   * When true the user cannot dismiss by clicking the overlay or pressing
   * Escape. Use for destructive confirmation flows.
   */
  dismissible?: boolean;
}

/**
 * Accessible modal dialog built on Radix UI Dialog.
 *
 * Radix provides: portal rendering, focus trap, Escape-to-close, scroll lock,
 * `aria-modal`, `aria-labelledby`, `aria-describedby`, and proper role.
 *
 * Styling uses theme tokens only — no hard-coded colours.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  dismissible = true,
}: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && dismissible) onClose();
      }}
    >
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Panel */}
        <Dialog.Content
          // Prevent outside-click dismiss when not dismissible
          onInteractOutside={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          className={[
            "fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-bg-raised p-6 shadow-xl",
            "focus:outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          ].join(" ")}
        >
          <Dialog.Title className="text-lg font-semibold text-fg">
            {title}
          </Dialog.Title>

          {description && (
            <Dialog.Description className="mt-1 text-sm text-fg-muted">
              {description}
            </Dialog.Description>
          )}

          <div className="mt-4">{children}</div>

          {dismissible && (
            <Dialog.Close asChild>
              <button
                aria-label="Close dialog"
                className={[
                  "absolute right-4 top-4 rounded-lg p-1 text-fg-muted",
                  "hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  "min-h-[44px] min-w-[44px] flex items-center justify-center",
                ].join(" ")}
              >
                {/* ✕ */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </Dialog.Close>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
