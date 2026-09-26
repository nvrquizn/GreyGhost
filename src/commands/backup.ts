import {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { z } from "zod";
import type { Command } from "../types/command.js";
import {
  getGuildSettings,
  guildSettingsSchema,
  replaceGuildSettings,
} from "../services/guild-settings.js";
import {
  getGuildSuggestions,
  replaceGuildSuggestions,
  suggestionSchema,
} from "../services/suggestions.js";
import { economyGuildSchema, exportGuildEconomy, replaceGuildEconomy } from "../economy/store.js";
import { combatGuildBackupSchema, exportGuildCombat, replaceGuildCombat } from "../combat/store.js";

const backupV1Schema = z.object({
  format: z.literal("grey-ghost-server-backup"),
  version: z.literal(1),
  createdAt: z.string().datetime(),
  guildId: z.string(),
  guildName: z.string(),
  settings: guildSettingsSchema,
  suggestions: z.array(suggestionSchema),
});

const backupV2Schema = backupV1Schema.omit({ version: true }).extend({
  version: z.literal(2),
  economy: economyGuildSchema,
});

const backupV3Schema = backupV2Schema.omit({ version: true }).extend({
  version: z.literal(3),
  combat: combatGuildBackupSchema,
});

const backupSchema = z.union([backupV3Schema, backupV2Schema, backupV1Schema]);

export const backupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Export or restore Grey Ghost's server data.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("create").setDescription("Download this server's Grey Ghost data."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("restore")
        .setDescription("Replace this server's Grey Ghost data from a backup.")
        .addAttachmentOption((option) =>
          option
            .setName("file")
            .setDescription("A JSON backup previously created by Grey Ghost.")
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("confirm")
            .setDescription("Confirm that current Grey Ghost data will be replaced.")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const backup = backupV3Schema.parse({
        format: "grey-ghost-server-backup",
        version: 3,
        createdAt: new Date().toISOString(),
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        settings: await getGuildSettings(interaction.guildId),
        suggestions: await getGuildSuggestions(interaction.guildId),
        economy: await exportGuildEconomy(interaction.guildId),
        combat: await exportGuildCombat(interaction.guildId),
      });
      const date = new Date().toISOString().slice(0, 10);
      const file = new AttachmentBuilder(Buffer.from(`${JSON.stringify(backup, null, 2)}\n`), {
        name: `grey-ghost-backup-${interaction.guildId}-${date}.json`,
        description: `Grey Ghost backup for ${interaction.guild.name}`,
      });

      await interaction.editReply({
        content:
          "Backup created. Keep this file private: it contains server configuration, economy records, petition votes, council records, and staff applications.",
        files: [file],
      });
      return;
    }

    if (!interaction.options.getBoolean("confirm", true)) {
      await interaction.reply({
        content: "Restore cancelled because confirmation was not enabled.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const attachment = interaction.options.getAttachment("file", true);
    if (attachment.size > 5_000_000 || !attachment.name.toLowerCase().endsWith(".json")) {
      await interaction.reply({
        content: "Please provide a Grey Ghost JSON backup smaller than 5 MB.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error(`Could not download backup (${response.status}).`);

    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 5_000_000) {
      await interaction.editReply("That backup exceeds the 5 MB limit.");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      await interaction.editReply("That file does not contain valid JSON.");
      return;
    }

    const result = backupSchema.safeParse(parsed);
    if (!result.success) {
      await interaction.editReply("That is not a valid Grey Ghost server backup.");
      return;
    }
    if (result.data.guildId !== interaction.guildId) {
      await interaction.editReply("That backup belongs to a different Discord server.");
      return;
    }

    await replaceGuildSettings(interaction.guildId, result.data.settings);
    await replaceGuildSuggestions(interaction.guildId, result.data.suggestions);
    if (result.data.version === 2 || result.data.version === 3) await replaceGuildEconomy(interaction.guildId, result.data.economy);
    if (result.data.version === 3) await replaceGuildCombat(interaction.guildId, result.data.combat);
    await interaction.editReply(
      `Backup from <t:${Math.floor(new Date(result.data.createdAt).getTime() / 1000)}:F> restored. Run \`/setup check\` to validate its channels, roles, and permissions.`,
    );
  },
};
