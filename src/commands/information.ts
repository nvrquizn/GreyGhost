import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  type GuildMember,
  type Role,
} from "discord.js";
import type { Command } from "../types/command.js";

const PAGE_SIZE = 20;

function pageSlice<T>(values: T[], requestedPage: number): { entries: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(values.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pages);
  return { entries: values.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages };
}

function memberLine(member: GuildMember): string {
  return `${member.user.bot ? "🤖 " : ""}${member.displayName} · \`${member.id}\``;
}

export const userInfoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View information about a server member.")
    .setDMPermission(false)
    .addUserOption((option) => option
      .setName("member")
      .setDescription("The member to inspect; defaults to you.")),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const selected = interaction.options.getUser("member") ?? interaction.user;
    const member = await interaction.guild.members.fetch(selected.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "That user is not currently in this server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const roles = member.roles.cache
      .filter((role) => role.id !== interaction.guildId)
      .sort((left, right) => right.position - left.position)
      .map((role) => role.toString());
    const roleText = roles.length ? roles.join(" ").slice(0, 1024) : "No assigned roles";
    const embed = new EmbedBuilder()
      .setColor(member.displayColor || 0x87ceeb)
      .setAuthor({ name: member.user.tag, iconURL: member.displayAvatarURL() })
      .setTitle(member.displayName)
      .setThumbnail(member.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "User ID", value: `\`${member.id}\``, inline: true },
        { name: "Account type", value: member.user.bot ? "Bot" : "Member", inline: true },
        { name: "Account created", value: `${time(member.user.createdAt, TimestampStyles.LongDateTime)}\n${time(member.user.createdAt, TimestampStyles.RelativeTime)}`, inline: true },
        { name: "Joined the server", value: member.joinedAt ? `${time(member.joinedAt, TimestampStyles.LongDateTime)}\n${time(member.joinedAt, TimestampStyles.RelativeTime)}` : "Unknown", inline: true },
        { name: "Server boosting", value: member.premiumSince ? `Since ${time(member.premiumSince, TimestampStyles.LongDate)}` : "Not currently boosting", inline: true },
        { name: `Roles · ${roles.length}`, value: roleText },
      )
      .setFooter({ text: `Highest role: ${member.roles.highest.name}` })
      .setTimestamp();
    if (
      interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)
      && member.communicationDisabledUntil
      && member.communicationDisabledUntil.getTime() > Date.now()
    ) {
      embed.addFields({ name: "Timed out until", value: time(member.communicationDisabledUntil, TimestampStyles.LongDateTime) });
    }
    await interaction.reply({ embeds: [embed] });
  },
};

export const serverInfoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View information about this Discord server.")
    .setDMPermission(false),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferReply();
    const guild = interaction.guild;
    await guild.members.fetch();
    const owner = await guild.fetchOwner().catch(() => null);
    const people = guild.members.cache.filter((member) => !member.user.bot).size;
    const bots = guild.members.cache.filter((member) => member.user.bot).size;
    const channels = guild.channels.cache;
    const textChannels = channels.filter((channel) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type as ChannelType)).size;
    const voiceChannels = channels.filter((channel) => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type as ChannelType)).size;
    const forums = channels.filter((channel) => channel.type === ChannelType.GuildForum).size;
    const categories = channels.filter((channel) => channel.type === ChannelType.GuildCategory).size;
    const tier = ["None", "Tier 1", "Tier 2", "Tier 3"][guild.premiumTier] ?? `Tier ${guild.premiumTier}`;
    const verification = ["None", "Low", "Medium", "High", "Highest"][guild.verificationLevel] ?? "Unknown";
    const embed = new EmbedBuilder()
      .setColor(0x87ceeb)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setDescription(guild.description ?? "No server description has been set.")
      .addFields(
        { name: "Owner", value: owner ? `${owner} · \`${owner.id}\`` : `\`${guild.ownerId}\``, inline: true },
        { name: "Server ID", value: `\`${guild.id}\``, inline: true },
        { name: "Created", value: `${time(guild.createdAt, TimestampStyles.LongDateTime)}\n${time(guild.createdAt, TimestampStyles.RelativeTime)}`, inline: true },
        { name: `Members · ${guild.memberCount}`, value: `${people} people\n${bots} bots`, inline: true },
        { name: `Channels · ${channels.size}`, value: `${textChannels} text · ${voiceChannels} voice/stage\n${forums} forum · ${categories} categories`, inline: true },
        { name: "Community", value: `${guild.roles.cache.size - 1} roles\n${guild.emojis.cache.size} emojis · ${guild.stickers.cache.size} stickers`, inline: true },
        { name: "Boosts", value: `${guild.premiumSubscriptionCount ?? 0} boosts · ${tier}`, inline: true },
        { name: "Verification", value: verification, inline: true },
      )
      .setTimestamp();
    const banner = guild.bannerURL({ size: 1024 });
    if (banner) embed.setImage(banner);
    await interaction.editReply({ embeds: [embed] });
  },
};

