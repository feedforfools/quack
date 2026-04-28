import { forwardRef, type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Extra vertical + horizontal padding variant. Default: "md". */
  padding?: "sm" | "md" | "lg";
}

const paddingClasses = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

/**
 * Raised surface container for grouping related content.
 * Uses `bg-raised` and a subtle border — sits one step above the page background.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding = "md", className = "", children, ...rest }, ref) => (
    <div
      ref={ref}
      className={[
        "rounded-2xl border border-border bg-bg-raised",
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  ),
);
Card.displayName = "Card";
