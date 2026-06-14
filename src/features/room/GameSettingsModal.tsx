import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@iconify/react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Modal, Switch, Select, Button } from "@/components";
import { WORD_POOL_CATEGORIES, type WordPoolCategory } from "@/lib/words";
import { getGameModeOption } from "./gameModes";
import { GameList } from "./GameList";
import {
  MAX_ROUNDS_MIN,
  MAX_ROUNDS_MAX,
  type GameType,
  type RoomConfig,
  type RoundMode,
} from "./roomConfig";

const TIMER_OPTIONS = [0, 180, 300, 420, 600] as const;
const HINT_COUNT_OPTIONS = [0, 1, 2] as const;
const MAX_IMPOSTERS = 9;

type SettingsView = "settings" | "game-picker";
type ImposterTab = "words" | "roles" | "vote";

const CATEGORY_LABEL_KEYS = {
  easy: "settings.category_easy",
  entertainment: "settings.category_entertainment",
  everyday: "settings.category_everyday",
  animals: "settings.category_animals",
  sports: "settings.category_sports",
  school: "settings.category_school",
  celebrities: "settings.category_celebrities",
  spicy: "settings.category_spicy",
  food: "settings.category_food",
  professions: "settings.category_professions",
  internet: "settings.category_internet",
  retro: "settings.category_retro",
  fantasy: "settings.category_fantasy",
  science: "settings.category_science",
  music: "settings.category_music",
  world: "settings.category_world",
} as const satisfies Record<WordPoolCategory, string>;

export interface GameSettingsModalProps {
  open: boolean;
  onClose: () => void;
  config: RoomConfig;
  onSave: (config: RoomConfig) => Promise<boolean>;
  saving: boolean;
  disabled: boolean;
  readOnlyReason?: string;
}

