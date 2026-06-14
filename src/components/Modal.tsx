import * as Dialog from "@radix-ui/react-dialog";
import { type ReactNode } from "react";
import { Icon } from "@iconify/react";

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
  /** Optional classes applied to the dialog panel. */
  contentClassName?: string;
  /** Optional classes applied to the body wrapper around children. */
  bodyClassName?: string;
  /**
   * Optional accessory rendered in the header row, just left of the close
   * button. Useful for a small "saving…" spinner.
   */
  headerAccessory?: ReactNode;
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
  contentClassName = "",
  bodyClassName = "",
  headerAccessory,
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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Panel */}
        <Dialog.Content
          // Prevent outside-click dismiss when not dismissible
          onInteractOutside={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          {...(description ? {} : { "aria-describedby": undefined })}
          className={[
            "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
            "rounded-3xl border border-border/70 bg-bg-raised shadow-2xl",
            "focus:outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=open]:slide-in-from-bottom-4 data-[state=open]:duration-300 data-[state=open]:ease-out",
            contentClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="flex flex-none flex-col px-6 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <Dialog.Title className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-widest text-fg-muted">
                {title}
              </Dialog.Title>
              {headerAccessory && (
                <div className="flex h-6 items-center">{headerAccessory}</div>
              )}
              {dismissible && (
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close dialog"
                    className={[
                      "-my-2 -mr-2 flex h-9 w-9 items-center justify-center rounded-xl p-2 text-fg-muted",
                      "transition-colors hover:bg-fg/10 hover:text-fg active:scale-95",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    ].join(" ")}
                  >
                    <Icon
                      aria-hidden="true"
                      icon="lucide:x"
                      className="h-5 w-5"
                    />
                  </button>
                </Dialog.Close>
              )}
            </div>

            {description && (
              <Dialog.Description className="mt-2 text-sm leading-snug text-fg-muted">
                {description}
              </Dialog.Description>
            )}
          </div>

          <div
            className={["min-h-0 flex-1 px-6 pb-6", bodyClassName]
              .filter(Boolean)
              .join(" ")}
          >
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
