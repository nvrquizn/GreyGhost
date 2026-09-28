import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import {
  addModerationNote,
  clearMemberWarnings,
  deleteModerationNote,
  getGuildSettings,
  getMemberModerationCases,
  getModerationCase,
  getModerationNotes,
  updateModerationCase,
} from "../services/guild-settings.js";
import { actionLabel, caseLabel, formatDuration } from "../moderation/service.js";

export const moderationCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("moderation")
    .setDescription("Inspect Grey Ghost's moderation records.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((subcommand) => subcommand.setName("history").setDescription("View a user's recent moderation history.")
      .addUserOption((option) => option.setName("user").setDescription("The user whose history will be shown.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("case").setDescription("View one moderation case by number.")
      .addIntegerOption((option) => option.setName("number").setDescription("The case number, without the # symbol.").setMinValue(1).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("case-edit").setDescription("Correct a case's recorded reason.")
      .addIntegerOption((option) => option.setName("number").setDescription("The case number.").setMinValue(1).setRequired(true))
      .addStringOption((option) => option.setName("reason").setDescription("The corrected reason.").setMaxLength(400).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("case-void").setDescription("Void a case without erasing its audit trail.")
      .addIntegerOption((option) => option.setName("number").setDescription("The case number.").setMinValue(1).setRequired(true))
      .addStringOption((option) => option.setName("reason").setDescription("Why the case is being voided.").setMaxLength(400).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("case-evidence").setDescription("Attach or replace evidence on a moderation case.")
      .addIntegerOption((option) => option.setName("number").setDescription("The case number.").setMinValue(1).setRequired(true))
      .addAttachmentOption((option) => option.setName("evidence").setDescription("The evidence attachment.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("clear-warnings").setDescription("Void all active warnings belonging to a user.")
      .addUserOption((option) => option.setName("user").setDescription("The user whose warnings will be cleared.").setRequired(true))
      .addStringOption((option) => option.setName("reason").setDescription("Why the warnings are being cleared.").setMaxLength(400).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("note-user").setDescription("Add a private note about a user.")
      .addUserOption((option) => option.setName("user").setDescription("The user this note concerns.").setRequired(true))
      .addStringOption((option) => option.setName("note").setDescription("The private staff note.").setMaxLength(1000).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("note-case").setDescription("Add a private note to a moderation case.")
      .addIntegerOption((option) => option.setName("number").setDescription("The case number.").setMinValue(1).setRequired(true))
      .addStringOption((option) => option.setName("note").setDescription("The private staff note.").setMaxLength(1000).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("notes-user").setDescription("View private notes about a user.")
      .addUserOption((option) => option.setName("user").setDescription("The user whose notes will be shown.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("notes-case").setDescription("View private notes attached to a case.")
      .addIntegerOption((option) => option.setName("number").setDescription("The case number.").setMinValue(1).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("note-delete").setDescription("Permanently delete a private note (Manage Server only).")
      .addIntegerOption((option) => option.setName("note-number").setDescription("The note number.").setMinValue(1).setRequired(true))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();


    if (subcommand === "case-evidence") {
      const id = interaction.options.getInteger("number", true);
      const current = await getModerationCase(interaction.guildId, id);
      if (!current) {
        await interaction.reply({ content: `Case ${caseLabel(id)} was not found.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const evidence = interaction.options.getAttachment("evidence", true);
      const updated = await updateModerationCase(interaction.guildId, id, { evidenceUrl: evidence.url, editedBy: interaction.user.id, editedAt: Date.now() });
      await interaction.reply({ content: updated ? `Evidence was attached to case **${caseLabel(id)}**.` : "That case could not be updated.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "case-edit" || subcommand === "case-void") {
      const id = interaction.options.getInteger("number", true);
      const current = await getModerationCase(interaction.guildId, id);
      if (!current) {
        await interaction.reply({ content: `Case ${caseLabel(id)} was not found.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const reason = interaction.options.getString("reason", true);
      const updated = subcommand === "case-edit"
        ? await updateModerationCase(interaction.guildId, id, { reason, editedBy: interaction.user.id, editedAt: Date.now() })
        : await updateModerationCase(interaction.guildId, id, { status: "voided", voidedBy: interaction.user.id, voidedAt: Date.now(), voidReason: reason });
      await interaction.reply({ content: updated ? `Case **${caseLabel(id)}** was ${subcommand === "case-edit" ? "edited" : "voided"}. Its audit record remains intact.` : "That case could not be updated.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "clear-warnings") {
      const user = interaction.options.getUser("user", true);
      const count = await clearMemberWarnings(interaction.guildId, user.id, interaction.user.id, interaction.options.getString("reason", true));
      await interaction.reply({ content: count ? `Voided **${count}** active warning(s) for ${user}.` : `${user} has no active warnings.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "note-user" || subcommand === "note-case") {
      const targetType = subcommand === "note-user" ? "user" : "case";
      const targetId = targetType === "user"
        ? interaction.options.getUser("user", true).id
        : String(interaction.options.getInteger("number", true));
      if (targetType === "case" && !(await getModerationCase(interaction.guildId, Number(targetId)))) {
        await interaction.reply({ content: `Case ${caseLabel(Number(targetId))} was not found.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const note = await addModerationNote(interaction.guildId, { targetType, targetId, authorId: interaction.user.id, content: interaction.options.getString("note", true) });
      await interaction.reply({ content: `Private note **#${String(note.id).padStart(4, "0")}** was added to ${targetType === "user" ? `<@${targetId}>` : `case ${caseLabel(Number(targetId))}`}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "notes-user" || subcommand === "notes-case") {
      const targetType = subcommand === "notes-user" ? "user" : "case";
      const targetId = targetType === "user"
        ? interaction.options.getUser("user", true).id
        : String(interaction.options.getInteger("number", true));
      const notes = await getModerationNotes(interaction.guildId, targetType, targetId);
      const description = notes.length
        ? notes.slice(0, 10).map((note) => `**Note #${String(note.id).padStart(4, "0")}** · <@${note.authorId}> · <t:${Math.floor(note.createdAt / 1000)}:d>\n${note.content}`).join("\n\n").slice(0, 4000)
        : "No private notes recorded.";
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x7188a0).setTitle(targetType === "user" ? `User Notes · <@${targetId}>` : `Case Notes · ${caseLabel(Number(targetId))}`).setDescription(description).setFooter({ text: notes.length > 10 ? `Showing 10 of ${notes.length} notes` : `${notes.length} note(s)` })], flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "note-delete") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "Only members with **Manage Server** can permanently delete notes.", flags: MessageFlags.Ephemeral });
        return;
      }
      const id = interaction.options.getInteger("note-number", true);
      const deleted = await deleteModerationNote(interaction.guildId, id);
      await interaction.reply({ content: deleted ? `Private note **#${String(id).padStart(4, "0")}** was deleted.` : "That note was not found.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "case") {
      const id = interaction.options.getInteger("number", true);
      const moderationCase = await getModerationCase(interaction.guildId, id);
      if (!moderationCase) {
        await interaction.reply({ content: `Case ${caseLabel(id)} was not found.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x7188a0)
        .setTitle(`Moderation Case ${caseLabel(id)}`)
        .addFields(
          { name: "Action", value: actionLabel(moderationCase.action), inline: true },
          { name: "Status", value: moderationCase.status === "active" ? "Active" : "Voided", inline: true },
          {
            name: ["purge", "slowmode", "lock", "unlock"].includes(moderationCase.action) ? "Channel" : "Member",
            value: ["purge", "slowmode", "lock", "unlock"].includes(moderationCase.action)
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
      const notes = await getModerationNotes(interaction.guildId, "case", String(id));
      if (notes.length) embed.addFields({ name: "Private Notes", value: notes.slice(0, 3).map((note) => `**#${String(note.id).padStart(4, "0")}** ${note.content}`).join("\n").slice(0, 1024) });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const user = interaction.options.getUser("user", true);
    const cases = await getMemberModerationCases(interaction.guildId, user.id);
    const recent = cases.slice(0, 10);
    const warnings = cases.filter((entry) => entry.action === "warn" && entry.status === "active").length;
    const strikes = cases.filter((entry) => entry.action === "strike" && entry.status === "active").length;
    const description = recent.length
      ? recent.map((entry) => `**${caseLabel(entry.id)} · ${actionLabel(entry.action)}${entry.status === "voided" ? " · VOIDED" : ""}** · <t:${Math.floor(entry.createdAt / 1000)}:d>\n${entry.reason}`).join("\n\n").slice(0, 4000)
      : "No moderation cases recorded.";
    const embed = new EmbedBuilder()
      .setColor(0x7188a0)
      .setTitle(`Moderation History · ${user.tag}`)
      .setDescription(description)
      .addFields(
        { name: "Total Cases", value: String(cases.length), inline: true },
        { name: "Warnings", value: String(warnings), inline: true },
        { name: "Strikes", value: String(strikes), inline: true },
      )
      .setThumbnail(user.displayAvatarURL())
      .setFooter({ text: recent.length < cases.length ? `Showing 10 of ${cases.length} cases` : `Showing ${cases.length} case(s)` });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
