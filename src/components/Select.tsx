import { forwardRef } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Icon } from "@iconify/react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Accessible label — required for screen readers. */
  ariaLabel: string;
  disabled?: boolean;
  /** Optional class on the trigger button. */
  triggerClassName?: string;
  /** Optional class on the value text (e.g. fixed width). */
  valueClassName?: string;
  /** Optional placeholder shown when value is empty. */
  placeholder?: string;
}

/**
 * Themed dropdown built on Radix Select.
 *
 * Replaces native `<select>` so the popover sits inside our design system —
 * same tokens, same radii, consistent across iOS/Android/desktop.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      value,
      onValueChange,
      options,
      ariaLabel,
      disabled,
      triggerClassName = "",
      valueClassName = "",
      placeholder,
    },
    ref,
  ) => (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        aria-label={ariaLabel}
        className={[
          "inline-flex h-10 min-w-[6.5rem] items-center justify-between gap-2 rounded-full bg-bg-sunken px-4",
          "text-sm font-bold text-fg ring-1 ring-inset ring-border/60 transition-colors",
          "hover:bg-fg/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[state=open]:ring-2 data-[state=open]:ring-accent/50",
          triggerClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <SelectPrimitive.Value placeholder={placeholder}>
          <span className={["block truncate", valueClassName].join(" ")}>
            {options.find((o) => o.value === value)?.label ?? placeholder ?? ""}
          </span>
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <Icon
            icon="lucide:chevron-down"
            className="h-4 w-4 text-fg-muted"
            aria-hidden="true"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={[
            "z-[60] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-border/70 bg-bg-raised shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          ].join(" ")}
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className={[
                  "relative flex h-10 cursor-pointer select-none items-center rounded-xl pl-8 pr-3",
                  "text-sm font-medium text-fg outline-none transition-colors",
                  "data-[highlighted]:bg-fg/10",
                  "data-[state=checked]:font-bold data-[state=checked]:text-accent",
                  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                ].join(" ")}
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex h-4 w-4 items-center justify-center">
                  <Icon
                    icon="lucide:check"
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  ),
);
Select.displayName = "Select";