export const roleMembersCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("rolemembers")
    .setDescription("List the members who have a selected role.")
    .setDMPermission(false)
    .addRoleOption((option) => option.setName("role").setDescription("The role to inspect.").setRequired(true))
    .addIntegerOption((option) => option.setName("page").setDescription("The results page.").setMinValue(1)),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.guild.members.fetch();
    const role = interaction.options.getRole("role", true) as Role;
    const members = [...role.members.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
    const result = pageSlice(members, interaction.options.getInteger("page") ?? 1);
    const description = result.entries.length ? result.entries.map(memberLine).join("\n") : "No members currently have this role.";
    await interaction.editReply({ embeds: [new EmbedBuilder()
      .setColor(role.color || 0x87ceeb)
      .setTitle(`${role.name} · ${members.length} member${members.length === 1 ? "" : "s"}`)
      .setDescription(description)
      .setFooter({ text: `Page ${result.page}/${result.pages} · Role ID: ${role.id}` })] });
  },
};

const PERMISSIONS = [
  ["Administrator", "administrator", PermissionFlagsBits.Administrator],
  ["Manage Server", "manage-server", PermissionFlagsBits.ManageGuild],
  ["Manage Channels", "manage-channels", PermissionFlagsBits.ManageChannels],
  ["Manage Roles", "manage-roles", PermissionFlagsBits.ManageRoles],
  ["Manage Messages", "manage-messages", PermissionFlagsBits.ManageMessages],
  ["Manage Threads", "manage-threads", PermissionFlagsBits.ManageThreads],
  ["Manage Events", "manage-events", PermissionFlagsBits.ManageEvents],
  ["Manage Nicknames", "manage-nicknames", PermissionFlagsBits.ManageNicknames],
  ["Moderate Members", "moderate-members", PermissionFlagsBits.ModerateMembers],
  ["Kick Members", "kick-members", PermissionFlagsBits.KickMembers],
  ["Ban Members", "ban-members", PermissionFlagsBits.BanMembers],
  ["View Audit Log", "view-audit-log", PermissionFlagsBits.ViewAuditLog],
] as const;

export const whoHasCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("whohas")
    .setDescription("List members who have a selected Discord permission.")
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName("permission")
      .setDescription("The permission to inspect.")
      .setRequired(true)
      .addChoices(...PERMISSIONS.map(([name, value]) => ({ name, value }))))
    .addIntegerOption((option) => option.setName("page").setDescription("The results page.").setMinValue(1)),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const permissionName = interaction.options.getString("permission", true);
    const selected = PERMISSIONS.find(([, value]) => value === permissionName);
    if (!selected) {
      await interaction.editReply("That permission is not available.");
      return;
    }
    await interaction.guild.members.fetch();
    const members = [...interaction.guild.members.cache.values()]
      .filter((member) => member.permissions.has(selected[2]))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
    const result = pageSlice(members, interaction.options.getInteger("page") ?? 1);
    await interaction.editReply({ embeds: [new EmbedBuilder()
      .setColor(0x87ceeb)
      .setTitle(`${selected[0]} · ${members.length} member${members.length === 1 ? "" : "s"}`)
      .setDescription(result.entries.length ? result.entries.map(memberLine).join("\n") : "No members currently have this permission.")
      .setFooter({ text: `Page ${result.page}/${result.pages} · Includes permissions inherited through roles` })] });
  },
};
