import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import type { Command } from "../types/command.js";
import {
  deleteLoreEntry,
  findLoreEntry,
  makeLoreId,
  searchLoreEntries,
  upsertLoreEntry,
} from "../directory/entries.js";
import { renderLoreEntry } from "../directory/render-entry.js";
import type { LoreEntryType } from "../services/guild-settings.js";

const typeChoices = [
  { name: "House", value: "house" },
  { name: "Character", value: "character" },
  { name: "Dragon", value: "dragon" },
] as const;

function addEntryOptions(subcommand: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return subcommand
    .addStringOption((option) =>
      option.setName("name").setDescription("Entry name; the same name replaces an existing entry.").setRequired(true).setMaxLength(80),
    )
    .addStringOption((option) =>
      option.setName("overview").setDescription("Public, spoiler-free summary.").setRequired(true).setMaxLength(1000),
    )
    .addStringOption((option) =>
      option.setName("facts").setDescription("Facts formatted as Label: Value | Label: Value").setMaxLength(1000),
    )
    .addStringOption((option) =>
      option.setName("aliases").setDescription("Other names, separated by commas.").setMaxLength(500),
    )
    .addStringOption((option) =>
      option.setName("spoilers").setDescription("Text hidden behind the private spoiler button.").setMaxLength(1500),
    )
    .addStringOption((option) =>
      option
        .setName("spoiler-section")
        .setDescription("Which continuity the spoiler text covers.")
        .addChoices(
          { name: "General", value: "General" },
          { name: "Books", value: "Books" },
          { name: "Game of Thrones", value: "Game of Thrones" },
          { name: "House of the Dragon", value: "House of the Dragon" },
        ),
    )
    .addStringOption((option) =>
      option.setName("image").setDescription("Optional HTTPS image URL.").setMaxLength(500),
    )
    .addStringOption((option) =>
      option.setName("source").setDescription("Optional HTTPS source URL.").setMaxLength(500),
    );
}

function parseFacts(input: string | null): Array<{ label: string; value: string }> | undefined {
  if (!input?.trim()) return [];
  const facts = input.split("|").map((part) => {
    const separator = part.indexOf(":");
    if (separator < 1) return null;
    const label = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return label && value ? { label: label.slice(0, 50), value: value.slice(0, 300) } : null;
  });
  return facts.every(Boolean) ? (facts as Array<{ label: string; value: string }>).slice(0, 8) : undefined;
}

function validHttpsUrl(value: string | null): boolean {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const directoryCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("directory")
    .setDescription("Manage Grey Ghost's ASOIAF directory.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      addEntryOptions(subcommand.setName("house").setDescription("Add or replace a House entry.")),
    )
    .addSubcommand((subcommand) =>
      addEntryOptions(subcommand.setName("character").setDescription("Add or replace a character entry.")),
    )
    .addSubcommand((subcommand) =>
      addEntryOptions(subcommand.setName("dragon").setDescription("Add or replace a dragon entry.")),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a starter or custom directory entry.")
        .addStringOption((option) =>
          option.setName("type").setDescription("The kind of entry.").setRequired(true).addChoices(...typeChoices),
        )
        .addStringOption((option) =>
          option.setName("name").setDescription("The entry to remove.").setRequired(true).setAutocomplete(true),
        ),
    ),

  async autocomplete(interaction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const type = interaction.options.getString("type") as LoreEntryType | null;
    const entries = await searchLoreEntries(interaction.guildId, interaction.options.getFocused(), type ?? undefined);
    await interaction.respond(entries.map((entry) => ({ name: entry.name, value: entry.id })));
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "You need **Manage Server** to edit the directory.", flags: MessageFlags.Ephemeral });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "remove") {
      const type = interaction.options.getString("type", true) as LoreEntryType;
      const entry = await findLoreEntry(interaction.guildId, interaction.options.getString("name", true), type);
      if (!entry) {
        await interaction.reply({ content: "I could not find that directory entry.", flags: MessageFlags.Ephemeral });
        return;
      }
      await deleteLoreEntry(interaction.guildId, entry);
      await interaction.reply({ content: `Removed **${entry.name}** from the directory.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const type = subcommand as LoreEntryType;
    const name = interaction.options.getString("name", true).trim();
    const overview = interaction.options.getString("overview", true).trim();
    const facts = parseFacts(interaction.options.getString("facts"));
    const imageUrl = interaction.options.getString("image")?.trim() || undefined;
    const sourceUrl = interaction.options.getString("source")?.trim() || undefined;
    if (!facts) {
      await interaction.reply({
        content: "I could not read those facts. Use `Label: Value | Label: Value`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!validHttpsUrl(imageUrl ?? null) || !validHttpsUrl(sourceUrl ?? null)) {
      await interaction.reply({ content: "Image and source links must be valid HTTPS URLs.", flags: MessageFlags.Ephemeral });
      return;
    }

    const existing = await findLoreEntry(interaction.guildId, name, type);
    const entry = await upsertLoreEntry(interaction.guildId, {
      id: existing?.id ?? makeLoreId(type, name),
      type,
      name,
      overview,
      facts,
      aliases: [...new Set((interaction.options.getString("aliases") ?? "").split(",").map((alias) => alias.trim()).filter(Boolean))].slice(0, 10),
      spoilers: interaction.options.getString("spoilers")?.trim() || undefined,
      spoilerLabel: (interaction.options.getString("spoiler-section") as "General" | "Books" | "Game of Thrones" | "House of the Dragon" | null) ?? undefined,
      imageUrl,
      sourceUrl,
      updatedBy: interaction.user.id,
      updatedAt: Date.now(),
    });
    const rendered = renderLoreEntry(entry);
    await interaction.reply({
      content: `${existing ? "Updated" : "Added"} **${entry.name}**.`,
      embeds: [rendered.embed],
      components: rendered.row ? [rendered.row] : [],
      flags: MessageFlags.Ephemeral,
    });
  },
};
