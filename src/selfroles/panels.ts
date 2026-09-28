export const selfRolePanelDefinitions = {
  houses: {
    title: "House Allegiance",
    description: "Choose every House to which you wish to pledge your allegiance.",
    mode: "multiple",
  },
  dance: {
    title: "The Dance of the Dragons",
    description: "Choose Team Black or Team Green.",
    mode: "single",
  },
  blackfyre: {
    title: "The Blackfyre Rebellion",
    description: "Choose the red dragon or the black dragon.",
    mode: "single",
  },
  trialseven: {
    title: "The Trial of Seven",
    description: "Choose Aerion's Champions or Dunk's Champions.",
    mode: "single",
  },
  fossoway: {
    title: "The Fossoway Apples",
    description: "Choose the Red Apples of Cider Hall or the Green Apples of New Barrel.",
    mode: "single",
  },
  religion: {
    title: "Religion",
    description: "Choose the faith you follow.",
    mode: "single",
  },
  factions: {
    title: "Factions",
    description:
      "Choose any that apply: the Night's Watch, the Free Folk, or the Brotherhood Without Banners.",
    mode: "multiple",
  },
  kingdoms: {
    title: "Kingdoms",
    description:
      "Choose one region: North America, South America, Europe, Asia, Africa, Oceania, or Antarctica.",
    mode: "single",
  },
  pings: {
    title: "Ping Roles",
    description: "Choose every notification role you would like to receive.",
    mode: "multiple",
  },
  pronouns: {
    title: "Pronouns",
    description: "Choose every set of pronouns that applies to you.",
    mode: "multiple",
  },
} as const;

export type SelfRolePanelId = keyof typeof selfRolePanelDefinitions;
export type SelfRoleMode = "single" | "multiple";

export const selfRolePanelChoices = Object.entries(selfRolePanelDefinitions).map(
  ([value, definition]) => ({ name: definition.title, value }),
);

export function isSelfRolePanelId(value: string): value is SelfRolePanelId {
  return value in selfRolePanelDefinitions;
}
