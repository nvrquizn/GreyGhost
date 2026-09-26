import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { addChronicleEntry, getChronicleEntries } from "../services/guild-settings.js";
import { chronicleEmbed, publishChronicleEntry } from "../chronicles/runtime.js";

export const chronicleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("chronicle")
    .setDescription("Read or add to the permanent history of the Realm.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand.setName("view").setDescription("Read recent Chronicle entries.")
      .addIntegerOption((option) => option.setName("page").setDescription("The page to read.").setMinValue(1)))
    .addSubcommand((subcommand) => subcommand.setName("record").setDescription("Record a major Realm event.")
      .addStringOption((option) => option.setName("title").setDescription("The Chronicle heading.").setMaxLength(120).setRequired(true))
      .addStringOption((option) => option.setName("description").setDescription("What occurred.").setMaxLength(2000).setRequired(true))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "view") {
      const entries = await getChronicleEntries(interaction.guildId);
      const pages = Math.max(1, Math.ceil(entries.length / 5));
      const page = Math.min(interaction.options.getInteger("page") ?? 1, pages);
      const selected = entries.slice((page - 1) * 5, page * 5);
      const description = selected.length
        ? selected.map((entry) => `### ${entry.title}\n<t:${Math.floor(entry.occurredAt / 1000)}:D> · **#${entry.id}**\n${entry.description.slice(0, 500)}`).join("\n\n")
        : "No entries have been written yet.";
      await interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(0xd4af37)
        .setTitle(`${interaction.guild.name} · Chronicles`)
        .setDescription(description.slice(0, 4096))
        .setFooter({ text: `Page ${page}/${pages} · ${entries.length} record(s)` })] });
      return;
    }
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "You need **Manage Server** to add Chronicle entries.", flags: MessageFlags.Ephemeral });
      return;
    }
    const entry = await addChronicleEntry(interaction.guildId, {
      type: "manual",
      title: interaction.options.getString("title", true),
      description: interaction.options.getString("description", true),
      occurredAt: Date.now(),
      relatedUserIds: [], relatedRoleIds: [], createdBy: interaction.user.id,
    });
    const published = await publishChronicleEntry(interaction.guild, entry);
    await interaction.reply({
      content: published ? `Chronicle entry **#${entry.id}** was recorded and published.` : `Chronicle entry **#${entry.id}** was recorded. Configure a publication channel with \`/setup chronicles\`.`,
      embeds: published ? [] : [chronicleEmbed(entry)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
