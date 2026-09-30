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

  if (settings.serverLogChannelId) {
    if (botMember.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
      result.passed.push("Grey Ghost has **View Audit Log** to identify who changed channels and permissions.");
    } else {
      result.warnings.push("Grant Grey Ghost **View Audit Log** to identify who changed channels and permissions. Events will still be logged without it.");
    }
  }

  const channelSettings: Array<[string, string | undefined]> = [
    ["Welcome channel", settings.welcomeChannelId],
    ["Join/leave log", settings.logChannelId],
    ["Petitions channel", settings.governance?.petitionChannelId ?? settings.suggestionChannelId],
    ["Council proposals channel", settings.governance?.councilChannelId],
    ["Staff applications channel", settings.governance?.staffApplicationChannelId],
    ["Collection announcements", settings.collectionAnnouncementChannelId],
    ["Server logs", settings.serverLogChannelId],
    ["Reliability logs", settings.reliabilityLogChannelId],
    ["Reaction logs", settings.reactionLogChannelId],
    ["Statistics dashboard", settings.statsChannelId],
    ["Chronicles channel", settings.chronicleChannelId],
    ["Level-up announcements", settings.levelAnnouncementChannelId],
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
    if (label === "Petitions channel") required.push(PermissionFlagsBits.AttachFiles);

    const missing = required.filter((permission) => !permissions?.has(permission));
    if (missing.length) {
      result.errors.push(`${label} does not grant Grey Ghost all required channel permissions.`);
    } else {
      result.passed.push(`${label} is reachable and writable.`);
    }
  }

  if (settings.governance) {
    const councilRole = guild.roles.cache.get(settings.governance.councilRoleId);
    if (!councilRole) result.errors.push("The configured council/staff voting role was deleted.");
    else if (councilRole.id === guild.roles.everyone.id) result.errors.push("The council/staff voting role cannot be @everyone.");
    else result.passed.push("The council/staff voting role is available.");
  } else {
    result.warnings.push("Petitions, council proposals, and staff applications are not configured.");
  }



  if (settings.ownerRoleId) {
    const ownerRole = guild.roles.cache.get(settings.ownerRoleId);
    if (!ownerRole) result.errors.push("The configured owner role was deleted.");
    else if (ownerRole.id === guild.roles.everyone.id) result.errors.push("The owner role cannot be @everyone.");
    else result.passed.push("The owner-only modmail role is available.");
  } else {
    result.warnings.push("Owner-only modmail tickets are unavailable until an owner role is configured.");
  }

  if (!settings.eventAnnouncementChannelId) result.warnings.push("Event announcement channel is not configured.");
  else {
    const eventChannel = guild.channels.cache.get(settings.eventAnnouncementChannelId);
    if (!eventChannel) result.errors.push("The configured event announcement channel was deleted.");
    else if (!eventChannel.isTextBased()) result.errors.push("The configured event announcement channel is not a text channel.");
    else result.passed.push("The event announcement channel is available.");
  }

  const eventChatId = settings.eventChatChannelId ?? settings.eventChannelId;
  if (!eventChatId) result.warnings.push("Event chat is not configured.");
  else {
    const eventChat = guild.channels.cache.get(eventChatId);
    if (!eventChat) result.errors.push("The configured event chat was deleted.");
    else if (!eventChat.isTextBased()) result.errors.push("The configured event chat is not a text channel.");
    else result.passed.push("The event chat is available.");
  }

  for (const [label, roleId] of [["Champions role", settings.championsRoleId], ["Tourney Summons role", settings.tourneySummonsRoleId]] as const) {
    if (!roleId) {
      result.warnings.push(`${label} is not configured.`);
      continue;
    }
    const role = guild.roles.cache.get(roleId);
    if (!role) result.errors.push(`${label} was deleted.`);
    else if (label === "Champions role" && !role.editable) result.errors.push(`Grey Ghost cannot assign ${role}. Move Grey Ghost's role above it.`);
    else result.passed.push(`${label} is available.`);
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

  if (settings.moderatorRoleId) {
    const role = guild.roles.cache.get(settings.moderatorRoleId);
    if (!role) result.errors.push("The configured moderator role was deleted.");
    else result.passed.push("The moderator role is available.");
  } else result.warnings.push("The moderator role is not configured.");

  if (settings.trialModeratorRoleId) {
    const role = guild.roles.cache.get(settings.trialModeratorRoleId);
    if (!role) result.errors.push("The configured trial moderator role was deleted.");
    else result.passed.push("The trial moderator role is available.");
  } else result.warnings.push("The trial moderator role is not configured.");

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
