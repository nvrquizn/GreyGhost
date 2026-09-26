import type { Guild, GuildMember, PartialGuildMember } from "discord.js";
import { getGuildSettings } from "../services/guild-settings.js";

export const MODERATION_COMMAND_NAMES = new Set([
  "warn",
  "strike",
  "timeout",
  "untimeout",
  "kick",
  "ban",
  "unban",
  "moderation",
  "purge",
  "slowmode",
  "lock",
  "unlock",
  "modmail",
]);

export async function configuredModeratorRoleId(guildId: string, guild?: Guild): Promise<string | undefined> {
  const settings = await getGuildSettings(guildId);
  if (settings.moderatorRoleId) return settings.moderatorRoleId;
  return guild?.roles.cache.find((role) => role.name.toLowerCase() === "dragonrider")?.id;
}

export async function hasRequiredModeratorRole(
  guildId: string,
  member: GuildMember | PartialGuildMember,
): Promise<boolean> {
  const roleId = await configuredModeratorRoleId(guildId, member.guild);
  return Boolean(roleId && member.roles.cache.has(roleId));
}

export async function moderatorRoleRequirementText(guildId: string, guild: Guild): Promise<string> {
  const roleId = await configuredModeratorRoleId(guildId, guild);
  return roleId
    ? `You must have <@&${roleId}> to use that command.`
    : "Grey Ghost's moderator role has not been configured. A server manager must run `/setup moderator-role role:@Dragonrider`.";
}
