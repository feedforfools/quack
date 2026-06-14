import { useState, useId, useRef, useEffect, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { DISPLAY_NAME_MAX_LENGTH } from "./useDisplayName";

interface DisplayNamePromptProps {
  /**
   * Called when the user submits a valid name.
   * The string is already trimmed and within MAX_LENGTH.
   */
  onConfirm: (name: string) => void;
  /** Pre-fill the input when editing an existing name. */
  initialName?: string;
}

/**
 * Full-screen overlay that prompts the player to enter a display name.
 * Shown on first room interaction (create or join) and when the player
 * chooses to edit their name from the roster tile.
 *
 * TODO(E1-T5): Replace string literals with `t('identity.prompt.*')` calls
 *              once react-i18next is wired.
 */
export function DisplayNamePrompt({
  onConfirm,
  initialName = "",
}: DisplayNamePromptProps) {
  const [value, setValue] = useState(initialName);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = value.trim();
  const isValid = trimmed.length > 0;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValid) return;
    onConfirm(trimmed.slice(0, DISPLAY_NAME_MAX_LENGTH));
  }

  return (
    /* Overlay backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${inputId}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm animate-in fade-in-0"
    >
      {/* Panel */}
      <div className="w-full max-w-sm rounded-3xl border border-border/70 bg-bg-raised p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out">
        <h2
          id={`${inputId}-title`}
          className="mb-1 text-xl font-extrabold tracking-tight text-fg"
        >
          {t("identity.prompt.title")}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-fg-muted">
          {t("identity.prompt.subtitle")}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor={inputId} className="sr-only">
            {t("identity.prompt.label")}
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("identity.prompt.placeholder")}
            className={[
              "w-full rounded-full border bg-bg-sunken px-5 py-3",
              "text-base text-fg caret-accent placeholder:text-fg-subtle",
              "transition-[border-color,box-shadow] duration-150",
              "border-border focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40",
              "min-h-[48px]", // tap target
            ].join(" ")}
          />

          <button
            type="submit"
            disabled={!isValid}
            className={[
              "mt-4 w-full rounded-xl px-5 font-bold",
              "min-h-[48px] text-base", // tap target
              "bg-accent text-accent-ink shadow-glow",
              "transition-all duration-200 ease-out hover:bg-accent-hover active:scale-[0.97]",
              "disabled:cursor-not-allowed disabled:bg-accent/40 disabled:text-accent-ink/60 disabled:shadow-none disabled:active:scale-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            ].join(" ")}
          >
            {t("identity.prompt.cta")}
          </button>
        </form>
      </div>
    </div>
  );
}
