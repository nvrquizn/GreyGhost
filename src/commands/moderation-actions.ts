import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import type { Command } from "../types/command.js";
import {
  auditReason,
  beginCase,
  caseLabel,
  formatDuration,
  memberActionError,
  parseDuration,
  recordModerationCase,
  requireModerationSetup,
  sendModerationDM,
} from "../moderation/service.js";

async function requireSetup(interaction: ChatInputCommandInteraction<"cached">): Promise<boolean> {
  if (await requireModerationSetup(interaction.guildId)) return true;
  await interaction.reply({
    content: "Moderation logs are not configured. A server manager must run `/setup moderation` first.",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

async function replyError(interaction: ChatInputCommandInteraction<"cached">, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

export const warnCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Issue a recorded warning to a member.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("member").setDescription("The member to warn.").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Why the warning is being issued.").setMaxLength(400).setRequired(true))
    .addAttachmentOption((option) => option.setName("evidence").setDescription("Optional supporting evidence."))
    .addStringOption((option) => option.setName("rule").setDescription("Optional server rule or law reference.").setMaxLength(120)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const target = interaction.options.getMember("member") as GuildMember | null;
    if (!target) return replyError(interaction, "That member is no longer in the server.");
    const error = memberActionError(interaction.member, target, "warn");
    if (error) return replyError(interaction, error);
    const reason = interaction.options.getString("reason", true);
    const evidence = interaction.options.getAttachment("evidence");
    const rule = interaction.options.getString("rule") ?? undefined;
    const id = await beginCase(interaction.guildId);
    const dmDelivered = await sendModerationDM(interaction.guild, target.user, "warn", id, reason);
    await recordModerationCase(interaction.guild, { id, action: "warn", target: target.user, moderatorId: interaction.user.id, reason, rule, evidenceUrl: evidence?.url, dmDelivered });
    await interaction.reply({ content: `${target} received warning **${caseLabel(id)}**.${dmDelivered ? "" : " Their DMs were closed, so the notice could not be delivered."}`, flags: MessageFlags.Ephemeral });
  },
};

export const strikeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("strike")
    .setDescription("Issue a recorded strike to a member.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("member").setDescription("The member to strike.").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Why the strike is being issued.").setMaxLength(400).setRequired(true))
    .addAttachmentOption((option) => option.setName("evidence").setDescription("Optional supporting evidence."))
    .addStringOption((option) => option.setName("rule").setDescription("Optional server rule or law reference.").setMaxLength(120)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const target = interaction.options.getMember("member") as GuildMember | null;
    if (!target) return replyError(interaction, "That member is no longer in the server.");
    const error = memberActionError(interaction.member, target, "warn");
    if (error) return replyError(interaction, error);
    const reason = interaction.options.getString("reason", true);
    const evidence = interaction.options.getAttachment("evidence");
    const rule = interaction.options.getString("rule") ?? undefined;
    const id = await beginCase(interaction.guildId);
    const dmDelivered = await sendModerationDM(interaction.guild, target.user, "strike", id, reason);
    await recordModerationCase(interaction.guild, { id, action: "strike", target: target.user, moderatorId: interaction.user.id, reason, rule, evidenceUrl: evidence?.url, dmDelivered });
    await interaction.reply({ content: `${target} received strike **${caseLabel(id)}**.${dmDelivered ? "" : " Their DMs were closed, so the notice could not be delivered."}`, flags: MessageFlags.Ephemeral });
  },
};

export const timeoutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Temporarily prevent a member from interacting.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("member").setDescription("The member to timeout.").setRequired(true))
    .addStringOption((option) => option.setName("duration").setDescription("Examples: 30m, 2h, 7d, or 4w (maximum 28 days).").setMaxLength(8).setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Why the timeout is being applied.").setMaxLength(400).setRequired(true))
    .addAttachmentOption((option) => option.setName("evidence").setDescription("Optional supporting evidence."))
    .addStringOption((option) => option.setName("rule").setDescription("Optional server rule or law reference.").setMaxLength(120)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const target = interaction.options.getMember("member") as GuildMember | null;
    if (!target) return replyError(interaction, "That member is no longer in the server.");
    const error = memberActionError(interaction.member, target, "moderate");
    if (error) return replyError(interaction, error);
    const rawDuration = interaction.options.getString("duration", true);
    const durationMs = parseDuration(rawDuration);
    if (!durationMs) return replyError(interaction, "Use a duration such as `30m`, `2h`, `7d`, or `4w`. The maximum is 28 days.");
    const reason = interaction.options.getString("reason", true);
    const evidence = interaction.options.getAttachment("evidence");
    const rule = interaction.options.getString("rule") ?? undefined;
    const id = await beginCase(interaction.guildId);
    await target.timeout(durationMs, auditReason(id, interaction.user.tag, reason));
    const dmDelivered = await sendModerationDM(interaction.guild, target.user, "timeout", id, reason, durationMs);
    await recordModerationCase(interaction.guild, { id, action: "timeout", target: target.user, moderatorId: interaction.user.id, reason, rule, evidenceUrl: evidence?.url, durationMs, dmDelivered });
    await interaction.reply({ content: `${target} was timed out for **${formatDuration(durationMs)}**. Case **${caseLabel(id)}**.${dmDelivered ? "" : " Their DMs were closed."}`, flags: MessageFlags.Ephemeral });
  },
};

