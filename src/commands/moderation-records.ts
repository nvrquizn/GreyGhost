import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../types/command.js";
import {
  addModerationNote,
  getMemberModerationCases,
  getModerationCase,
  getModerationNotes,
  type ModerationCase,
} from "../services/guild-settings.js";
import { actionLabel, caseLabel, formatDuration, requireModerationSetup } from "../moderation/service.js";

async function requireSetup(interaction: ChatInputCommandInteraction<"cached">): Promise<boolean> {
  if (await requireModerationSetup(interaction.guildId)) return true;
  await interaction.reply({
    content: "Moderation logs are not configured. A server manager must run `/setup moderation` first.",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

async function caseEmbed(guildId: string, moderationCase: ModerationCase): Promise<EmbedBuilder> {
  const channelAction = ["purge", "slowmode", "lock", "unlock"].includes(moderationCase.action);
  const embed = new EmbedBuilder()
    .setColor(0x7188a0)
    .setTitle(`Moderation Case ${caseLabel(moderationCase.id)}`)
    .addFields(
      { name: "Action", value: actionLabel(moderationCase.action), inline: true },
      { name: "Status", value: moderationCase.status === "active" ? "Active" : "Voided", inline: true },
      {
        name: channelAction ? "Channel" : "Member",
        value: channelAction
          ? `<#${moderationCase.targetId}> · ${moderationCase.targetTag}`
          : `<@${moderationCase.targetId}> · ${moderationCase.targetTag}\n\`${moderationCase.targetId}\``,
      },
      { name: "Moderator", value: `<@${moderationCase.moderatorId}>`, inline: true },
      { name: "DM", value: moderationCase.dmDelivered ? "Delivered" : "Could not deliver", inline: true },
      { name: "Reason", value: moderationCase.reason },
    )
    .setTimestamp(moderationCase.createdAt);
  if (moderationCase.rule) embed.addFields({ name: "Rule", value: moderationCase.rule, inline: true });
  if (moderationCase.durationMs) embed.addFields({ name: "Duration", value: formatDuration(moderationCase.durationMs), inline: true });
  if (moderationCase.evidenceUrl) embed.addFields({ name: "Evidence", value: `[Open attachment](${moderationCase.evidenceUrl})` });
  if (moderationCase.editedAt) embed.addFields({ name: "Edited", value: `<@${moderationCase.editedBy}> · <t:${Math.floor(moderationCase.editedAt / 1000)}:f>` });
  if (moderationCase.status === "voided") embed.addFields({ name: "Voided", value: `<@${moderationCase.voidedBy}> · ${moderationCase.voidReason ?? "No reason recorded."}` });
  const notes = await getModerationNotes(guildId, "case", String(moderationCase.id));
  if (notes.length) {
    embed.addFields({
      name: "Private Notes",
      value: notes.slice(0, 3).map((note) => `**#${String(note.id).padStart(4, "0")}** ${note.content}`).join("\n").slice(0, 1024),
    });
  }
  return embed;
}

function historyDescription(cases: ModerationCase[]): string {
  if (!cases.length) return "No moderation cases recorded.";
  return cases.slice(0, 10).map((entry) => {
    const rule = entry.rule ? ` · Rule: ${entry.rule}` : "";
    return `**${caseLabel(entry.id)} · ${actionLabel(entry.action)}${entry.status === "voided" ? " · VOIDED" : ""}**${rule} · <t:${Math.floor(entry.createdAt / 1000)}:d>\n${entry.reason}`;
  }).join("\n\n").slice(0, 4000);
}

export const warningsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a user's warning history.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("The user whose warnings will be shown.").setRequired(true)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const user = interaction.options.getUser("user", true);
    const warnings = (await getMemberModerationCases(interaction.guildId, user.id)).filter((entry) => entry.action === "warn");
    const active = warnings.filter((entry) => entry.status === "active").length;
    const embed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle(`Warnings · ${user.tag}`)
      .setDescription(historyDescription(warnings))
      .addFields(
        { name: "Active", value: String(active), inline: true },
        { name: "Historical", value: String(warnings.length), inline: true },
      )
      .setThumbnail(user.displayAvatarURL())
      .setFooter({ text: warnings.length > 10 ? `Showing 10 of ${warnings.length} warnings` : `${warnings.length} warning(s)` });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export const caseCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("View one moderation case by number.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption((option) => option.setName("number").setDescription("The case number, without the # symbol.").setMinValue(1).setRequired(true)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const id = interaction.options.getInteger("number", true);
    const moderationCase = await getModerationCase(interaction.guildId, id);
    if (!moderationCase) {
      await interaction.reply({ content: `Case ${caseLabel(id)} was not found.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [await caseEmbed(interaction.guildId, moderationCase)], flags: MessageFlags.Ephemeral });
  },
};

export const modlogsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("modlogs")
    .setDescription("View a user's complete moderation history.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("The user whose moderation history will be shown.").setRequired(true)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const user = interaction.options.getUser("user", true);
    const cases = await getMemberModerationCases(interaction.guildId, user.id);
    const embed = new EmbedBuilder()
      .setColor(0x7188a0)
      .setTitle(`Moderation Logs · ${user.tag}`)
      .setDescription(historyDescription(cases))
      .addFields(
        { name: "Total Cases", value: String(cases.length), inline: true },
        { name: "Active Warnings", value: String(cases.filter((entry) => entry.action === "warn" && entry.status === "active").length), inline: true },
        { name: "Voided Cases", value: String(cases.filter((entry) => entry.status === "voided").length), inline: true },
      )
      .setThumbnail(user.displayAvatarURL())
      .setFooter({ text: cases.length > 10 ? `Showing 10 of ${cases.length} cases` : `${cases.length} case(s)` });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export const noteCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Add a private staff note about a user.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("The user this note concerns.").setRequired(true))
    .addStringOption((option) => option.setName("note").setDescription("The private staff note.").setMaxLength(1000).setRequired(true)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const user = interaction.options.getUser("user", true);
    const note = await addModerationNote(interaction.guildId, {
      targetType: "user",
      targetId: user.id,
      authorId: interaction.user.id,
      content: interaction.options.getString("note", true),
    });
    await interaction.reply({
      content: `Private note **#${String(note.id).padStart(4, "0")}** was added to ${user}. Notes do not count as moderation actions and the member is not notified.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

export const notesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("notes")
    .setDescription("View private staff notes about a user.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("user").setDescription("The user whose private notes will be shown.").setRequired(true)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const user = interaction.options.getUser("user", true);
    const notes = await getModerationNotes(interaction.guildId, "user", user.id);
    const description = notes.length
      ? notes.slice(0, 10).map((note) => `**Note #${String(note.id).padStart(4, "0")}** · <@${note.authorId}> · <t:${Math.floor(note.createdAt / 1000)}:d>\n${note.content}`).join("\n\n").slice(0, 4000)
      : "No private notes recorded.";
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x7188a0)
        .setTitle(`Staff Notes · ${user.tag}`)
        .setDescription(description)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: notes.length > 10 ? `Showing 10 of ${notes.length} notes` : `${notes.length} note(s)` })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
