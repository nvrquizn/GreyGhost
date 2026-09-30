import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildSettings } from "../services/guild-settings.js";
import { buildStaffApplicationModal } from "../governance/staff-application-flow.js";

export const staffApplyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("staffapply")
    .setDescription("Open the server's private staff application form.")
    .setDMPermission(false),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    if (!(await getGuildSettings(interaction.guildId)).governance) {
      await interaction.reply({ content: "Staff applications are not configured. The server owner must run `/setup governance`.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.showModal(buildStaffApplicationModal(interaction.guildId, interaction.user.id, 1));
  },
};
