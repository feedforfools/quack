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
    "bg-accent text-accent-ink hover:bg-accent-hover focus-visible:ring-accent/50 disabled:bg-accent/40 disabled:text-accent-ink/60",
  ghost:
    "bg-transparent text-fg border border-border hover:bg-bg-raised focus-visible:ring-fg/30 disabled:text-fg-subtle disabled:border-border",
  danger:
    "bg-danger text-danger-ink hover:bg-danger/90 focus-visible:ring-danger/50 disabled:bg-danger/40",
};

const sizeClasses: Record<Size, string> = {
  sm: "min-h-[44px] px-3 text-sm",
  md: "min-h-[44px] px-5 text-base",
  lg: "min-h-[52px] px-6 text-lg",
};

/**
 * Primary interactive button.
 *
 * - `variant`: "primary" (accent-fill) | "ghost" (outlined) | "danger" (red)
 * - `size`:    "sm" | "md" (default) | "lg"
 * - `loading`: shows a spinner, prevents clicks, and sets `aria-busy`
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
          "inline-flex items-center justify-center gap-2 rounded-xl font-semibold",
          "transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
          "disabled:cursor-not-allowed",
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
