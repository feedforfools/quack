import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n";

/**
 * Compact EN / IT language toggle rendered in the app header.
 *
 * The active language button is `aria-pressed="true"` (toggle semantics).
 * Both buttons meet the 44×44 px tap-target minimum.
 */
export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = i18n.language as SupportedLanguage;

  function handleChange(lang: SupportedLanguage) {
    if (lang !== current) {
      void i18n.changeLanguage(lang);
    }
  }

  return (
    <nav aria-label={t("language.label")} className="flex gap-1">
      {SUPPORTED_LANGUAGES.map((lang) => {
        const isActive = current.startsWith(lang);
        return (
          <button
            key={lang}
            onClick={() => handleChange(lang)}
            aria-pressed={isActive}
            className={[
              "min-h-[44px] min-w-[44px] rounded-lg px-3 text-sm font-semibold uppercase",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              isActive
                ? "bg-accent text-accent-ink"
                : "bg-transparent text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {t(`language.${lang}`)}
          </button>
        );
      })}
    </nav>
  );
}
