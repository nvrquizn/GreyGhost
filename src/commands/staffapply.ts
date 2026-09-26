import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildSettings } from "../services/guild-settings.js";

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
    const modal = new ModalBuilder()
      .setCustomId(`staffapp:form:${interaction.guildId}`)
      .setTitle("Staff Application");
    const fields = [
      new TextInputBuilder().setCustomId("motivation").setLabel("Why do you want to join staff?").setStyle(TextInputStyle.Paragraph).setMinLength(20).setMaxLength(1000).setRequired(true),
      new TextInputBuilder().setCustomId("experience").setLabel("What relevant experience do you have?").setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1000).setRequired(true),
      new TextInputBuilder().setCustomId("availability").setLabel("Availability and timezone").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(500).setRequired(true),
      new TextInputBuilder().setCustomId("strengths").setLabel("What strengths would you bring?").setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1000).setRequired(true),
      new TextInputBuilder().setCustomId("additional").setLabel("Anything else? (optional)").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false),
    ];
    modal.addComponents(...fields.map((field) => new ActionRowBuilder<TextInputBuilder>().addComponents(field)));
    await interaction.showModal(modal);
  },
};
