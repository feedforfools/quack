import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { WORD_POOL_CATEGORIES, type WordPoolCategory } from "@/lib/words";
import type { RoomConfig } from "./roomConfig";
import { SettingRow, StepperButton } from "./settingsControls";

const TIMER_OPTIONS = [0, 60, 120, 180, 300] as const;
const MAX_IMPOSTERS = 9;

export interface BasicSettingsFieldsProps {
  config: RoomConfig;
  onChange: (config: RoomConfig) => void;
  disabled?: boolean;
  showSectionLabel?: boolean;
  idPrefix?: string;
}

export function BasicSettingsFields({
  config,
  onChange,
  disabled = false,
  showSectionLabel = false,
  idPrefix = "setting",
}: BasicSettingsFieldsProps) {
  const { t } = useTranslation();

  const update = useCallback(
    <K extends keyof RoomConfig>(key: K, value: RoomConfig[K]) => {
      if (disabled) return;
      onChange({ ...config, [key]: value });
    },
    [config, disabled, onChange],
  );

  const toggleCategory = useCallback(
    (category: WordPoolCategory) => {
      if (disabled) return;
      const hasCategory = config.categories.includes(category);
      if (hasCategory && config.categories.length === 1) return;

      const categories = hasCategory
        ? config.categories.filter((item) => item !== category)
        : [...config.categories, category];

      onChange({ ...config, categories });
    },
    [config, disabled, onChange],
  );

  const timerLabel = (seconds: number) =>
    seconds === 0
      ? t("settings.timerOff")
      : seconds < 120
        ? t("settings.timer_1min")
        : seconds < 180
          ? t("settings.timer_2min")
          : seconds < 300
            ? t("settings.timer_3min")
            : t("settings.timer_5min");

  return (
    <>
      {showSectionLabel && (
        <div className="pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t("settings.basicSection")}
          </p>
        </div>
      )}

      <SettingRow label={t("settings.language")}>
        <div
          className="flex gap-2"
          role="group"
          aria-label={t("settings.language")}
        >
          {(["en", "it"] as const).map((language) => (
            <button
              key={language}
              type="button"
              aria-pressed={config.language === language}
              onClick={() => update("language", language)}
              disabled={disabled}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                config.language === language
                  ? "bg-accent text-black"
                  : "bg-bg text-fg hover:bg-fg/10",
              ].join(" ")}
            >
              {language.toUpperCase()}
            </button>
          ))}
        </div>
      </SettingRow>

      <div className="py-3">
        <p className="mb-2 text-sm font-medium text-fg">
          {t("settings.categories")}
        </p>
        <div className="flex flex-wrap gap-2">
          {WORD_POOL_CATEGORIES.map((category) => {
            const selected = config.categories.includes(category);

            return (
              <button
                key={category}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleCategory(category)}
                disabled={disabled}
                className={[
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  selected
                    ? "bg-accent text-black"
                    : "bg-bg text-fg hover:bg-fg/10",
                ].join(" ")}
              >
                {t(`settings.category_${category}` as `settings.category_food`)}
              </button>
            );
          })}
        </div>
      </div>

      <SettingRow label={t("settings.imposterCount")}>
        <div className="flex items-center gap-3">
          <StepperButton
            label="−"
            onClick={() => update("imposter_count", config.imposter_count - 1)}
            disabled={disabled || config.imposter_count <= 1}
          />
          <span className="w-6 text-center text-lg font-bold text-fg">
            {config.imposter_count}
          </span>
          <StepperButton
            label="+"
            onClick={() => update("imposter_count", config.imposter_count + 1)}
            disabled={disabled || config.imposter_count >= MAX_IMPOSTERS}
          />
        </div>
      </SettingRow>

      <SettingRow
        label={t("settings.timerDuration")}
        htmlFor={`${idPrefix}-timer`}
      >
        <select
          id={`${idPrefix}-timer`}
          value={config.timer_seconds}
          onChange={(event) =>
            update("timer_seconds", Number(event.target.value))
          }
          disabled={disabled}
          className="rounded-lg bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {TIMER_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {timerLabel(seconds)}
            </option>
          ))}
        </select>
      </SettingRow>
    </>
  );
}
