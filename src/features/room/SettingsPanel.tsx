/**
 * SettingsPanel — collapsible host-only game-settings form (E5-T1).
 *
 * Rendered in the lobby below the QR code, visible only to the host.
 * Changes are persisted immediately to `rooms.config` via `onSave`.
 * The panel is disabled (read-only) once a game starts (frozen in
 * `config_snapshot` at that point).
 */
import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { WORD_POOL_CATEGORIES, type WordPoolCategory } from "@/lib/words";
import type { RoomConfig } from "./roomConfig";

/* ── constants ─────────────────────────────────────────────────────────────── */

const TIMER_OPTIONS = [0, 60, 120, 180, 300] as const;
const VOTING_DURATION_OPTIONS = [30, 60, 90, 120] as const;
const VOTE_THRESHOLD_OPTIONS = [0.5, 0.67, 1.0] as const;
const HINT_COUNT_OPTIONS = [0, 1, 2] as const;
const MAX_IMPOSTERS = 9;

/* ── helpers ────────────────────────────────────────────────────────────────── */

function StepperButton({
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

function SettingRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
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

/* ── component ──────────────────────────────────────────────────────────────── */

export interface SettingsPanelProps {
  config: RoomConfig;
  onSave: (config: RoomConfig) => Promise<boolean>;
  saving: boolean;
  /** True while a game is active — settings are frozen / displayed read-only. */
  disabled: boolean;
}

export function SettingsPanel({
  config,
  onSave,
  saving,
  disabled,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<RoomConfig>(config);

  // Sync local state when the server-side config changes (e.g. after a reload).
  useEffect(() => {
    setLocal(config);
  }, [config]);

  /** Apply a partial update to local state and persist immediately. */
  const update = useCallback(
    <K extends keyof RoomConfig>(key: K, value: RoomConfig[K]) => {
      if (disabled) return;
      const next: RoomConfig = { ...local, [key]: value };
      setLocal(next);
      void onSave(next);
    },
    [disabled, local, onSave],
  );

  const toggleCategory = useCallback(
    (cat: WordPoolCategory) => {
      if (disabled) return;
      const has = local.categories.includes(cat);
      // Must keep at least one category selected.
      if (has && local.categories.length === 1) return;
      const next = has
        ? local.categories.filter((c) => c !== cat)
        : [...local.categories, cat];
      update("categories", next);
    },
    [disabled, local.categories, update],
  );

  const timerLabel = (s: number) =>
    s === 0
      ? t("settings.timerOff")
      : s < 120
        ? t("settings.timer_1min")
        : s < 180
          ? t("settings.timer_2min")
          : s < 300
            ? t("settings.timer_3min")
            : t("settings.timer_5min");

  const votingDurationLabel = (s: number) => `${s}s`;

  const thresholdLabel = (f: number) =>
    f >= 1
      ? t("settings.threshold_all")
      : f >= 0.67
        ? t("settings.threshold_two_thirds")
        : t("settings.threshold_half");

  const hintLabel = (n: number) =>
    n === 0
      ? t("settings.hintCount_none")
      : n === 1
        ? t("settings.hintCount_one")
        : t("settings.hintCount_two_plus", { count: n });

  return (
    <div className="mt-6 rounded-xl border border-border bg-bg-raised">
      {/* Collapsible header */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="settings-body"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-fg transition-colors hover:bg-fg/5"
      >
        <span className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-fg-muted"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456L7.84 1.804ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              clipRule="evenodd"
            />
          </svg>
          {t("settings.title")}
          {saving && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          )}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={[
            "h-4 w-4 text-fg-muted transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Settings body */}
      {open && (
        <div
          id="settings-body"
          className={[
            "divide-y divide-border px-4 pb-4",
            disabled ? "pointer-events-none opacity-50" : "",
          ].join(" ")}
          aria-disabled={disabled}
        >
          {disabled && (
            <p className="py-2 text-xs text-fg-muted">
              {t("settings.frozenNote")}
            </p>
          )}

          {/* ── Language ───────────────────────────────────────────────────── */}
          <SettingRow label={t("settings.language")}>
            <div
              className="flex gap-2"
              role="group"
              aria-label={t("settings.language")}
            >
              {(["en", "it"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  aria-pressed={local.language === lang}
                  onClick={() => update("language", lang)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                    local.language === lang
                      ? "bg-accent text-black"
                      : "bg-bg text-fg hover:bg-fg/10",
                  ].join(" ")}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </SettingRow>

          {/* ── Categories ─────────────────────────────────────────────────── */}
          <div className="py-3">
            <p className="mb-2 text-sm font-medium text-fg">
              {t("settings.categories")}
            </p>
            <div className="flex flex-wrap gap-2">
              {WORD_POOL_CATEGORIES.map((cat) => {
                const selected = local.categories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleCategory(cat)}
                    className={[
                      "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                      selected
                        ? "bg-accent text-black"
                        : "bg-bg text-fg hover:bg-fg/10",
                    ].join(" ")}
                  >
                    {t(`settings.category_${cat}` as `settings.category_food`)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Imposters ──────────────────────────────────────────────────── */}
          <SettingRow label={t("settings.imposterCount")}>
            <div className="flex items-center gap-3">
              <StepperButton
                label="−"
                onClick={() =>
                  update("imposter_count", local.imposter_count - 1)
                }
                disabled={local.imposter_count <= 1}
              />
              <span className="w-6 text-center text-lg font-bold text-fg">
                {local.imposter_count}
              </span>
              <StepperButton
                label="+"
                onClick={() =>
                  update("imposter_count", local.imposter_count + 1)
                }
                disabled={local.imposter_count >= MAX_IMPOSTERS}
              />
            </div>
          </SettingRow>

          {/* ── Imposters see each other ───────────────────────────────────── */}
          <SettingRow
            label={t("settings.impostersSeeEachOther")}
            htmlFor="setting-imposters-see"
          >
            <input
              id="setting-imposters-see"
              type="checkbox"
              checked={local.imposters_see_each_other}
              onChange={(e) =>
                update("imposters_see_each_other", e.target.checked)
              }
              className="h-5 w-5 cursor-pointer accent-accent"
            />
          </SettingRow>

          {/* ── Imposter hints ─────────────────────────────────────────────── */}
          <SettingRow label={t("settings.imposterHintCount")}>
            <div
              className="flex gap-1"
              role="group"
              aria-label={t("settings.imposterHintCount")}
            >
              {HINT_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={local.imposter_hint_count === n}
                  onClick={() => update("imposter_hint_count", n)}
                  className={[
                    "min-w-[2.5rem] rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors",
                    local.imposter_hint_count === n
                      ? "bg-accent text-black"
                      : "bg-bg text-fg hover:bg-fg/10",
                  ].join(" ")}
                >
                  {hintLabel(n)}
                </button>
              ))}
            </div>
          </SettingRow>

          {/* ── Number of games ────────────────────────────────────────────── */}
          <SettingRow label={t("settings.numGames")}>
            <div className="flex items-center gap-3">
              <StepperButton
                label="−"
                onClick={() => update("num_games", local.num_games - 1)}
                disabled={local.num_games <= 1}
              />
              <span className="w-6 text-center text-lg font-bold text-fg">
                {local.num_games}
              </span>
              <StepperButton
                label="+"
                onClick={() => update("num_games", local.num_games + 1)}
                disabled={local.num_games >= 20}
              />
            </div>
          </SettingRow>

          {/* ── Discussion timer ───────────────────────────────────────────── */}
          <SettingRow
            label={t("settings.timerDuration")}
            htmlFor="setting-timer"
          >
            <select
              id="setting-timer"
              value={local.timer_seconds}
              onChange={(e) => update("timer_seconds", Number(e.target.value))}
              className="rounded-lg bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {TIMER_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {timerLabel(s)}
                </option>
              ))}
            </select>
          </SettingRow>

          {/* ── Voting section header ──────────────────────────────────────── */}
          <div className="pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t("settings.votingSection")}
            </p>
          </div>

          {/* ── Call-to-vote threshold ─────────────────────────────────────── */}
          <SettingRow
            label={t("settings.voteThreshold")}
            htmlFor="setting-threshold"
          >
            <select
              id="setting-threshold"
              value={local.vote_threshold_fraction}
              onChange={(e) =>
                update("vote_threshold_fraction", Number(e.target.value))
              }
              className="rounded-lg bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {VOTE_THRESHOLD_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {thresholdLabel(f)}
                </option>
              ))}
            </select>
          </SettingRow>

          {/* ── Voting duration ────────────────────────────────────────────── */}
          <SettingRow
            label={t("settings.votingDuration")}
            htmlFor="setting-voting-duration"
          >
            <select
              id="setting-voting-duration"
              value={local.voting_duration_seconds}
              onChange={(e) =>
                update("voting_duration_seconds", Number(e.target.value))
              }
              className="rounded-lg bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {VOTING_DURATION_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {votingDurationLabel(s)}
                </option>
              ))}
            </select>
          </SettingRow>

          {/* ── Live vote tally ────────────────────────────────────────────── */}
          <SettingRow
            label={t("settings.liveVoteTally")}
            htmlFor="setting-live-tally"
          >
            <input
              id="setting-live-tally"
              type="checkbox"
              checked={local.live_vote_tally}
              onChange={(e) => update("live_vote_tally", e.target.checked)}
              className="h-5 w-5 cursor-pointer accent-accent"
            />
          </SettingRow>
        </div>
      )}
    </div>
  );
}
