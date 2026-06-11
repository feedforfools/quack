import * as RadixToast from "@radix-ui/react-toast";
import { Icon } from "@iconify/react";
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
  default: "border-border/80 bg-bg-raised/95 text-fg",
  success: "border-success/40 bg-bg-raised/95 text-fg",
  danger: "border-danger/40 bg-bg-raised/95 text-fg",
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
              "flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-80 data-[state=open]:fade-in-0",
              "data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full",
              "data-[state=open]:duration-300 data-[state=open]:ease-out",
              "w-[min(360px,calc(100vw-2rem))]",
              variantClasses[t.variant ?? "default"],
            ].join(" ")}
          >
            {/* Variant icon */}
            {t.variant === "success" && (
              <Icon
                aria-hidden="true"
                icon="lucide:check"
                className={`mt-0.5 h-4 w-4 shrink-0 ${iconClasses.success}`}
              />
            )}
            {t.variant === "danger" && (
              <Icon
                aria-hidden="true"
                icon="lucide:alert-circle"
                className={`mt-0.5 h-4 w-4 shrink-0 ${iconClasses.danger}`}
              />
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
                <Icon aria-hidden="true" icon="lucide:x" className="h-4 w-4" />
              </button>
            </RadixToast.Close>
          </RadixToast.Root>
        ))}

        {/* Viewport = the live region where toasts are announced + rendered.
            Bottom-centred for one-hand reach on phones; respects the iOS
            home-indicator safe area. */}
        <RadixToast.Viewport className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 outline-none" />
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
