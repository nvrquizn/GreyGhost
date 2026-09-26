import { SlashCommandBuilder, type Message } from "discord.js";
import type { Command } from "../types/command.js";

export const spoilerCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("spoiler")
    .setDescription("Post text hidden behind Discord's spoiler covering.")
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName("text")
      .setDescription("The text to conceal.")
      .setRequired(true)
      .setMaxLength(1900)),
  async execute(interaction) {
    const text = interaction.options.getString("text", true).replaceAll("||", "|\u200b|");
    await interaction.reply({ content: `||${text}||`, allowedMentions: { parse: [] } });
    const source = (interaction as unknown as { sourceMessage?: Message }).sourceMessage;
    if (source?.deletable) await source.delete().catch(() => undefined);
  },
};
