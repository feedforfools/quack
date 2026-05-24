import { forwardRef } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

/**
 * On/off switch built on Radix Switch.
 *
 * Themed with our design tokens. Off = `bg-bg-sunken`, On = `bg-accent`.
 * Track is 48×28, thumb 20×20 — comfortably above the 44 px hit target via
 * the surrounding row.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className = "", ...rest }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      className={[
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        "bg-bg-sunken data-[state=checked]:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-raised",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      <SwitchPrimitive.Thumb
        className={[
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow",
          "transition-transform duration-150",
          "translate-x-1 data-[state=checked]:translate-x-6",
        ].join(" ")}
      />
    </SwitchPrimitive.Root>
  ),
);
Switch.displayName = "Switch";
