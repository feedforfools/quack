import * as RadixToast from "@radix-ui/react-toast";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastVariant = "default" | "success" | "danger";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Duration in ms before auto-dismiss. Defaults to 4000. */
  duration?: number;
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, "id">) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const variantClasses: Record<ToastVariant, string> = {
  default: "border-border bg-bg-raised text-fg",
  success: "border-success/40 bg-bg-raised text-fg",
  danger: "border-danger/40 bg-bg-raised text-fg",
};

const iconClasses: Record<ToastVariant, string> = {
  default: "text-fg-muted",
  success: "text-success",
  danger: "text-danger",
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Mount once near the app root (in `main.tsx`).
 * Renders the Radix Toast viewport (the live region) and manages toast state.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((item: Omit<ToastItem, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...item, id }]);
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="right">
        {children}

        {toasts.map((t) => (
          <RadixToast.Root
            key={t.id}
            duration={t.duration ?? 4000}
            onOpenChange={(open) => {
              if (!open) dismiss(t.id);
            }}
            className={[
              "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-80 data-[state=open]:fade-in-0",
              "data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full",
              "w-[min(360px,90vw)]",
              variantClasses[t.variant ?? "default"],
            ].join(" ")}
          >
            {/* Variant icon */}
            {t.variant === "success" && (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`mt-0.5 h-4 w-4 shrink-0 ${iconClasses.success}`}
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {t.variant === "danger" && (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`mt-0.5 h-4 w-4 shrink-0 ${iconClasses.danger}`}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}

            <div className="flex-1 min-w-0">
              <RadixToast.Title className="text-sm font-semibold">
                {t.title}
              </RadixToast.Title>
              {t.description && (
                <RadixToast.Description className="mt-0.5 text-xs text-fg-muted">
                  {t.description}
                </RadixToast.Description>
              )}
            </div>

            <RadixToast.Close asChild>
              <button
                aria-label="Dismiss notification"
                className={[
                  "shrink-0 rounded p-0.5 text-fg-muted hover:text-fg",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  "min-h-[44px] min-w-[44px] flex items-center justify-center -mr-1",
                ].join(" ")}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </RadixToast.Close>
          </RadixToast.Root>
        ))}

        {/* Viewport = the live region where toasts are announced + rendered */}
        <RadixToast.Viewport className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Imperative toast trigger. Call `toast({ title, description, variant })`.
 * Must be used inside `<ToastProvider>`.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}
