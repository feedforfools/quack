import { forwardRef, useId, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label rendered above the input. */
  label: string;
  /** Optional helper text displayed below the input. */
  hint?: string;
  /** Error message — replaces hint and applies red styling when set. */
  error?: string;
}

/**
 * Labelled text input field.
 *
 * - Always renders a visible `<label>` tied to the input via a stable `useId()`.
 * - Error state: red border + `role="alert"` message; `aria-describedby` wired.
 * - Min height 44 px to satisfy tap-target requirements.
 * - Readonly when `disabled` — handled by native input attribute.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className = "", id: externalId, ...rest }, ref) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const descId = `${id}-desc`;
    const hasDesc = Boolean(hint ?? error);

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>

        <input
          ref={ref}
          id={id}
          aria-describedby={hasDesc ? descId : undefined}
          aria-invalid={error ? true : undefined}
          className={[
            "w-full rounded-xl border bg-bg-sunken px-4 py-3",
            "text-base text-fg placeholder:text-fg-subtle",
            "min-h-[44px]",
            "focus:outline-none focus-visible:ring-2",
            error
              ? "border-danger focus-visible:ring-danger/40"
              : "border-border focus-visible:border-accent focus-visible:ring-accent/40",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />

        {hasDesc && (
          <p
            id={descId}
            role={error ? "alert" : undefined}
            className={`text-xs ${error ? "text-danger" : "text-fg-muted"}`}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
