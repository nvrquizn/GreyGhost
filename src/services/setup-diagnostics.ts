import { ChannelType, PermissionFlagsBits, type Guild } from "discord.js";
import { getGuildSettings } from "./guild-settings.js";

export interface SetupDiagnostics {
  passed: string[];
  warnings: string[];
  errors: string[];
}

export async function diagnoseGuildSetup(guild: Guild): Promise<SetupDiagnostics> {
  const result: SetupDiagnostics = { passed: [], warnings: [], errors: [] };
  const settings = await getGuildSettings(guild.id);
  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));

  if (!botMember) {
    result.errors.push("Grey Ghost could not inspect its own server membership.");
    return result;
  }

  if (botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    result.passed.push("Grey Ghost has **Manage Roles**.");
  } else {
    result.errors.push("Grey Ghost needs **Manage Roles** for newcomer, self, and title roles.");
  }

  if (botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    result.passed.push("Grey Ghost has **Manage Channels** for modmail tickets.");
  } else if (settings.modmail) {
    result.errors.push("Grey Ghost needs **Manage Channels** to create and archive modmail tickets.");
  }

  const channelSettings: Array<[string, string | undefined]> = [
    ["Welcome channel", settings.welcomeChannelId],
    ["Join/leave log", settings.logChannelId],
    ["Suggestions channel", settings.suggestionChannelId],
    ["Collection announcements", settings.collectionAnnouncementChannelId],
    ["Reaction log", settings.reactionLogChannelId],
    ["Statistics dashboard", settings.statsChannelId],
  ];

  for (const [label, channelId] of channelSettings) {
    if (!channelId) {
      result.warnings.push(`${label} is not configured.`);
      continue;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      result.errors.push(`${label} points to a missing or non-text channel.`);
      continue;
    }

    const permissions = channel.permissionsFor(botMember);
    const required = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ];
    if (label === "Suggestions channel") required.push(PermissionFlagsBits.AttachFiles);

    const missing = required.filter((permission) => !permissions?.has(permission));
    if (missing.length) {
      result.errors.push(`${label} does not grant Grey Ghost all required channel permissions.`);
    } else {
      result.passed.push(`${label} is reachable and writable.`);
    }
  }

  if (!settings.newcomerRoleId) {
    result.warnings.push("The newcomer role is not configured.");
  } else {
    const role = guild.roles.cache.get(settings.newcomerRoleId);
    if (!role) result.errors.push("The configured newcomer role was deleted.");
    else if (!role.editable) result.errors.push(`Grey Ghost cannot assign the newcomer role ${role}.`);
    else result.passed.push("The newcomer role is assignable.");
  }

  for (const panel of Object.values(settings.selfRolePanels ?? {})) {
    const missingRoles = panel.roles.filter((entry) => !guild.roles.cache.has(entry.roleId));
    const blockedRoles = panel.roles.filter((entry) => {
      const role = guild.roles.cache.get(entry.roleId);
      return role && !role.editable;
    });

    if (missingRoles.length) {
      result.errors.push(`**${panel.title}** contains ${missingRoles.length} deleted role(s).`);
    }
    if (blockedRoles.length) {
      result.errors.push(`**${panel.title}** contains ${blockedRoles.length} unassignable role(s).`);
    }
    if (!missingRoles.length && !blockedRoles.length) {
      result.passed.push(`**${panel.title}** has ${panel.roles.length} usable role(s).`);
    }

    if (panel.channelId && panel.messageId) {
      const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
      if (!channel?.isTextBased() || !("messages" in channel)) {
        result.warnings.push(`The published **${panel.title}** channel is unavailable.`);
      } else {
        const message = await channel.messages.fetch(panel.messageId).catch(() => null);
        if (!message) result.warnings.push(`The published **${panel.title}** message was deleted.`);
      }
    } else {
      result.warnings.push(`**${panel.title}** is configured but has not been published.`);
    }
  }

  for (const collectionSet of Object.values(settings.collectionSets ?? {})) {
    const titleRole = guild.roles.cache.get(collectionSet.titleRoleId);
    const missingRequirements = collectionSet.requirementRoleIds.filter(
      (roleId) => !guild.roles.cache.has(roleId),
    );

    if (!titleRole) result.errors.push(`**${collectionSet.name}** has a deleted title role.`);
    else if (!titleRole.editable) {
      result.errors.push(`Grey Ghost cannot assign the title role ${titleRole}.`);
    }
    if (missingRequirements.length) {
      result.errors.push(
        `**${collectionSet.name}** contains ${missingRequirements.length} deleted requirement role(s).`,
      );
    }
    if (titleRole?.editable && !missingRequirements.length) {
      result.passed.push(`**${collectionSet.name}** is ready (${collectionSet.requiredCount} required).`);
    }
  }

  if (!settings.modmail) {
    result.warnings.push("Modmail is not configured.");
  } else {
    const category = await guild.channels.fetch(settings.modmail.categoryId).catch(() => null);
    const logChannel = await guild.channels.fetch(settings.modmail.logChannelId).catch(() => null);
    const staffRole = guild.roles.cache.get(settings.modmail.staffRoleId);
    if (!category || category.type !== ChannelType.GuildCategory) result.errors.push("The configured modmail ticket category is missing.");
    else result.passed.push("The modmail ticket category is available.");
    if (!staffRole) result.errors.push("The configured modmail staff role was deleted.");
    else result.passed.push("The modmail staff role is available.");
    if (!logChannel?.isTextBased()) result.errors.push("The configured modmail log channel is missing or invalid.");
    else {
      const permissions = logChannel.permissionsFor(botMember);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks])) {
        result.errors.push("Grey Ghost cannot send transcript files and embeds in the modmail log channel.");
      } else result.passed.push("The modmail transcript channel is writable.");
    }
  }

  if (!settings.moderation) {
    result.warnings.push("Moderation case logging is not configured.");
  } else {
    const channel = await guild.channels.fetch(settings.moderation.logChannelId).catch(() => null);
    if (!channel?.isTextBased()) result.errors.push("The configured moderation log channel is missing or invalid.");
    else {
      const permissions = channel.permissionsFor(botMember);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        result.errors.push("Grey Ghost cannot send embeds in the moderation log channel.");
      } else result.passed.push("The moderation log channel is writable.");
    }
  }

  const moderationPermissions = [
    [PermissionFlagsBits.ModerateMembers, "Moderate Members"],
    [PermissionFlagsBits.KickMembers, "Kick Members"],
    [PermissionFlagsBits.BanMembers, "Ban Members"],
    [PermissionFlagsBits.ManageMessages, "Manage Messages"],
    [PermissionFlagsBits.ManageChannels, "Manage Channels"],
  ] as const;
  for (const [permission, label] of moderationPermissions) {
    if (botMember.permissions.has(permission)) result.passed.push(`Grey Ghost has **${label}**.`);
    else if (settings.moderation) result.errors.push(`Grey Ghost needs **${label}** for its moderation commands.`);
  }

  return result;
}
