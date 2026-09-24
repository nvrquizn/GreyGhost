import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";

export const aboutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("about")
    .setDescription("Learn about Grey Ghost."),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xd7dde5)
      .setTitle("Grey Ghost")
      .setDescription(
        "A quiet dragon with a rather noisy list of responsibilities. Grey Ghost is the server's custom guide, steward, herald, and keeper of the peace.",
      )
      .addFields({ name: "Current stage", value: "First build." })
      .setFooter({ text: "Named for the elusive wild dragon of Dragonstone" });

    await interaction.reply({ embeds: [embed] });
  },
};
