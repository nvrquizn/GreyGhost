import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildSettings } from "../services/guild-settings.js";
import { sendWelcomeMessage } from "../events/member-events.js";

export const testWelcomeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("testwelcome")
    .setDescription("Post a safe preview of the configured welcome message.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const settings = await getGuildSettings(interaction.guildId);
    if (!settings.welcomeChannelId) {
      await interaction.reply({ content: "Configure onboarding with `/setup onboarding` first.", flags: MessageFlags.Ephemeral });
      return;
    }
    const sent = await sendWelcomeMessage(interaction.member, settings.welcomeChannelId);
    await interaction.reply({
      content: sent
        ? `A test welcome was posted in <#${settings.welcomeChannelId}>. No role was assigned and no join log was created.`
        : "The configured welcome channel is unavailable.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