export const untimeoutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a member's active timeout.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("member").setDescription("The member whose timeout will be removed.").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Why the timeout is being removed.").setMaxLength(400).setRequired(true)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const target = interaction.options.getMember("member") as GuildMember | null;
    if (!target) return replyError(interaction, "That member is no longer in the server.");
    const error = memberActionError(interaction.member, target, "moderate");
    if (error) return replyError(interaction, error);
    if (!target.isCommunicationDisabled()) return replyError(interaction, "That member is not currently timed out.");
    const reason = interaction.options.getString("reason", true);
    const id = await beginCase(interaction.guildId);
    await target.timeout(null, auditReason(id, interaction.user.tag, reason));
    const dmDelivered = await sendModerationDM(interaction.guild, target.user, "untimeout", id, reason);
    await recordModerationCase(interaction.guild, { id, action: "untimeout", target: target.user, moderatorId: interaction.user.id, reason, dmDelivered });
    await interaction.reply({ content: `${target}'s timeout was removed. Case **${caseLabel(id)}**.`, flags: MessageFlags.Ephemeral });
  },
};

export const kickCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Remove a member from the server without banning them.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName("member").setDescription("The member to kick.").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Why the member is being kicked.").setMaxLength(400).setRequired(true))
    .addAttachmentOption((option) => option.setName("evidence").setDescription("Optional supporting evidence."))
    .addStringOption((option) => option.setName("rule").setDescription("Optional server rule or law reference.").setMaxLength(120)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const target = interaction.options.getMember("member") as GuildMember | null;
    if (!target) return replyError(interaction, "That member is no longer in the server.");
    const error = memberActionError(interaction.member, target, "kick");
    if (error) return replyError(interaction, error);
    const reason = interaction.options.getString("reason", true);
    const evidence = interaction.options.getAttachment("evidence");
    const rule = interaction.options.getString("rule") ?? undefined;
    const id = await beginCase(interaction.guildId);
    await target.kick(auditReason(id, interaction.user.tag, reason));
    const dmDelivered = await sendModerationDM(interaction.guild, target.user, "kick", id, reason);
    await recordModerationCase(interaction.guild, { id, action: "kick", target: target.user, moderatorId: interaction.user.id, reason, rule, evidenceUrl: evidence?.url, dmDelivered });
    await interaction.reply({ content: `${target.user.tag} was kicked. Case **${caseLabel(id)}**.${dmDelivered ? "" : " Their DMs were closed."}`, flags: MessageFlags.Ephemeral });
  },
};

