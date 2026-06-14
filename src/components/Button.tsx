import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon } from "@iconify/react";

type Variant = "primary" | "ghost" | "danger";
type Size = "md" | "sm" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables interaction while true. */
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-glow hover:bg-accent-hover focus-visible:ring-accent/50 disabled:bg-accent/40 disabled:text-accent-ink/60 disabled:shadow-none",
  ghost:
    "border border-border bg-fg/[0.04] text-fg hover:bg-fg/[0.08] focus-visible:ring-accent/50 disabled:text-fg-subtle disabled:border-border disabled:bg-transparent",
  danger:
    "bg-danger text-danger-ink hover:bg-danger/90 focus-visible:ring-danger/50 disabled:bg-danger/40",
};

const sizeClasses: Record<Size, string> = {
  sm: "min-h-[44px] px-4 text-sm",
  md: "min-h-[48px] px-5 text-base",
  lg: "min-h-[56px] px-7 text-lg",
};

/**
 * Primary interactive button.
 *
 * - `variant`: "primary" (accent-fill) | "ghost" (outlined) | "danger" (red)
 * - `size`:    "sm" | "md" (default) | "lg"
 * - `loading`: shows a spinner, prevents clicks, and sets `aria-busy`
 * - Corners are softly rounded (rounded-xl) so buttons keep a rectangular
 *   silhouette rather than a pill shape.
 * - All tap targets are ≥ 44 × 44 CSS px.
 * - Focus ring visible on keyboard navigation only (`:focus-visible`).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      className = "",
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled ?? loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={[
          "inline-flex select-none items-center justify-center gap-2 rounded-xl font-bold",
          "whitespace-nowrap",
          "transition-all duration-200 ease-out",
          "active:scale-[0.97]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
          "disabled:cursor-not-allowed disabled:active:scale-100",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {loading && (
          <Icon
            aria-hidden="true"
            icon="lucide:loader-2"
            className="h-4 w-4 animate-spin"
          />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
