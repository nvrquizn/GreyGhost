import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { SelfRolePanel } from "../services/guild-settings.js";
import { isSelfRolePanelId, selfRolePanelDefinitions } from "./panels.js";

export function renderSelfRolePanel(guild: Guild, panelId: string, panel: SelfRolePanel) {
  const definition = isSelfRolePanelId(panelId) ? selfRolePanelDefinitions[panelId] : undefined;
  const roles = panel.roles
    .map((entry) => ({ entry, role: guild.roles.cache.get(entry.roleId) }))
    .filter(
      (item): item is { entry: SelfRolePanel["roles"][number]; role: NonNullable<typeof item.role> } =>
        Boolean(item.role),
    );

  const embed = new EmbedBuilder()
    .setColor(0x9da8b5)
    .setTitle(definition?.title ?? panel.title)
    .setDescription(
      `${definition?.description ?? panel.description}\n\n${roles
        .map(({ entry, role }) => `${entry.emoji ?? "•"} ${role}`)
        .join("\n")}`,
    )
    .setFooter({
      text:
        (definition?.mode ?? panel.mode) === "single"
          ? "You may hold one role from this panel at a time."
          : "You may select multiple roles from this panel.",
    });

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  for (let index = 0; index < roles.length; index += 5) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

    for (const { entry, role } of roles.slice(index, index + 5)) {
      const button = new ButtonBuilder()
        .setCustomId(`selfrole:${panelId}:${role.id}`)
        .setLabel(
          entry.emoji
            ? role.members.size.toString()
            : `${role.name} · ${role.members.size}`.slice(0, 80),
        )
        .setStyle(ButtonStyle.Secondary);

      if (entry.emoji) button.setEmoji(entry.emoji);
      row.addComponents(button);
    }

    rows.push(row);
  }

  return { embed, rows };
}
