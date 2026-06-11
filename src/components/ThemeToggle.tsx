import { useRef } from "react";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";

// View Transitions API — only available in modern browsers.
type DocWithVT = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

/**
 * Single-button theme toggle showing a sun (→ switch to light) or moon (→ switch to dark).
 * Fires a radial clip-path ripple centred on the button via the View Transitions API.
 */
export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const label = isDark ? t("theme.switchToLight") : t("theme.switchToDark");
  const buttonRef = useRef<HTMLButtonElement>(null);

  function handleToggle() {
    // Pin the ripple origin to the button centre.
    const rect = buttonRef.current?.getBoundingClientRect();
    document.documentElement.style.setProperty(
      "--theme-x",
      rect
        ? `${Math.round(rect.left + rect.width / 2)}px`
        : "calc(100vw - 2rem)",
    );
    document.documentElement.style.setProperty(
      "--theme-y",
      rect ? `${Math.round(rect.top + rect.height / 2)}px` : "2rem",
    );

    const doc = document as DocWithVT;
    if (doc.startViewTransition) {
      doc.startViewTransition(toggleTheme);
    } else {
      toggleTheme();
    }
  }

  return (
    <button
      ref={buttonRef}
      onClick={handleToggle}
      aria-label={label}
      title={label}
      className={[
        "min-h-[44px] min-w-[44px] rounded-full",
        "flex items-center justify-center",
        "bg-bg-raised/70 shadow-sm ring-1 ring-border/60 backdrop-blur-md",
        "transition-all duration-150 hover:bg-bg-raised active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
      ].join(" ")}
    >
      <Icon
        icon={isDark ? "ph:sun-bold" : "ph:moon-bold"}
        className="text-fg"
        width={22}
        height={22}
      />
    </button>
  );
}
