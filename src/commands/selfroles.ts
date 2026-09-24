import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
  type GuildTextBasedChannel,
} from "discord.js";
import type { Command } from "../types/command.js";
import {
  clearSelfRolePanel,
  getSelfRolePanel,
  saveSelfRolePanel,
} from "../services/guild-settings.js";
import {
  isSelfRolePanelId,
  selfRolePanelChoices,
  selfRolePanelDefinitions,
} from "../selfroles/panels.js";
import { renderSelfRolePanel } from "../selfroles/render-panel.js";

const addPanelChoices = <T extends { addChoices: (...choices: typeof selfRolePanelChoices) => T }>(
  option: T,
) => option.addChoices(...selfRolePanelChoices);

export const selfRolesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("selfroles")
    .setDescription("Configure and publish self-role panels.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configure")
        .setDescription("Choose the roles that belong to a panel.")
        .addStringOption((option) =>
          addPanelChoices(
            option
              .setName("panel")
              .setDescription("The panel to configure.")
              .setRequired(true),
          ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("emoji")
        .setDescription("Set the emoji displayed beside one configured role.")
        .addStringOption((option) =>
          addPanelChoices(
            option
              .setName("panel")
              .setDescription("The role's panel.")
              .setRequired(true),
          ),
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("The configured role.").setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("emoji")
            .setDescription("A server emoji or ordinary Unicode emoji.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("publish")
        .setDescription("Publish or update a configured self-role panel.")
        .addStringOption((option) =>
          addPanelChoices(
            option.setName("panel").setDescription("The panel to publish.").setRequired(true),
          ),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel in which to publish the panel.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View the roles configured for a panel.")
        .addStringOption((option) =>
          addPanelChoices(
            option.setName("panel").setDescription("The panel to view.").setRequired(true),
          ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Clear a self-role panel's configuration.")
        .addStringOption((option) =>
          addPanelChoices(
            option.setName("panel").setDescription("The panel to clear.").setRequired(true),
          ),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: "This command can only be used inside the server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const panelId = interaction.options.getString("panel", true);
    if (!isSelfRolePanelId(panelId)) return;

    const subcommand = interaction.options.getSubcommand();
    const definition = selfRolePanelDefinitions[panelId];

    if (subcommand === "configure") {
      const current = await getSelfRolePanel(interaction.guildId, panelId);
      const menu = new RoleSelectMenuBuilder()
        .setCustomId(`selfrole-config:${panelId}`)
        .setPlaceholder(`Select roles for ${definition.title}`)
        .setMinValues(1)
        .setMaxValues(25);

      if (current?.roles.length) {
        menu.setDefaultRoles(...current.roles.map((role) => role.roleId));
      }

      await interaction.reply({
        content: `Select every role that belongs in **${definition.title}**.`,
        components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "emoji") {
      const panel = await getSelfRolePanel(interaction.guildId, panelId);
      const role = interaction.options.getRole("role", true);
      const emoji = interaction.options.getString("emoji", true).trim();
      const configuredRole = panel?.roles.find((entry) => entry.roleId === role.id);

      if (!panel || !configuredRole) {
        await interaction.reply({
          content: `${role} is not currently configured in **${definition.title}**.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        new ButtonBuilder()
          .setCustomId("emoji-test")
          .setLabel("Test")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji)
          .toJSON();
      } catch {
        await interaction.reply({
          content: "Discord did not recognize that emoji. Paste the emoji itself and try again.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      configuredRole.emoji = emoji;
      await saveSelfRolePanel(interaction.guildId, panelId, panel);
      await interaction.reply({
        content: `${emoji} will now represent ${role} in **${definition.title}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "view") {
      const panel = await getSelfRolePanel(interaction.guildId, panelId);
      const roles = panel?.roles.length
        ? panel.roles.map((entry) => `${entry.emoji ?? "•"} <@&${entry.roleId}>`).join("\n")
        : "No roles configured.";

      await interaction.reply({
        content: `## ${definition.title}\n**Selection:** ${definition.mode}\n${roles}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "clear") {
      await clearSelfRolePanel(interaction.guildId, panelId);
      await interaction.reply({
        content: `The **${definition.title}** configuration has been cleared.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const panel = await getSelfRolePanel(interaction.guildId, panelId);
    const channel = interaction.options.getChannel("channel", true) as GuildTextBasedChannel;

    if (!panel?.roles.length) {
      await interaction.reply({
        content: `Configure **${definition.title}** before publishing it.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rendered = renderSelfRolePanel(interaction.guild, panelId, panel);
    let message;

    if (panel.channelId === channel.id && panel.messageId) {
      const existing = await channel.messages.fetch(panel.messageId).catch(() => null);
      message = existing
        ? await existing.edit({ embeds: [rendered.embed], components: rendered.rows })
        : await channel.send({ embeds: [rendered.embed], components: rendered.rows });
    } else {
      message = await channel.send({ embeds: [rendered.embed], components: rendered.rows });
    }

    await saveSelfRolePanel(interaction.guildId, panelId, {
      ...panel,
      title: definition.title,
      description: definition.description,
      mode: definition.mode,
      channelId: channel.id,
      messageId: message.id,
    });

    await interaction.reply({
      content: `**${definition.title}** has been published in ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
