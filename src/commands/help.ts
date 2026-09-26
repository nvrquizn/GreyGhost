import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildSettings } from "../services/guild-settings.js";
import { renderHelp } from "../help/render-help.js";

export const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View Grey Ghost's available commands."),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ embeds: [renderHelp(null)] });
      return;
    }
    const settings = await getGuildSettings(interaction.guildId);
    const isStaff = Boolean(
      (settings.modmail?.staffRoleId && interaction.member.roles.cache.has(settings.modmail.staffRoleId))
      || (settings.governance?.councilRoleId && interaction.member.roles.cache.has(settings.governance.councilRoleId)),
    );
    await interaction.reply({ embeds: [renderHelp(interaction.member, isStaff)], flags: MessageFlags.Ephemeral });
  },
};