export const banCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName("user").setDescription("The user to ban.").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Why the user is being banned.").setMaxLength(400).setRequired(true))
    .addIntegerOption((option) => option.setName("delete-messages").setDescription("How much recent message history to delete.").addChoices(
      { name: "Do not delete", value: 0 },
      { name: "Previous hour", value: 3600 },
      { name: "Previous 6 hours", value: 21600 },
      { name: "Previous 12 hours", value: 43200 },
      { name: "Previous day", value: 86400 },
      { name: "Previous 3 days", value: 259200 },
      { name: "Previous 7 days", value: 604800 },
    ))
    .addAttachmentOption((option) => option.setName("evidence").setDescription("Optional supporting evidence."))
    .addStringOption((option) => option.setName("rule").setDescription("Optional server rule or law reference.").setMaxLength(120)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const target = interaction.options.getUser("user", true);
    if (target.id === interaction.user.id) return replyError(interaction, "You cannot ban yourself.");
    if (target.id === interaction.guild.ownerId) return replyError(interaction, "The server owner cannot be banned.");
    if (target.id === interaction.client.user.id) return replyError(interaction, "Grey Ghost refuses to ban itself into the mist.");
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      const error = memberActionError(interaction.member, member, "ban");
      if (error) return replyError(interaction, error);
    }
    const reason = interaction.options.getString("reason", true);
    const evidence = interaction.options.getAttachment("evidence");
    const rule = interaction.options.getString("rule") ?? undefined;
    const deleteMessageSeconds = interaction.options.getInteger("delete-messages") ?? 0;
    const id = await beginCase(interaction.guildId);
    await interaction.guild.members.ban(target, { deleteMessageSeconds, reason: auditReason(id, interaction.user.tag, reason) });
    const dmDelivered = await sendModerationDM(interaction.guild, target, "ban", id, reason);
    await recordModerationCase(interaction.guild, { id, action: "ban", target, moderatorId: interaction.user.id, reason, rule, evidenceUrl: evidence?.url, dmDelivered });
    await interaction.reply({ content: `${target.tag} was banned. Case **${caseLabel(id)}**.${dmDelivered ? "" : " Their DMs were closed."}`, flags: MessageFlags.Ephemeral });
  },
};

export const softbanCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("softban")
    .setDescription("Ban then immediately unban a member, deleting up to 7 days of recent messages.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName("user").setDescription("The user to softban.").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Why the user is being softbanned.").setMaxLength(400).setRequired(true))
    .addAttachmentOption((option) => option.setName("evidence").setDescription("Optional supporting evidence."))
    .addStringOption((option) => option.setName("rule").setDescription("Optional server rule or law reference.").setMaxLength(120)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const target = interaction.options.getUser("user", true);
    if (target.id === interaction.user.id) return replyError(interaction, "You cannot softban yourself.");
    if (target.id === interaction.guild.ownerId) return replyError(interaction, "The server owner cannot be softbanned.");
    if (target.id === interaction.client.user.id) return replyError(interaction, "Grey Ghost refuses to softban itself into the mist.");
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      const error = memberActionError(interaction.member, member, "ban");
      if (error) return replyError(interaction, error);
    }
    const reason = interaction.options.getString("reason", true);
    const evidence = interaction.options.getAttachment("evidence");
    const rule = interaction.options.getString("rule") ?? undefined;
    const id = await beginCase(interaction.guildId);
    const dmDelivered = await sendModerationDM(interaction.guild, target, "softban", id, reason);
    await interaction.guild.members.ban(target, { deleteMessageSeconds: 604800, reason: auditReason(id, interaction.user.tag, reason) });
    await interaction.guild.members.unban(target.id, auditReason(id, interaction.user.tag, `Softban completed: ${reason}`));
    await recordModerationCase(interaction.guild, { id, action: "softban", target, moderatorId: interaction.user.id, reason, rule, evidenceUrl: evidence?.url, dmDelivered });
    await interaction.reply({ content: `${target.tag} was softbanned and may rejoin. Recent messages (up to 7 days) were removed. Case **${caseLabel(id)}**.${dmDelivered ? "" : " Their DMs were closed."}`, flags: MessageFlags.Ephemeral });
  },
};

export const unbanCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Remove a user's server ban by user ID.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) => option.setName("user-id").setDescription("The banned user's Discord ID.").setMinLength(17).setMaxLength(20).setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Why the ban is being removed.").setMaxLength(400).setRequired(true)),
  async execute(interaction) {
    if (!interaction.inCachedGuild() || !(await requireSetup(interaction))) return;
    const userId = interaction.options.getString("user-id", true);
    if (!/^\d{17,20}$/.test(userId)) return replyError(interaction, "Enter a valid Discord user ID.");
    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return replyError(interaction, "That user is not currently banned.");
    const reason = interaction.options.getString("reason", true);
    const id = await beginCase(interaction.guildId);
    await interaction.guild.members.unban(userId, auditReason(id, interaction.user.tag, reason));
    const dmDelivered = await sendModerationDM(interaction.guild, ban.user, "unban", id, reason);
    await recordModerationCase(interaction.guild, { id, action: "unban", target: ban.user, moderatorId: interaction.user.id, reason, dmDelivered });
    await interaction.reply({ content: `${ban.user.tag} was unbanned. Case **${caseLabel(id)}**.`, flags: MessageFlags.Ephemeral });
  },
};
