import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n";

const FLAG_CDN = "https://flagicons.lipis.dev/flags/4x3";

const FLAG_CODE: Record<SupportedLanguage, string> = {
  en: "gb",
  it: "it",
};

/**
 * Single-button language toggle showing a flat circular flag of the active language.
 * Clicking it cycles to the next available language.
 */
export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current =
    (SUPPORTED_LANGUAGES.find((l) =>
      i18n.language.startsWith(l),
    ) as SupportedLanguage) ?? SUPPORTED_LANGUAGES[0];

  function handleToggle() {
    const nextIndex =
      (SUPPORTED_LANGUAGES.indexOf(current) + 1) % SUPPORTED_LANGUAGES.length;
    void i18n.changeLanguage(SUPPORTED_LANGUAGES[nextIndex]);
  }

  const code = FLAG_CODE[current];

  return (
    <button
      onClick={handleToggle}
      aria-label={t("language.label")}
      title={t("language.label")}
      className={[
        "min-h-[44px] min-w-[44px] rounded-full",
        "flex items-center justify-center",
        "bg-bg-raised/70 shadow-sm ring-1 ring-border/60 backdrop-blur-md",
        "transition-all duration-150 hover:bg-bg-raised active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
      ].join(" ")}
    >
      <img
        src={`${FLAG_CDN}/${code}.svg`}
        alt={code}
        width={22}
        height={22}
        className="rounded-full object-cover ring-1 ring-border"
        style={{ aspectRatio: "1 / 1" }}
      />
    </button>
  );
}
