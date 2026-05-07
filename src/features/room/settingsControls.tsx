import type { ReactNode } from "react";

export function StepperButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-raised text-lg font-bold text-fg transition-colors hover:bg-fg/10 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {label}
    </button>
  );
}

export function SettingRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <label
        htmlFor={htmlFor}
        className="min-w-0 flex-1 text-sm font-medium text-fg"
      >
        {label}
      </label>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
