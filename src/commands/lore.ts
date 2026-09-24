import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { findLoreEntry, getLoreEntries, searchLoreEntries } from "../directory/entries.js";
import { renderLoreEntry } from "../directory/render-entry.js";
import type { LoreEntryType } from "../services/guild-settings.js";

const typeChoices = [
  { name: "Houses", value: "house" },
  { name: "Characters", value: "character" },
  { name: "Dragons", value: "dragon" },
] as const;

export const loreCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lore")
    .setDescription("Explore Grey Ghost's ASOIAF directory.")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("Open a House, character, or dragon entry.")
        .addStringOption((option) =>
          option.setName("type").setDescription("The kind of entry.").setRequired(true).addChoices(...typeChoices),
        )
        .addStringOption((option) =>
          option.setName("name").setDescription("The entry to open.").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("search")
        .setDescription("Search names, aliases, and summaries.")
        .addStringOption((option) =>
          option.setName("query").setDescription("What you want to find.").setRequired(true).setMaxLength(80),
        )
        .addStringOption((option) =>
          option.setName("type").setDescription("Optionally search only one section.").addChoices(...typeChoices),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List the entries in one directory section.")
        .addStringOption((option) =>
          option.setName("type").setDescription("The section to list.").setRequired(true).addChoices(...typeChoices),
        ),
    ),

  async autocomplete(interaction) {
    if (!interaction.guildId) return interaction.respond([]);
    const focused = interaction.options.getFocused();
    const type = interaction.options.getString("type") as LoreEntryType | null;
    const entries = await searchLoreEntries(interaction.guildId, focused, type ?? undefined);
    await interaction.respond(entries.map((entry) => ({ name: entry.name, value: entry.id })));
  },

  async execute(interaction) {
    if (!interaction.guildId) return;
    const subcommand = interaction.options.getSubcommand();
    const type = interaction.options.getString("type") as LoreEntryType | null;

    if (subcommand === "view") {
      const value = interaction.options.getString("name", true);
      const entry = await findLoreEntry(interaction.guildId, value, type ?? undefined);
      if (!entry) {
        await interaction.reply({ content: "I could not find that directory entry.", flags: MessageFlags.Ephemeral });
        return;
      }
      const rendered = renderLoreEntry(entry);
      await interaction.reply({ embeds: [rendered.embed], components: rendered.row ? [rendered.row] : [] });
      return;
    }

    if (subcommand === "search") {
      const query = interaction.options.getString("query", true);
      const entries = await searchLoreEntries(interaction.guildId, query, type ?? undefined, 10);
      const description = entries.length
        ? entries.map((entry) => `**${entry.name}** · ${entry.type}\n${entry.overview.slice(0, 180)}`).join("\n\n")
        : "No entries matched that search.";
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x8795a1).setTitle(`Directory Search · ${query}`).setDescription(description)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const entries = (await getLoreEntries(interaction.guildId)).filter((entry) => entry.type === type);
    const plural = type === "house" ? "Houses" : type === "character" ? "Characters" : "Dragons";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8795a1)
          .setTitle(`ASOIAF Directory · ${plural}`)
          .setDescription(entries.length ? entries.map((entry) => `• ${entry.name}`).join("\n") : "This section is empty."),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
