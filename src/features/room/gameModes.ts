import type { GameType } from "./roomConfig";

export interface GameModeOption {
  id: GameType;
  icon: string;
  iconColor: string;
  iconBg: string;
  titleKey:
    | "create.imposterTitle"
    | "create.lupusTitle"
    | "create.secretHitlerTitle";
  descriptionKey:
    | "create.imposterDescription"
    | "create.lupusDescription"
    | "create.secretHitlerDescription";
  available: boolean;
}

export const GAME_MODE_OPTIONS: GameModeOption[] = [
  {
    id: "imposter",
    icon: "mdi:incognito",
    iconColor: "text-accent",
    iconBg: "bg-accent/10",
    titleKey: "create.imposterTitle",
    descriptionKey: "create.imposterDescription",
    available: true,
  },
  {
    id: "lupus",
    icon: "mdi:paw",
    iconColor: "text-fg-muted",
    iconBg: "bg-fg/8",
    titleKey: "create.lupusTitle",
    descriptionKey: "create.lupusDescription",
    available: false,
  },
  {
    id: "secret-hitler",
    icon: "mdi:gavel",
    iconColor: "text-fg-muted",
    iconBg: "bg-fg/8",
    titleKey: "create.secretHitlerTitle",
    descriptionKey: "create.secretHitlerDescription",
    available: false,
  },
];

const DEFAULT_GAME_MODE_OPTION = GAME_MODE_OPTIONS[0]!;

export function getGameModeOption(gameType: GameType): GameModeOption {
  return (
    GAME_MODE_OPTIONS.find((option) => option.id === gameType) ??
    DEFAULT_GAME_MODE_OPTION
  );
}
