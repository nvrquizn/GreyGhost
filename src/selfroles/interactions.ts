import {
  ComponentType,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Client,
  type GuildMember,
} from "discord.js";
import {
  getGuildSettings,
  getSelfRolePanel,
  saveSelfRolePanel,
} from "../services/guild-settings.js";
import {
  isSelfRolePanelId,
  selfRolePanelDefinitions,
} from "./panels.js";
import { renderSelfRolePanel } from "./render-panel.js";

function componentEmojiToString(emoji: {
  animated?: boolean | null;
  id?: string | null;
  name?: string | null;
} | null): string | undefined {
  if (!emoji) return undefined;
  if (!emoji.id) return emoji.name ?? undefined;
  return `<${emoji.animated ? "a" : ""}:${emoji.name ?? "emoji"}:${emoji.id}>`;
}

async function recoverPanelFromMessage(
  interaction: ButtonInteraction<"cached">,
  panelId: keyof typeof selfRolePanelDefinitions,
) {
  const definition = selfRolePanelDefinitions[panelId];
  const roles = interaction.message.components.flatMap((row) => {
    if (row.type !== ComponentType.ActionRow) return [];

    return row.components.flatMap((component) => {
      if (component.type !== ComponentType.Button || !component.customId) return [];
      const [, componentPanelId, roleId] = component.customId.split(":");
      if (componentPanelId !== panelId || !roleId) return [];
      return [{ roleId, emoji: componentEmojiToString(component.emoji) }];
    });
  });

  if (!roles.length) return undefined;

  const recoveredPanel = {
    title: definition.title,
    description: definition.description,
    mode: definition.mode,
    roles,
    channelId: interaction.channelId,
    messageId: interaction.message.id,
  };

  await saveSelfRolePanel(interaction.guildId, panelId, recoveredPanel);
  return recoveredPanel;
}

async function refreshPanelMessage(
  interaction: ButtonInteraction<"cached">,
  panelId: string,
  panel: NonNullable<Awaited<ReturnType<typeof getSelfRolePanel>>>,
) {
  if (!interaction.inCachedGuild() || !interaction.isButton()) return;
  const rendered = renderSelfRolePanel(interaction.guild, panelId, panel);
  await interaction.message
    .edit({ embeds: [rendered.embed], components: rendered.rows })
    .catch((error: unknown) => console.error(`Could not refresh self-role counts:`, error));
}

export function registerSelfRoleInteractions(client: Client): void {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      const settings = await getGuildSettings(guild.id);
      for (const [panelId, panel] of Object.entries(settings.selfRolePanels ?? {})) {
        if (!isSelfRolePanelId(panelId)) continue;
        const definition = selfRolePanelDefinitions[panelId];
        const normalized = {
          ...panel,
          title: definition.title,
          description: definition.description,
          mode: definition.mode,
        };

        if (
          panel.title !== normalized.title ||
          panel.description !== normalized.description ||
          panel.mode !== normalized.mode
        ) {
          await saveSelfRolePanel(guild.id, panelId, normalized);
        }

        if (!normalized.channelId || !normalized.messageId) continue;
        const channel = await guild.channels.fetch(normalized.channelId).catch(() => null);
        if (!channel?.isTextBased() || !("messages" in channel)) continue;
        const message = await channel.messages.fetch(normalized.messageId).catch(() => null);
        if (!message) continue;
        const rendered = renderSelfRolePanel(guild, panelId, normalized);
        await message.edit({ embeds: [rendered.embed], components: rendered.rows }).catch((error) => {
          console.error(`Could not refresh self-role panel ${panelId}:`, error);
        });
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("selfrole-config:")) {
      if (!interaction.inCachedGuild()) return;

      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({
          content: "You need **Manage Roles** to configure this panel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const panelId = interaction.customId.split(":")[1];
      if (!panelId || !isSelfRolePanelId(panelId)) return;

      const invalidRoles = interaction.values
        .map((roleId) => interaction.guild.roles.cache.get(roleId))
        .filter((role) => !role || role.managed || !role.editable);

      if (invalidRoles.length) {
        await interaction.reply({
          content:
            "Grey Ghost cannot assign one or more selected roles. Make sure they are ordinary roles positioned below Grey Ghost's role.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const current = await getSelfRolePanel(interaction.guildId, panelId);
      const definition = selfRolePanelDefinitions[panelId];
      const roles = interaction.values.map((roleId) => ({
        roleId,
        emoji: current?.roles.find((entry) => entry.roleId === roleId)?.emoji,
      }));

      await saveSelfRolePanel(interaction.guildId, panelId, {
        title: definition.title,
        description: definition.description,
        mode: definition.mode,
        roles,
        channelId: current?.channelId,
        messageId: current?.messageId,
      });

      await interaction.update({
        content: `**${definition.title}** now contains ${roles.length} role${roles.length === 1 ? "" : "s"}.`,
        components: [],
      });
      return;
    }

    if (!interaction.isButton() || !interaction.customId.startsWith("selfrole:")) return;
    if (!interaction.inCachedGuild()) return;

    const [, panelId, roleId] = interaction.customId.split(":");
    if (!panelId || !roleId || !isSelfRolePanelId(panelId)) return;

    let panel = await getSelfRolePanel(interaction.guildId, panelId);
    let configuredRole = panel?.roles.find((entry) => entry.roleId === roleId);

    if (!panel || !configuredRole) {
      panel = await recoverPanelFromMessage(interaction, panelId);
      configuredRole = panel?.roles.find((entry) => entry.roleId === roleId);
    }

    const role = interaction.guild.roles.cache.get(roleId);

    if (!panel || !configuredRole || !role) {
      await interaction.reply({
        content: "That role is no longer available.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!role.editable) {
      await interaction.reply({
        content: "Grey Ghost cannot assign that role. Its position may have changed.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = interaction.member as GuildMember;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, `Self-role removed through ${panel.title}`);
      await refreshPanelMessage(interaction, panelId, panel);
      await interaction.editReply(`Removed ${role}.`);
      return;
    }

    if (panel.mode === "single") {
      const rolesToRemove = panel.roles
        .map((entry) => entry.roleId)
        .filter((configuredRoleId) => member.roles.cache.has(configuredRoleId));

      if (rolesToRemove.length) {
        await member.roles.remove(rolesToRemove, `Exclusive choice changed in ${panel.title}`);
      }
    }

    await member.roles.add(roleId, `Self-role selected through ${panel.title}`);
    await refreshPanelMessage(interaction, panelId, panel);
    await interaction.editReply(`Added ${role}.`);
  });
}
