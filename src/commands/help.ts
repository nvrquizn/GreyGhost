import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";

export const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View Grey Ghost's available commands."),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xb8c2cc)
      .setTitle("Grey Ghost · Command Roster")
      .setDescription("Grey Ghost's currently available commands.")
      .addFields(
        { name: "/ping", value: "Check whether the bot is online." },
        { name: "/about", value: "Learn about Grey Ghost." },
        { name: "/help", value: "Open this command roster." },
        {
          name: "/setup",
          value: "Configure server features. Visible to server managers only.",
        },
        {
          name: "/selfroles",
          value: "Configure and publish self-role panels. Visible to role managers only.",
        },
        {
          name: "/embed",
          value: "Publish a formatted information embed. Visible to message managers only.",
        },
        { name: "/suggest", value: "Submit an idea to the server suggestions channel." },
        {
          name: "/suggestion status",
          value: "Review a suggestion and update its status. Visible to message managers only.",
        },
        {
          name: "/collection progress",
          value: "Check progress toward the Titles of the Realm.",
        },
        {
          name: "/backup",
          value: "Create or restore a server configuration backup. Visible to server managers only.",
        },
        {
          name: "/profile",
          value: "View or customize Realm profiles and admirer-role wishlists.",
        },
        {
          name: "/stats",
          value: "View Realm statistics or manage the automatically refreshed dashboard.",
        },
        {
          name: "/housepoints",
          value: "View House standings and point history; server managers can award or deduct points.",
        },
        {
          name: "/lore",
          value: "Search and explore the spoiler-separated ASOIAF directory.",
        },
        {
          name: "/directory",
          value: "Add, replace, or remove directory entries. Visible to server managers only.",
        },
        {
          name: "/modmail",
          value: "Privately reply to, claim, close, reopen, or inspect a DM-created staff ticket.",
        },
        {
          name: "/warn · /strike · /timeout · /untimeout",
          value: "Issue warnings or strikes and manage temporary communication restrictions.",
        },
        {
          name: "/kick · /ban · /unban",
          value: "Remove or restore server access with recorded case numbers.",
        },
        {
          name: "/moderation",
          value: "Inspect, edit, void, and annotate private member or case records.",
        },
        {
          name: "/purge · /slowmode · /lock · /unlock",
          value: "Manage messages and channel access with logged case numbers.",
        },
        {
          name: "/quiz",
          value: "Create and host live, speed-weighted quizzes with private emoji answers.",
        },
        {
          name: "/joust",
          value: "Enter or host House-balanced automated jousting tournaments.",
        },
      )
      .setFooter({ text: "Version 0.15.0 · Jousting Tournaments" });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
