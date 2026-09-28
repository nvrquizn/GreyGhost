import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildSettings, updateGuildSettings } from "../services/guild-settings.js";
import { refreshStatsDashboard } from "../stats/dashboard.js";
import { renderServerStatsPages } from "../stats/render-stats.js";

function canManageServer(interaction: {
  memberPermissions: { has(permission: bigint): boolean } | null;
}): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export const statsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View or publish the server's Realm statistics.")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand.setName("view").setDescription("View the current server statistics."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("publish")
        .setDescription("Publish an automatically refreshed statistics dashboard.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Where the statistics dashboard should be published.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("refresh").setDescription("Refresh the published dashboard now."),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      await interaction.deferReply();
      const pages = await renderServerStatsPages(interaction.guild);
      const firstPage = pages[0];
      if (!firstPage) {
        await interaction.editReply("No Realm statistics are available yet.");
        return;
      }
      await interaction.editReply({ embeds: [firstPage] });
      for (const page of pages.slice(1)) {
        await interaction.followUp({ embeds: [page] });
      }
      return;
    }

    if (!canManageServer(interaction)) {
      await interaction.reply({
        content: "You need **Manage Server** to publish or refresh the statistics dashboard.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (subcommand === "publish") {
      const channel = interaction.options.getChannel("channel", true);
      const current = await getGuildSettings(interaction.guildId);
      await updateGuildSettings(interaction.guildId, {
        statsChannelId: channel.id,
        statsMessageId: current.statsChannelId === channel.id ? current.statsMessageId : undefined,
        statsMessageIds: current.statsChannelId === channel.id ? current.statsMessageIds : undefined,
      });
      await refreshStatsDashboard(interaction.guild);
      await interaction.editReply(
        `The Realm statistics dashboard is published in ${channel} and will refresh every 15 minutes.`,
      );
      return;
    }

    const settings = await getGuildSettings(interaction.guildId);
    if (!settings.statsChannelId) {
      await interaction.editReply("No statistics dashboard has been published yet.");
      return;
    }

    const refreshed = await refreshStatsDashboard(interaction.guild);
    await interaction.editReply(
      refreshed ? "The statistics dashboard has been refreshed." : "The dashboard channel is unavailable.",
    );
  },
};