export function GameSettingsModal({
  open,
  onClose,
  config,
  onSave,
  saving,
  disabled,
  readOnlyReason,
}: GameSettingsModalProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<SettingsView>("settings");
  const [activeTab, setActiveTab] = useState<ImposterTab>("words");
  const [local, setLocal] = useState<RoomConfig>(config);

  // Reset local state to the committed config whenever the modal opens.
  // Intentionally only dep on `open` so in-progress edits aren't clobbered
  // by real-time parent updates while the user is editing.
  useEffect(() => {
    if (!open) return;
    setLocal(config);
    setView("settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = useCallback(
    <Key extends keyof RoomConfig>(key: Key, value: RoomConfig[Key]) => {
      if (disabled) return;
      const next = { ...local, [key]: value };
      setLocal(next);
    },
    [disabled, local],
  );

  const toggleCategory = useCallback(
    (category: WordPoolCategory) => {
      if (disabled) return;
      const hasCategory = local.categories.includes(category);
      if (hasCategory && local.categories.length === 1) return;

      const categories = hasCategory
        ? local.categories.filter((item) => item !== category)
        : [...local.categories, category];

      const next = { ...local, categories };
      setLocal(next);
    },
    [disabled, local],
  );

  const selectedGame = getGameModeOption(local.game_type);

  const handleSelectGame = (gameType: GameType) => {
    update("game_type", gameType);
    setView("settings");
  };

  const handleSave = useCallback(async () => {
    const ok = await onSave(local);
    if (ok) onClose();
  }, [local, onSave, onClose]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("settings.title")}
      contentClassName="h-[calc(100svh-2rem)] sm:h-[40rem]"
      bodyClassName="flex min-h-0 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {view === "settings" ? (
          <>
            <GameCard
              option={selectedGame}
              disabled={disabled}
              onChange={() => setView("game-picker")}
            />

            {disabled ? (
              local.game_type === "imposter" ? (
                <ImposterSummaryTabs
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  config={local}
                  readOnlyReason={readOnlyReason}
                />
              ) : (
                <UnavailableGamePanel gameType={local.game_type} />
              )
            ) : local.game_type === "imposter" ? (
              <ImposterSettingsTabs
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                local={local}
                update={update}
                toggleCategory={toggleCategory}
              />
            ) : (
              <UnavailableGamePanel gameType={local.game_type} />
            )}
          </>
        ) : (
          <GamePickerView
            selectedGameType={local.game_type}
            disabled={disabled}
            onBack={() => setView("settings")}
            onSelectGame={handleSelectGame}
          />
        )}
      </div>

      {!disabled && view === "settings" && (
        <div className="flex flex-none gap-3 border-t border-border/60 pt-4">
          <Button variant="ghost" className="flex-1" onClick={handleCancel}>
            {t("settings.cancel")}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            loading={saving}
            onClick={() => void handleSave()}
          >
            {t("settings.save")}
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ─── Header game card ──────────────────────────────────────────────────────

function GameCard({
  option,
  disabled,
  onChange,
}: {
  option: ReturnType<typeof getGameModeOption>;
  disabled: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();

  const content = (
    <>
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${option.iconBg}`}
      >
        <Icon
          icon={option.icon}
          className={`h-7 w-7 ${option.iconColor}`}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-tight text-fg">
          {t(option.titleKey)}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-fg-muted">
          {t(option.descriptionKey)}
        </span>
      </span>
    </>
  );

  if (disabled) {
    return (
      <div className="flex w-full items-center gap-3 rounded-2xl bg-bg-sunken px-4 py-3 text-left ring-1 ring-inset ring-border/40">
        {content}
        <button
          type="button"
          aria-label={t("create.gameInfoLabel")}
          onClick={(e) => {
            e.stopPropagation();
            // Game info modal — coming in a later stage
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fg/10 text-fg-muted transition-all hover:bg-fg/15 active:scale-95"
        >
          <Icon
            icon="ph:info-bold"
            className="h-[17px] w-[17px]"
            aria-hidden="true"
          />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={t("settings.changeGameMode")}
      className={[
        "flex w-full items-center gap-3 rounded-2xl bg-bg-sunken px-4 py-3 text-left ring-1 ring-inset ring-border/40",
        "transition-[background-color,transform] duration-150 hover:bg-fg/10 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
      ].join(" ")}
    >
      {content}
      <Icon
        icon="lucide:chevron-right"
        className="h-5 w-5 shrink-0 text-fg-muted"
        aria-hidden="true"
      />
    </button>
  );
}

// ─── Tabs shell (shared between editable and read-only views) ─────────────

function ImposterTabsShell({
  activeTab,
  setActiveTab,
  words,
  roles,
  vote,
}: {
  activeTab: ImposterTab;
  setActiveTab: (tab: ImposterTab) => void;
  words: ReactNode;
  roles: ReactNode;
  vote: ReactNode;
}) {
  const { t } = useTranslation();
  const tabs: { id: ImposterTab; icon: string; label: string }[] = [
    { id: "words", icon: "lucide:languages", label: t("settings.wordsTab") },
    { id: "roles", icon: "lucide:users", label: t("settings.rolesTab") },
    { id: "vote", icon: "lucide:vote", label: t("settings.voteTab") },
  ];

  return (
    <TabsPrimitive.Root
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as ImposterTab)}
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <TabsPrimitive.List
        aria-label={t("settings.tabsLabel")}
        className="grid flex-none grid-cols-3 gap-1 rounded-full bg-bg-sunken p-1 ring-1 ring-inset ring-border/40"
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.id}
            value={tab.id}
            className={[
              "flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              "text-fg-muted hover:text-fg",
              "data-[state=active]:bg-accent data-[state=active]:text-accent-ink data-[state=active]:shadow-sm data-[state=active]:hover:text-accent-ink",
            ].join(" ")}
          >
            <Icon icon={tab.icon} className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      {/* Each tab manages its own scrolling: Words keeps a fixed-height isle
          with the category chips scrolling inside it; the other tabs scroll
          as a whole if they ever outgrow the panel. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <TabsPrimitive.Content
          value="words"
          className="h-full focus-visible:outline-none"
        >
          {words}
        </TabsPrimitive.Content>
        <TabsPrimitive.Content
          value="roles"
          className="h-full overflow-y-auto focus-visible:outline-none"
        >
          {roles}
        </TabsPrimitive.Content>
        <TabsPrimitive.Content
          value="vote"
          className="h-full overflow-y-auto focus-visible:outline-none"
        >
          {vote}
        </TabsPrimitive.Content>
      </div>
    </TabsPrimitive.Root>
  );
}

// ─── Tabs (host, imposter mode) ────────────────────────────────────────────

function ImposterSettingsTabs({
  activeTab,
  setActiveTab,
  local,
  update,
  toggleCategory,
}: {
  activeTab: ImposterTab;
  setActiveTab: (tab: ImposterTab) => void;
  local: RoomConfig;
  update: <Key extends keyof RoomConfig>(
    key: Key,
    value: RoomConfig[Key],
  ) => void;
  toggleCategory: (category: WordPoolCategory) => void;
}) {
  return (
    <ImposterTabsShell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      words={
        <WordsTab
          local={local}
          update={update}
          toggleCategory={toggleCategory}
        />
      }
      roles={<RolesTab local={local} update={update} />}
      vote={<VoteTab local={local} update={update} />}
    />
  );
}

// ─── Row primitives ────────────────────────────────────────────────────────

/** A grouped list of rows on a single sunken surface, separated by hairlines. */
function RowGroup({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-bg-sunken ring-1 ring-inset ring-border/40">
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[3.5rem] items-center justify-between gap-3 px-4 py-2">
      <span className="min-w-0 text-sm font-medium leading-snug text-fg">
        {label}
      </span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Segmented control built from buttons; consistent style for small option sets. */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-full bg-bg p-1 ring-1 ring-inset ring-border/40"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={[
              "h-8 min-w-10 rounded-full px-3 text-xs font-bold uppercase transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              selected
                ? "bg-accent text-accent-ink shadow-sm"
                : "text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Tabs content ──────────────────────────────────────────────────────────

function WordsTab({
  local,
  update,
  toggleCategory,
}: {
  local: RoomConfig;
  update: <Key extends keyof RoomConfig>(
    key: Key,
    value: RoomConfig[Key],
  ) => void;
  toggleCategory: (category: WordPoolCategory) => void;
}) {
  const { t } = useTranslation();

  return (
    /* Fixed-height isle: the language row stays put, the category chips
       scroll inside the remaining space. */
    <div className="flex h-full flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-bg-sunken ring-1 ring-inset ring-border/40">
      <div className="shrink-0">
        <Row label={t("settings.language")}>
          <Segmented<"en" | "it">
            ariaLabel={t("settings.language")}
            value={local.language}
            onChange={(v) => update("language", v)}
            options={[
              { value: "en", label: "EN" },
              { value: "it", label: "IT" },
            ]}
          />
        </Row>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <p className="mb-2.5 shrink-0 text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {t("settings.categories")}
        </p>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <div className="flex flex-wrap gap-2 pb-1">
            {WORD_POOL_CATEGORIES.map((category) => {
              const selected = local.categories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCategory(category)}
                  className={[
                    "h-8 rounded-full px-3.5 text-sm font-semibold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    selected
                      ? "bg-accent text-accent-ink shadow-sm"
                      : "bg-bg text-fg-muted ring-1 ring-inset ring-border/40 hover:text-fg",
                  ].join(" ")}
                >
                  {t(CATEGORY_LABEL_KEYS[category])}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function RolesTab({
  local,
  update,
}: {
  local: RoomConfig;
  update: <Key extends keyof RoomConfig>(
    key: Key,
    value: RoomConfig[Key],
  ) => void;
}) {
  const { t } = useTranslation();

  return (
    <RowGroup>
      <Row label={t("settings.imposterCount")}>
        <Stepper
          value={local.imposter_count}
          min={1}
          max={MAX_IMPOSTERS}
          onChange={(v) => update("imposter_count", v)}
          ariaLabel={t("settings.imposterCount")}
        />
      </Row>

      <Row label={t("settings.imposterHintCount")}>
        <Segmented<number>
          ariaLabel={t("settings.imposterHintCount")}
          value={local.imposter_hint_count}
          onChange={(v) => update("imposter_hint_count", v)}
          options={HINT_COUNT_OPTIONS.map((count) => ({
            value: count,
            label:
              count === 0
                ? t("settings.hintCount_none")
                : count === 1
                  ? t("settings.hintCount_one")
                  : t("settings.hintCount_two_plus", { count }),
          }))}
        />
      </Row>

      <Row label={t("settings.impostersSeeEachOther")}>
        <Switch
          aria-label={t("settings.impostersSeeEachOther")}
          checked={local.imposters_see_each_other}
          onCheckedChange={(checked) =>
            update("imposters_see_each_other", checked)
          }
        />
      </Row>
    </RowGroup>
  );
}

function VoteTab({
  local,
  update,
}: {
  local: RoomConfig;
  update: <Key extends keyof RoomConfig>(
    key: Key,
    value: RoomConfig[Key],
  ) => void;
}) {
  const { t } = useTranslation();

  const timerLabel = (seconds: number) =>
    seconds === 0
      ? t("settings.timerOff")
      : seconds <= 180
        ? t("settings.timer_3min")
        : seconds <= 300
          ? t("settings.timer_5min")
          : seconds <= 420
            ? t("settings.timer_7min")
            : t("settings.timer_10min");

  // Deliberately lean: the call-to-vote threshold is a fixed strict majority,
  // the voting timer is fixed at 30s, and both vote-count reveals are always
  // on — none of those need a knob.
  return (
    <RowGroup>
      {/* Game flow: one single vote, or elimination rounds until the
          imposters are caught / reach parity / survive max_rounds. */}
      <Row label={t("settings.roundMode")}>
        <Segmented<RoundMode>
          ariaLabel={t("settings.roundMode")}
          value={local.round_mode}
          onChange={(v) => update("round_mode", v)}
          options={[
            { value: "single", label: t("settings.roundMode_single") },
            { value: "multi", label: t("settings.roundMode_multi") },
          ]}
        />
      </Row>

      {local.round_mode === "multi" && (
        <Row label={t("settings.maxRounds")}>
          <Stepper
            value={local.max_rounds}
            min={MAX_ROUNDS_MIN}
            max={MAX_ROUNDS_MAX}
            onChange={(v) => update("max_rounds", v)}
            ariaLabel={t("settings.maxRounds")}
          />
        </Row>
      )}

      {/* Round mode has no discussion timer — the host paces each round. */}
      {local.round_mode === "single" && (
        <Row label={t("settings.timerDuration")}>
          <Select
            ariaLabel={t("settings.timerDuration")}
            value={String(local.timer_seconds)}
            onValueChange={(v) => update("timer_seconds", Number(v))}
            options={TIMER_OPTIONS.map((seconds) => ({
              value: String(seconds),
              label: timerLabel(seconds),
            }))}
          />
        </Row>
      )}

      <Row label={t("settings.callToVote")}>
        <Switch
          aria-label={t("settings.callToVote")}
          checked={local.call_to_vote}
          onCheckedChange={(checked) => update("call_to_vote", checked)}
        />
      </Row>
    </RowGroup>
  );
}

// ─── Stepper ────────────────────────────────────────────────────────────────

/**
 * Increment/decrement control. Styled after the Switch track (same sunken
 * surface + hairline ring) so every control in the settings rows shares one
 * visual family.
 */
const STEPPER_BUTTON_CLASSES = [
  "flex h-9 w-9 items-center justify-center rounded-full",
  "bg-bg-sunken text-fg ring-1 ring-inset ring-border/80",
  "transition-all hover:bg-fg/10 active:scale-95",
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
].join(" ");

function Stepper({
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={t("settings.decreaseSetting", { label: ariaLabel })}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={STEPPER_BUTTON_CLASSES}
      >
        <Icon icon="lucide:minus" className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="w-6 text-center text-lg font-bold tabular-nums text-fg">
        {value}
      </span>
      <button
        type="button"
        aria-label={t("settings.increaseSetting", { label: ariaLabel })}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={STEPPER_BUTTON_CLASSES}
      >
        <Icon icon="lucide:plus" className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ─── Read-only tabs (non-host, or host with locked round) ─────────────────

function ImposterSummaryTabs({
  activeTab,
  setActiveTab,
  config,
  readOnlyReason,
}: {
  activeTab: ImposterTab;
  setActiveTab: (tab: ImposterTab) => void;
  config: RoomConfig;
  readOnlyReason?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {readOnlyReason && (
        <p className="flex-none text-xs leading-snug text-fg-muted">
          {readOnlyReason}
        </p>
      )}
      <ImposterTabsShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        words={<WordsSummary config={config} />}
        roles={<RolesSummary config={config} />}
        vote={<VoteSummary config={config} />}
      />
    </div>
  );
}

function WordsSummary({ config }: { config: RoomConfig }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-bg-sunken ring-1 ring-inset ring-border/40">
      <div className="shrink-0">
        <SummaryRow
          label={t("settings.language")}
          value={config.language.toUpperCase()}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <p className="mb-2.5 shrink-0 text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {t("settings.categories")}
        </p>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <div className="flex flex-wrap gap-2 pb-1">
            {config.categories.length === 0 ? (
              <span className="text-sm text-fg-muted">
                {t("settings.summary_off")}
              </span>
            ) : (
              config.categories.map((category) => (
                <span
                  key={category}
                  className="h-8 rounded-full bg-accent px-3.5 text-sm font-semibold leading-8 text-accent-ink shadow-sm"
                >
                  {t(CATEGORY_LABEL_KEYS[category])}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RolesSummary({ config }: { config: RoomConfig }) {
  const { t } = useTranslation();
  const hintLabel = (count: number) =>
    count === 0
      ? t("settings.hintCount_none")
      : count === 1
        ? t("settings.hintCount_one")
        : t("settings.hintCount_two_plus", { count });
  const yesNo = (value: boolean) =>
    value ? t("settings.summary_on") : t("settings.summary_off");
  return (
    <RowGroup>
      <SummaryRow
        label={t("settings.imposterCount")}
        value={String(config.imposter_count)}
      />
      <SummaryRow
        label={t("settings.imposterHintCount")}
        value={hintLabel(config.imposter_hint_count)}
      />
      <SummaryRow
        label={t("settings.impostersSeeEachOther")}
        value={yesNo(config.imposters_see_each_other)}
      />
    </RowGroup>
  );
}

function VoteSummary({ config }: { config: RoomConfig }) {
  const { t } = useTranslation();
  const timerLabel = (seconds: number) =>
    seconds === 0
      ? t("settings.timerOff")
      : seconds <= 180
        ? t("settings.timer_3min")
        : seconds <= 300
          ? t("settings.timer_5min")
          : seconds <= 420
            ? t("settings.timer_7min")
            : t("settings.timer_10min");
  const yesNo = (value: boolean) =>
    value ? t("settings.summary_on") : t("settings.summary_off");
  return (
    <RowGroup>
      <SummaryRow
        label={t("settings.roundMode")}
        value={
          config.round_mode === "multi"
            ? t("settings.roundMode_multi")
            : t("settings.roundMode_single")
        }
      />
      {config.round_mode === "multi" && (
        <SummaryRow
          label={t("settings.maxRounds")}
          value={String(config.max_rounds)}
        />
      )}
      {config.round_mode === "single" && (
        <SummaryRow
          label={t("settings.timerDuration")}
          value={timerLabel(config.timer_seconds)}
        />
      )}
      <SummaryRow
        label={t("settings.callToVote")}
        value={yesNo(config.call_to_vote)}
      />
    </RowGroup>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[3rem] items-center justify-between gap-3 px-4 py-2">
      <span className="min-w-0 text-sm font-medium leading-snug text-fg-muted">
        {label}
      </span>
      <span className="min-w-0 max-w-[60%] truncate text-right text-sm font-semibold text-fg">
        {value}
      </span>
    </div>
  );
}

// ─── Game picker ───────────────────────────────────────────────────────────

function GamePickerView({
  selectedGameType,
  disabled,
  onBack,
  onSelectGame,
}: {
  selectedGameType: GameType;
  disabled: boolean;
  onBack: () => void;
  onSelectGame: (gameType: GameType) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        aria-label={t("settings.backToSettings")}
        className="flex w-fit items-center gap-1 text-fg-muted transition-colors hover:text-fg active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-md"
      >
        <Icon
          icon="lucide:chevron-left"
          className="h-5 w-5"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">
          {t("settings.gamePickerTitle")}
        </span>
      </button>

      <GameList
        variant="modal"
        onSelect={onSelectGame}
        selectedId={selectedGameType}
        disabled={disabled}
      />
    </div>
  );
}

function UnavailableGamePanel({ gameType }: { gameType: GameType }) {
  const { t } = useTranslation();
  const game = getGameModeOption(gameType);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl bg-bg-sunken px-6 py-8 text-center ring-1 ring-inset ring-border/40">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl ${game.iconBg}`}
      >
        <Icon
          icon={game.icon}
          className={`h-8 w-8 ${game.iconColor}`}
          aria-hidden="true"
        />
      </div>
      <h2 className="mt-4 text-base font-bold text-fg">{t(game.titleKey)}</h2>
      <p className="mt-2 text-sm leading-snug text-fg-muted">
        {t("settings.unavailableGameBody", { game: t(game.titleKey) })}
      </p>
    </div>
  );
}
