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
      .addFields(
        { name: "Current build", value: "**v0.18.0** · Events, petitions, council, and staff applications" },
        { name: "Duties", value: "Onboarding, events, petitions, council proposals, staff applications, reminders, member and server information, role and permission lookups, spoilers, invite tracking, self roles, profiles, collections, House Points, lore, quizzes, jousts, modmail, moderation, ghost-ping detection, separate reaction and server audit logs, statistics, and server records." },
        { name: "Command styles", value: "Use either Discord slash commands or the `?` prefix. Try `/help` or `?help` for your role-aware command list." },
      )
      .setFooter({ text: "Named for the elusive wild dragon of Dragonstone" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
